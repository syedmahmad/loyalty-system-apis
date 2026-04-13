import {
  Injectable,
  BadRequestException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as https from 'https';
import * as fs from 'fs';
import * as tls from 'tls';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import { TenantPartnerIntegration } from 'src/tenant-integrations/entities/tenant-partner-integration.entity';
import { TenantPartnerTerminal } from 'src/tenant-partner-terminals/entities/tenant-partner-terminal.entity';
import { Customer } from 'src/customers/entities/customer.entity';
import { QitafConfig } from 'src/tenant-integrations/interfaces/qitaf-config.interface';
import {
  QitafTransaction,
  QitafTransactionStatus,
  QitafTransactionType,
} from './entities/qitaf-transaction.entity';
import { decrypt } from 'src/helpers/encryption';
import {
  RedemptionOtpDto,
  RedemptionRedeemDto,
  RedemptionReverseDto,
  EarnRewardDto,
  EarnRewardIncentiveDto,
  EarnUpdateDto,
  EarnRewardStatusDto,
} from './dto/qitaf.dto';

// Enable dayjs timezone support so we can output KSA time
dayjs.extend(utc);
dayjs.extend(timezone);

// ─────────────────────────────────────────────────────────────────────────────
// STC-MANDATED CONSTANTS  ← Do NOT change these; they are from the STC spec
// ─────────────────────────────────────────────────────────────────────────────

/** Every STC API call must complete within 60 seconds or we treat it as failed */
const STC_TIMEOUT_MS = 60_000;

/**
 * STC error codes that need special handling per the spec:
 * - On Redeem: codes 1, 2310, 2311 or timeout → must auto-reverse
 * - On Reward / Update: code 2311 or timeout → must retry
 */
const REDEEM_AUTO_REVERSE_CODES = ['1', '2310', '2311'];
const RETRY_ERROR_CODE = '2311';

/** Max retry attempts for Update Reward before giving up (STC says "retry until success") */
const UPDATE_MAX_RETRIES = 5;

/** Pause between Update Reward retries to avoid hammering STC */
const UPDATE_RETRY_DELAY_MS = 2_000;

@Injectable()
export class QitafService {
  private readonly logger = new Logger(QitafService.name);

  /**
   * Shared HTTPS agent with mTLS certificates.
   * Built ONCE at startup and reused for every STC API call.
   *
   * mTLS (mutual TLS) means:
   *   - We send our client cert so STC can verify WHO we are
   *   - We verify STC's server cert using their CA chain so we know we're
   *     talking to the real STC server (not a man-in-the-middle)
   */
  private readonly httpsAgent: https.Agent;

  constructor(
    @InjectRepository(TenantPartnerIntegration)
    private integrationRepo: Repository<TenantPartnerIntegration>,

    @InjectRepository(TenantPartnerTerminal)
    private terminalRepo: Repository<TenantPartnerTerminal>,

    @InjectRepository(QitafTransaction)
    private transactionRepo: Repository<QitafTransaction>,

    @InjectRepository(Customer)
    private customerRepo: Repository<Customer>,
  ) {
    const certPath = path.resolve(process.env.QITAF_SSL_CERT || '');
    const keyPath = path.resolve(process.env.QITAF_SSL_KEY || '');
    const caPath = path.resolve(process.env.QITAF_SSL_CA || '');

    // QITAF_SSL_VERIFY=false disables server cert verification — local dev only.
    // UAT and production must NOT set this (defaults to true = full verification).
    // Determine if SSL certificate verification should be enabled.
    // If QITAF_SSL_VERIFY is set to "false" in the environment, disable verification (for local/dev only).
    // In all other cases (including unset), verification is enabled for safety in UAT/production.
    // we don't need to set this: QITAF_SSL_VERIFY in UAT/PROD.
    const sslVerify = process.env.QITAF_SSL_VERIFY !== 'false';

    // Build the CA bundle:
    //   - tls.rootCertificates: Node.js built-in root CAs (includes the CAs that
    //     signed STC's *server* certificate — present on macOS via the system keychain
    //     but NOT automatically available on Ubuntu/Linux servers, causing
    //     UNABLE_TO_GET_ISSUER_CERT_LOCALLY on UAT/production).
    //   - QITAF_SSL_CA file: STC's CA for mTLS client-certificate verification
    //     (lets STC verify that OUR client cert is legitimate).
    // Merging both ensures TLS server verification AND mTLS client auth both work
    // on all environments without disabling certificate checking.
    const stcCa = fs.readFileSync(caPath).toString();
    const ca = [...tls.rootCertificates, stcCa];

    this.httpsAgent = new https.Agent({
      cert: fs.readFileSync(certPath), // Our cert — proves our identity to STC (mTLS)
      key: fs.readFileSync(keyPath), // Our private key — paired with cert above
      ca, // Node root CAs (server cert chain) + STC CA (mTLS client auth)
      rejectUnauthorized: sslVerify, // false only when QITAF_SSL_VERIFY=false
    });

    this.logger.log('Qitaf mTLS HTTPS agent initialized');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. REQUEST OTP
  // Asks STC to send a 4-digit PIN via SMS to the customer's mobile number.
  // This PIN is required in the next step (Redeem) to confirm the transaction.
  // PIN is valid for 5 minutes.
  // Along with PIN, user will also get equivalent qitaf balance in SAR but this both
  // info, we will not get in API response.
  // ═══════════════════════════════════════════════════════════════════════════
  async requestOtp(
    tenantId: number,
    dto: RedemptionOtpDto,
    context?: { invoiceId?: string; transactionAmount?: number },
  ) {
    const { integration, config } = await this.loadIntegration(tenantId);
    const partnerId = integration.partner_id;
    await this.validateTerminal(tenantId, dto.BranchId, dto.TerminalId);

    const globalId = this.newGlobalId();
    const requestDate = this.ksaNow();

    // Payload exactly matches STC spec field names — no translation needed
    const payload = {
      Msisdn: dto.Msisdn,
      BranchId: dto.BranchId,
      TerminalId: dto.TerminalId,
      RequestDate: requestDate,
    };

    console.log('[Qitaf] OTP →', { globalId, tenantId, ...payload });

    try {
      const result = await this.callStc(
        'POST',
        `${config.apiBaseUrl}/api/v1/redemption/otp`,
        this.buildHeaders(config, globalId),
        payload,
      );
      console.log('[Qitaf] OTP ←', result);
      // Awaited — callers need the uuid to return as transaction_id
      const qtx = await this.logTransaction({
        tenantId,
        partnerId,
        msisdn: dto.Msisdn,
        transactionType: 'otp',
        globalId,
        branchId: dto.BranchId,
        terminalId: dto.TerminalId,
        amount: context?.transactionAmount,
        requestDate,
        status: 'success',
        stcResponse: result,
        invoiceId: context?.invoiceId,
      });
      return { ...result, globalId, requestDate, qitafTxUuid: qtx.uuid };
    } catch (err) {
      void this.logTransaction({
        tenantId,
        partnerId,
        msisdn: dto.Msisdn,
        transactionType: 'otp',
        globalId,
        branchId: dto.BranchId,
        terminalId: dto.TerminalId,
        requestDate,
        status: 'failed',
        stcError: err?.data ?? err,
        invoiceId: context?.invoiceId,
      }).catch((e) =>
        this.logger.error('[Qitaf] Failed to log transaction', e?.message),
      );
      this.throwForCaller(err, 'OTP');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. REDEEM QITAF POINTS  (Burn / Pay-with-points)
  // Deducts qitaf points from the customer's balance after PIN verification.
  //
  // ⚠ PROTOCOL (STC spec §2.2):
  //   If error code 1 / 2310 / 2311  OR  timeout (60s)
  //     → MUST automatically trigger Reverse right away
  //   If Reverse comes back with code 1040
  //     → STC already reversed it on their side — that's fine, no error
  // ═══════════════════════════════════════════════════════════════════════════
  async redeemPoints(
    tenantId: number,
    dto: RedemptionRedeemDto,
    context?: { invoiceId?: string },
  ) {
    const { integration, config } = await this.loadIntegration(tenantId);
    const partnerId = integration.partner_id;
    await this.validateTerminal(tenantId, dto.BranchId, dto.TerminalId);

    const globalId = this.newGlobalId();
    const requestDate = this.ksaNow();

    const payload = {
      Msisdn: dto.Msisdn,
      BranchId: dto.BranchId,
      TerminalId: dto.TerminalId,
      RequestDate: requestDate,
      PIN: dto.PIN,
      Amount: dto.Amount,
    };

    console.log('[Qitaf] Redeem →', {
      globalId,
      tenantId,
      msisdn: dto.Msisdn,
      amount: dto.Amount,
    });

    try {
      const result = await this.callStc(
        'POST',
        `${config.apiBaseUrl}/api/v1/redemption/redeem`,
        this.buildHeaders(config, globalId),
        payload,
      );
      console.log('[Qitaf] Redeem ← SUCCESS', result);
      // Awaited — callers need the uuid to return as transaction_id
      const qtx = await this.logTransaction({
        tenantId,
        partnerId,
        msisdn: dto.Msisdn,
        transactionType: 'redeem',
        globalId,
        branchId: dto.BranchId,
        terminalId: dto.TerminalId,
        amount: dto.Amount,
        requestDate,
        status: 'success',
        stcResponse: result,
        points: result?.PointsDeducted ?? result?.points ?? null,
        invoiceId: context?.invoiceId,
      });
      return { ...result, globalId, requestDate, qitafTxUuid: qtx.uuid };
    } catch (err) {
      const stcCode = this.extractStcCode(err);
      const mustReverse =
        err?.isTimeout ||
        (err?.isStcError && REDEEM_AUTO_REVERSE_CODES.includes(stcCode));

      if (mustReverse) {
        const reason = err?.isTimeout
          ? 'TIMEOUT (60s)'
          : `STC error code ${stcCode}`;
        console.warn(
          `[Qitaf] Redeem failed (${reason}) — auto-reversing. OriginalGlobalId: ${globalId}`,
        );

        void this.logTransaction({
          tenantId,
          partnerId,
          msisdn: dto.Msisdn,
          transactionType: 'redeem',
          globalId,
          branchId: dto.BranchId,
          terminalId: dto.TerminalId,
          amount: dto.Amount,
          requestDate,
          status: 'auto_reversed',
          stcError: err?.data ?? err,
          invoiceId: context?.invoiceId,
        }).catch((e) =>
          this.logger.error('[Qitaf] Failed to log transaction', e?.message),
        );

        // Pass originalGlobalId as RefRequestId so STC knows which transaction to cancel
        await this.executeReverse(
          config,
          tenantId,
          partnerId,
          dto.BranchId,
          dto.TerminalId,
          dto.Msisdn,
          globalId,
          requestDate,
        );

        throw new HttpException(
          {
            message: `Redemption failed (${reason}). Transaction automatically reversed.`,
            originalGlobalId: globalId,
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      void this.logTransaction({
        tenantId,
        partnerId,
        msisdn: dto.Msisdn,
        transactionType: 'redeem',
        globalId,
        branchId: dto.BranchId,
        terminalId: dto.TerminalId,
        amount: dto.Amount,
        requestDate,
        status: 'failed',
        stcError: err?.data ?? err,
        invoiceId: context?.invoiceId,
      }).catch((e) =>
        this.logger.error('[Qitaf] Failed to log transaction', e?.message),
      );
      this.throwForCaller(err, 'Redeem');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. REVERSE QITAF REDEEM  (Manual cancel/refund)
  // Cancels a previous successful Redeem transaction.
  // Use when cashier or customer wants to undo a redemption.
  // Note: auto-reverse on error is handled internally inside redeemPoints().
  // ═══════════════════════════════════════════════════════════════════════════
  async reverseRedeem(tenantId: number, dto: RedemptionReverseDto) {
    const { integration, config } = await this.loadIntegration(tenantId);
    const partnerId = integration.partner_id;
    await this.validateTerminal(tenantId, dto.BranchId, dto.TerminalId);

    const result = await this.executeReverse(
      config,
      tenantId,
      partnerId,
      dto.BranchId,
      dto.TerminalId,
      dto.Msisdn,
      dto.RefRequestId,
      dto.RefRequestDate,
    );

    return { ...result, message: 'Redemption reversed successfully' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3b. REVERSE BY MSISDN  (Cashier-friendly reverse — no UUID needed)
  //
  // Problem this solves:
  //   The manual reverse endpoint requires RefRequestId (a UUID) and
  //   RefRequestDate — values the cashier has no way of knowing.
  //
  // How it works:
  //   1. Cashier only provides the customer's phone (Msisdn), BranchId,
  //      TerminalId — things they already have at the counter.
  //   2. We look up our own qitaf_transactions table to find the most recent
  //      successful redeem for that Msisdn under this tenant.
  //   3. We pull global_id and request_date from that row and use them as
  //      RefRequestId and RefRequestDate for the STC reverse call.
  //   4. The actual STC reverse call is identical to the manual reverse.
  // ═══════════════════════════════════════════════════════════════════════════
  async reverseRedeemByMsisdn(
    tenantId: number,
    msisdn: number,
    branchId: string,
    terminalId: string,
  ) {
    const { integration, config } = await this.loadIntegration(tenantId);
    const partnerId = integration.partner_id;
    await this.validateTerminal(tenantId, branchId, terminalId);

    // Look up the last successful redeem for this customer under this tenant.
    // We order by created_at DESC so we always get the most recent one.
    const lastRedeem = await this.transactionRepo.findOne({
      where: {
        tenant_id: tenantId,
        msisdn: msisdn as any,
        transaction_type: 'redeem',
        status: 'success',
      },
      order: { created_at: 'DESC' },
    });

    // If no successful redeem exists for this customer, there is nothing to reverse.
    if (!lastRedeem) {
      throw new BadRequestException(
        `No successful redemption found for Msisdn ${msisdn} on this tenant. Nothing to reverse.`,
      );
    }

    this.logger.log(
      `[Qitaf] reverseRedeemByMsisdn — found last redeem ` +
        `globalId=${lastRedeem.global_id} date=${lastRedeem.request_date} ` +
        `for Msisdn=${msisdn}`,
    );

    // Delegate to the same executeReverse used by the manual reverse endpoint.
    // global_id  → becomes RefRequestId  (STC uses this to identify the original transaction)
    // request_date → becomes RefRequestDate (STC requires the original request timestamp)
    const result = await this.executeReverse(
      config,
      tenantId,
      partnerId,
      branchId,
      terminalId,
      msisdn,
      lastRedeem.global_id,
      lastRedeem.request_date,
    );

    return { ...result, message: 'Redemption reversed successfully' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. EARN REWARD  (Award points for purchase)
  // Awards qitaf points to the customer based on the purchase amount.
  // STC uses their configured SAR→points ratio. Response includes points awarded.
  //
  // ⚠ PROTOCOL (STC spec §2.4):
  //   Error 2311 or timeout → retry ONCE immediately:
  //     - Timeout: same GlobalId (STC uses it for idempotency — same transaction)
  //     - Error 2311: new GlobalId (STC requires fresh transaction ID)
  //   Both attempts fail → log for manual resend:
  //     - Max 4 total manual resends
  //     - Min 3 hours between each resend
  //     - Only allowed 08:00 – 22:00 KSA time
  // ═══════════════════════════════════════════════════════════════════════════
  async earnReward(tenantId: number, dto: EarnRewardDto) {
    const { integration, config } = await this.loadIntegration(tenantId);
    const partnerId = integration.partner_id;
    await this.validateTerminal(tenantId, dto.BranchId, dto.TerminalId);

    const globalId = this.newGlobalId();
    const requestDate = this.ksaNow();

    const payload = {
      Msisdn: dto.Msisdn,
      BranchId: dto.BranchId,
      TerminalId: dto.TerminalId,
      RequestDate: requestDate,
      Amount: dto.Amount,
    };

    return this.callRewardWithRetry(
      config,
      '/api/v1/earn/reward',
      payload,
      globalId,
      requestDate,
      tenantId,
      partnerId,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. EARN REWARD INCENTIVE  (Award points + capture cashier ID)
  // Same as earnReward but also sends CashierId for the cashier incentive program.
  // Same retry protocol as earnReward.
  // ═══════════════════════════════════════════════════════════════════════════
  async earnRewardIncentive(tenantId: number, dto: EarnRewardIncentiveDto) {
    const { integration, config } = await this.loadIntegration(tenantId);
    const partnerId = integration.partner_id;
    await this.validateTerminal(tenantId, dto.BranchId, dto.TerminalId);

    const globalId = this.newGlobalId();
    const requestDate = this.ksaNow();

    const payload = {
      Msisdn: dto.Msisdn,
      BranchId: dto.BranchId,
      TerminalId: dto.TerminalId,
      RequestDate: requestDate,
      Amount: dto.Amount,
      CashierId: dto.CashierId,
    };

    return this.callRewardWithRetry(
      config,
      '/api/v1/earn/reward-incentive',
      payload,
      globalId,
      requestDate,
      tenantId,
      partnerId,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. UPDATE REWARD  (Reduce reward for refund within refund period)
  // Reduces the amount of a previous Reward transaction.
  // Can ONLY reduce, never increase. Must be within the agreed refund window.
  //
  // ⚠ PROTOCOL (STC spec §2.6):
  //   Error 2311 or timeout → keep retrying until success
  //   We cap at UPDATE_MAX_RETRIES (5) for safety
  //   Same GlobalId rules: timeout = same, 2311 = new
  // ═══════════════════════════════════════════════════════════════════════════
  async updateReward(tenantId: number, dto: EarnUpdateDto) {
    const { integration, config } = await this.loadIntegration(tenantId);
    const partnerId = integration.partner_id;
    await this.validateTerminal(tenantId, dto.BranchId, dto.TerminalId);

    const requestDate = this.ksaNow();
    let currentGlobalId = this.newGlobalId();
    let lastError: any = null;

    const payload = {
      Msisdn: dto.Msisdn,
      BranchId: dto.BranchId,
      TerminalId: dto.TerminalId,
      RequestDate: requestDate,
      RefRequestId: dto.RefRequestId,
      RefRequestDate: dto.RefRequestDate,
      ReductionAmount: dto.ReductionAmount,
    };

    for (let attempt = 1; attempt <= UPDATE_MAX_RETRIES; attempt++) {
      console.log(
        `[Qitaf] Update Reward — attempt ${attempt}/${UPDATE_MAX_RETRIES}`,
        {
          globalId: currentGlobalId,
          refRequestId: dto.RefRequestId,
          reductionAmount: dto.ReductionAmount,
        },
      );

      try {
        const result = await this.callStc(
          'PUT',
          `${config.apiBaseUrl}/api/v1/earn/update`,
          this.buildHeaders(config, currentGlobalId),
          payload,
        );
        console.log(
          `[Qitaf] Update Reward ← SUCCESS on attempt ${attempt}`,
          result,
        );
        void this.logTransaction({
          tenantId,
          partnerId,
          msisdn: dto.Msisdn,
          transactionType: 'update',
          globalId: currentGlobalId,
          branchId: dto.BranchId,
          terminalId: dto.TerminalId,
          refRequestId: dto.RefRequestId,
          refRequestDate: dto.RefRequestDate,
          reductionAmount: dto.ReductionAmount,
          requestDate,
          status: 'success',
          stcResponse: result,
        }).catch((e) =>
          this.logger.error('[Qitaf] Failed to log transaction', e?.message),
        );
        return { ...result, globalId: currentGlobalId, requestDate };
      } catch (err) {
        const stcCode = this.extractStcCode(err);
        const isRetriable =
          err?.isTimeout || (err?.isStcError && stcCode === RETRY_ERROR_CODE);

        if (!isRetriable) {
          // Auth error, validation error, etc. — stop immediately, no point retrying
          void this.logTransaction({
            tenantId,
            partnerId,
            msisdn: dto.Msisdn,
            transactionType: 'update',
            globalId: currentGlobalId,
            branchId: dto.BranchId,
            terminalId: dto.TerminalId,
            refRequestId: dto.RefRequestId,
            refRequestDate: dto.RefRequestDate,
            reductionAmount: dto.ReductionAmount,
            requestDate,
            status: 'failed',
            stcError: err?.data ?? err,
          }).catch((e) =>
            this.logger.error('[Qitaf] Failed to log transaction', e?.message),
          );
          this.throwForCaller(err, 'Update Reward');
        }

        lastError = err;
        const reason = err?.isTimeout ? 'TIMEOUT' : `Error ${stcCode}`;
        console.warn(
          `[Qitaf] Update Reward attempt ${attempt} failed (${reason}).`,
          attempt < UPDATE_MAX_RETRIES
            ? `Retrying in ${UPDATE_RETRY_DELAY_MS / 1000}s...`
            : 'Exhausted.',
        );

        // GlobalId rule: timeout = keep same (idempotent), 2311 = generate new
        if (!err?.isTimeout) {
          currentGlobalId = this.newGlobalId();
        }

        if (attempt < UPDATE_MAX_RETRIES) {
          await this.sleep(UPDATE_RETRY_DELAY_MS);
        }
      }
    }

    console.error('[Qitaf] Update Reward — all retries exhausted', {
      finalGlobalId: currentGlobalId,
      refRequestId: dto.RefRequestId,
    });
    void this.logTransaction({
      tenantId,
      partnerId,
      msisdn: dto.Msisdn,
      transactionType: 'update',
      globalId: currentGlobalId,
      branchId: dto.BranchId,
      terminalId: dto.TerminalId,
      refRequestId: dto.RefRequestId,
      refRequestDate: dto.RefRequestDate,
      reductionAmount: dto.ReductionAmount,
      requestDate,
      status: 'failed',
      stcError: lastError?.data ?? lastError,
    }).catch((e) =>
      this.logger.error('[Qitaf] Failed to log transaction', e?.message),
    );
    throw new HttpException(
      {
        message: `Update Reward failed after ${UPDATE_MAX_RETRIES} attempts. Contact STC integration team.`,
        finalGlobalId: currentGlobalId,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. REWARD TRANSACTION STATUS
  // Checks if a Reward transaction's points have been posted to the customer.
  //
  // Response codes from STC:
  //   801 = Pending  — points not yet posted (still in refund window)
  //   802 = Posted   — points successfully added to customer's qitaf balance ✓
  //   803 = Rejected — error during posting, points were NOT added
  //   804 = Cancelled — points were posted then manually reversed later
  // ═══════════════════════════════════════════════════════════════════════════
  async rewardStatus(tenantId: number, dto: EarnRewardStatusDto) {
    const { integration, config } = await this.loadIntegration(tenantId);
    const partnerId = integration.partner_id;

    const globalId = this.newGlobalId();
    const requestDate = this.ksaNow();

    // Note: BranchId and TerminalId are NOT required by STC for status check
    const payload = {
      Msisdn: dto.Msisdn,
      RequestDate: requestDate,
      RefRequestId: dto.RefRequestId,
      RefRequestDate: dto.RefRequestDate,
    };

    console.log('[Qitaf] Reward Status →', {
      globalId,
      refRequestId: dto.RefRequestId,
    });

    try {
      const result = await this.callStc(
        'POST',
        `${config.apiBaseUrl}/api/v1/earn/reward/status`,
        this.buildHeaders(config, globalId),
        payload,
      );
      console.log('[Qitaf] Reward Status ←', result);
      void this.logTransaction({
        tenantId,
        partnerId,
        msisdn: dto.Msisdn,
        transactionType: 'status',
        globalId,
        refRequestId: dto.RefRequestId,
        refRequestDate: dto.RefRequestDate,
        requestDate,
        status: 'success',
        stcResponse: result,
      }).catch((e) =>
        this.logger.error('[Qitaf] Failed to log transaction', e?.message),
      );
      return { ...result, globalId, requestDate };
    } catch (err) {
      void this.logTransaction({
        tenantId,
        partnerId,
        msisdn: dto.Msisdn,
        transactionType: 'status',
        globalId,
        refRequestId: dto.RefRequestId,
        refRequestDate: dto.RefRequestDate,
        requestDate,
        status: 'failed',
        stcError: err?.data ?? err,
      }).catch((e) =>
        this.logger.error('[Qitaf] Failed to log transaction', e?.message),
      );
      this.throwForCaller(err, 'Reward Status');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOMER TRANSACTION HISTORY
  // Returns all Qitaf transactions for a given customer.
  // Decrypts the customer's hashed_number to extract their Msisdn, then
  // queries the qitaf_transactions table by that Msisdn + tenant.
  // ═══════════════════════════════════════════════════════════════════════════
  async getCustomerTransactions(
    customerId: number,
    page = 1,
    limit = 10,
  ): Promise<{
    data: QitafTransaction[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    // Do NOT use select array here — TypeORM silently ignores relation names in select,
    // which leaves tenant unloaded and tenantId undefined, causing the query to match nothing.
    const customer = await this.customerRepo.findOne({
      where: { id: customerId },
      relations: ['tenant'],
    });

    if (!customer) {
      throw new BadRequestException(`Customer #${customerId} not found`);
    }

    let msisdn: number | null = null;

    // Use hashed_number (OCI KMS encrypted full phone with country code) as the source.
    // The plain `phone` column is NOT reliable — migrated customers have it without
    // country code (e.g. "544696960") while new customers have the full number.
    // hashed_number always contains the full number (e.g. "+966544696960") when set.
    if (customer.hashed_number) {
      try {
        const decrypted = decrypt(customer.hashed_number);
        // Strip country code (+966 / 966 / 00966) → take last 9 digits → Saudi local number
        const digits = decrypted.replace(/\D/g, '');
        const localPart = digits.slice(-9);
        msisdn = Number(localPart);
      } catch {
        this.logger.warn(
          `[Qitaf] Could not decrypt hashed_number for customer #${customerId}`,
        );
      }
    }

    if (!msisdn) {
      return { data: [], total: 0, page, totalPages: 0 };
    }

    const tenantId = customer.tenant?.id;

    const [data, total] = await this.transactionRepo.findAndCount({
      where: { msisdn, tenant_id: tenantId },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  /**
   * GET /qitaf/transactions/all/:tenantId
   *
   * Returns ALL paginated Qitaf transactions for a tenant (admin panel).
   * Accepts an optional rawMsisdn search param — strips country code and
   * normalises to 9-digit Saudi local number before querying.
   * The msisdn field is omitted from every row in the response to avoid
   * exposing sensitive customer phone numbers.
   */
  async getAllTransactions(
    tenantId: number,
    rawMsisdn?: string,
    page = 1,
    limit = 10,
  ): Promise<{
    data: Omit<QitafTransaction, 'msisdn'>[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    let msisdnFilter: number | undefined;

    if (rawMsisdn) {
      const digits = rawMsisdn.replace(/\D/g, '');
      if (digits.length >= 9) {
        const parsed = Number(digits.slice(-9));
        if (!isNaN(parsed) && parsed > 0) {
          msisdnFilter = parsed;
        }
      }
    }

    const where: any = { tenant_id: tenantId };
    if (msisdnFilter !== undefined) {
      where.msisdn = msisdnFilter;
    }

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);

    const [rows, total] = await this.transactionRepo.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    // Strip msisdn — never expose raw customer phone numbers via the admin API
    const data = rows.map(({ msisdn: _msisdn, ...rest }) => rest);

    return {
      data,
      total,
      page: safePage,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECKOUT HELPERS  (called by CheckoutService for unified /loyalty/* flow)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Look up the qitaf_transaction saved when requestOtp was called from the
   * checkout flow. Returns null if not found or tenant mismatch.
   *
   * Used by CheckoutService.confirmTransaction to get msisdn / branch / terminal
   * stored at OTP-request time, so confirm does not need a customer DB lookup.
   */
  async getOtpTxByUuid(
    uuid: string,
    tenantId: number,
  ): Promise<QitafTransaction | null> {
    return this.transactionRepo.findOne({
      where: { uuid, tenant_id: tenantId, transaction_type: 'otp' },
    });
  }

  /**
   * Look up the most recent successful Qitaf redeem transaction for a given
   * invoice_id under this tenant. Used by CheckoutService.refund to recover
   * the exact global_id + request_date needed for the STC reverse call.
   *
   * Returns null if no matching record found.
   */
  async getRedeemTxForRefund(
    tenantId: number,
    invoiceId: string,
  ): Promise<{
    global_id: string;
    request_date: string;
    msisdn: number;
    branch_id: string;
    terminal_id: string;
    amount: number;
  } | null> {
    const tx = await this.transactionRepo.findOne({
      where: {
        tenant_id: tenantId,
        invoice_id: invoiceId,
        transaction_type: 'redeem',
        status: 'success',
      },
      order: { created_at: 'DESC' },
    });
    if (!tx) return null;
    return {
      global_id: tx.global_id,
      request_date: tx.request_date,
      msisdn: tx.msisdn,
      branch_id: tx.branch_id,
      terminal_id: tx.terminal_id,
      amount: tx.amount,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Persist a Qitaf transaction record.
   *
   * Callers that need the saved entity (requestOtp / redeemPoints success paths)
   * should `await` this — the uuid is returned so confirm / refund can look it up.
   *
   * All other callers (error paths, earn reward) use fire-and-forget:
   *   void this.logTransaction({...}).catch((e) => this.logger.error(...))
   */
  private async logTransaction(data: {
    tenantId: number;
    partnerId: number;
    msisdn: number;
    transactionType: QitafTransactionType;
    globalId?: string;
    refRequestId?: string;
    refRequestDate?: string;
    branchId?: string;
    terminalId?: string;
    amount?: number;
    cashierId?: string;
    reductionAmount?: number;
    requestDate: string;
    status: QitafTransactionStatus;
    stcResponse?: any;
    stcError?: any;
    points?: number;
    invoiceId?: string;
  }): Promise<QitafTransaction> {
    return this.transactionRepo.save({
      tenant_id: data.tenantId,
      partner_id: data.partnerId,
      msisdn: data.msisdn,
      transaction_type: data.transactionType,
      global_id: data.globalId,
      ref_request_id: data.refRequestId,
      ref_request_date: data.refRequestDate,
      branch_id: data.branchId,
      terminal_id: data.terminalId,
      amount: data.amount,
      cashier_id: data.cashierId,
      reduction_amount: data.reductionAmount,
      request_date: data.requestDate,
      status: data.status,
      stc_response: data.stcResponse,
      stc_error: data.stcError,
      points: data.points ?? data.stcResponse?.points ?? null,
      invoice_id: data.invoiceId ?? null,
    });
  }

  /**
   * Shared retry logic for earnReward and earnRewardIncentive (STC spec §2.4 / §2.5).
   *
   * Attempt 1 → fails with 2311 or timeout → Attempt 2 (immediate, once)
   *   - Timeout case: use SAME GlobalId so STC treats it as the same transaction
   *   - Error 2311 case: use NEW GlobalId as STC requires a fresh ID
   * Both attempts fail → log full details for manual resend by ops team.
   *
   * Manual resend rules (not automated — these are for the operations team):
   *   • Max 4 additional resends total
   *   • At least 3 hours between each resend
   *   • Only between 08:00 and 22:00 KSA time
   */
  private async callRewardWithRetry(
    config: QitafConfig,
    stcPath: string,
    payload: Record<string, any>,
    globalId: string,
    requestDate: string,
    tenantId: number,
    partnerId: number,
  ): Promise<any> {
    const url = `${config.apiBaseUrl}${stcPath}`;
    const transactionType: QitafTransactionType = stcPath.includes('incentive')
      ? 'earn_incentive'
      : 'earn';
    const msisdn: number = payload.Msisdn;
    const branchId: string = payload.BranchId;
    const terminalId: string = payload.TerminalId;

    // ── Attempt 1 ────────────────────────────────────────────────────────────
    console.log('[Qitaf] Reward → Attempt 1', { globalId, stcPath });
    try {
      const headers = this.buildHeaders(config, globalId);
      const result = await this.callStc('POST', url, headers, payload);
      console.log('[Qitaf] Reward ← SUCCESS Attempt 1', result);
      void this.logTransaction({
        tenantId,
        partnerId,
        msisdn,
        transactionType,
        globalId,
        branchId,
        terminalId,
        amount: payload.Amount,
        cashierId: payload.CashierId,
        requestDate,
        status: 'success',
        stcResponse: result,
        points: result?.PointsAwarded ?? result?.points ?? null,
      }).catch((e) =>
        this.logger.error('[Qitaf] Failed to log transaction', e?.message),
      );
      return { ...result, globalId, requestDate };
    } catch (err1) {
      const code1 = this.extractStcCode(err1);
      const isRetriable =
        err1?.isTimeout || (err1?.isStcError && code1 === RETRY_ERROR_CODE);

      if (!isRetriable) {
        // Not a retryable error (e.g. 401 auth, 400 validation) — fail immediately
        void this.logTransaction({
          tenantId,
          partnerId,
          msisdn,
          transactionType,
          globalId,
          branchId,
          terminalId,
          amount: payload.Amount,
          cashierId: payload.CashierId,
          requestDate,
          status: 'failed',
          stcError: err1?.data ?? err1,
        }).catch((e) =>
          this.logger.error('[Qitaf] Failed to log transaction', e?.message),
        );
        this.throwForCaller(err1, 'Earn Reward');
      }

      // ── Attempt 2 (one automatic retry) ──────────────────────────────────
      // Timeout → same GlobalId | Error 2311 → new GlobalId
      const retryGlobalId = err1?.isTimeout ? globalId : this.newGlobalId();
      const reason1 = err1?.isTimeout ? 'TIMEOUT' : `Error ${code1}`;

      console.warn(
        `[Qitaf] Reward Attempt 1 failed (${reason1}). Retrying once with GlobalId: ${retryGlobalId}`,
      );

      try {
        const retryHeaders = this.buildHeaders(config, retryGlobalId);
        const retryResult = await this.callStc(
          'POST',
          url,
          retryHeaders,
          payload,
        );
        console.log('[Qitaf] Reward ← SUCCESS Attempt 2', retryResult);
        void this.logTransaction({
          tenantId,
          partnerId,
          msisdn,
          transactionType,
          globalId: retryGlobalId,
          branchId,
          terminalId,
          amount: payload.Amount,
          cashierId: payload.CashierId,
          requestDate,
          status: 'success',
          stcResponse: retryResult,
          points: retryResult?.PointsAwarded ?? retryResult?.points ?? null,
        }).catch((e) =>
          this.logger.error('[Qitaf] Failed to log transaction', e?.message),
        );
        return { ...retryResult, globalId: retryGlobalId, requestDate };
      } catch (err2) {
        const code2 = this.extractStcCode(err2);
        const reason2 = err2?.isTimeout ? 'TIMEOUT' : `Error ${code2}`;

        // Both attempts failed — log everything ops team needs for manual resend
        console.error(
          '[Qitaf] Reward FAILED after 2 attempts — needs manual resend',
          {
            tenantId,
            stcPath,
            attempt1: { globalId, reason: reason1 },
            attempt2: { globalId: retryGlobalId, reason: reason2 },
            payload,
            requestDate,
            // Next manual resend: if last fail was timeout → use retryGlobalId (same)
            //                     if last fail was 2311   → use a brand-new UUID
            nextGlobalId: err2?.isTimeout
              ? retryGlobalId
              : '(generate new UUID)',
            rule: 'Max 4 manual resends | 3hr gap between each | 08:00–22:00 KSA only',
          },
        );

        void this.logTransaction({
          tenantId,
          partnerId,
          msisdn,
          transactionType,
          globalId: retryGlobalId,
          branchId,
          terminalId,
          amount: payload.Amount,
          cashierId: payload.CashierId,
          requestDate,
          status: 'failed',
          stcError: err2?.data ?? err2,
        }).catch((e) =>
          this.logger.error('[Qitaf] Failed to log transaction', e?.message),
        );

        throw new HttpException(
          {
            message:
              'Reward failed after automatic retry. Logged for manual resend.',
            globalId,
            retryGlobalId,
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }
  }

  /**
   * Core reverse logic — called by both reverseRedeem() (manual) and
   * redeemPoints() (auto-reverse on error/timeout).
   *
   * A new GlobalId is always generated for the reverse request itself.
   * refRequestId = GlobalId of the original Redeem transaction.
   * refRequestDate = RequestDate of the original Redeem transaction.
   *
   * Does NOT throw on STC code 1040 (already reversed) — that's expected.
   */
  private async executeReverse(
    config: QitafConfig,
    tenantId: number,
    partnerId: number,
    branchId: string,
    terminalId: string,
    msisdn: number,
    refRequestId: string,
    refRequestDate: string,
  ): Promise<any> {
    const globalId = this.newGlobalId();
    const requestDate = this.ksaNow();

    const payload = {
      Msisdn: msisdn,
      BranchId: branchId,
      TerminalId: terminalId,
      RequestDate: requestDate,
      RefRequestId: refRequestId,
      RefRequestDate: refRequestDate,
    };

    console.log('[Qitaf] Reverse →', { globalId, refRequestId, msisdn });

    try {
      const result = await this.callStc(
        'PUT',
        `${config.apiBaseUrl}/api/v1/redemption/reverse`,
        this.buildHeaders(config, globalId),
        payload,
      );
      console.log('[Qitaf] Reverse ← SUCCESS', result);
      void this.logTransaction({
        tenantId,
        partnerId,
        msisdn,
        transactionType: 'reverse',
        globalId,
        branchId,
        terminalId,
        refRequestId,
        refRequestDate,
        requestDate,
        status: 'success',
        stcResponse: result,
      }).catch((e) =>
        this.logger.error('[Qitaf] Failed to log transaction', e?.message),
      );
      return { ...result, globalId, requestDate };
    } catch (err) {
      // Code 1040 = STC already reversed this on their side — not an error
      if (err?.isStcError && this.extractStcCode(err) === '1040') {
        console.log('[Qitaf] Reverse ← 1040 (STC already reversed it) — OK');
        void this.logTransaction({
          tenantId,
          partnerId,
          msisdn,
          transactionType: 'reverse',
          globalId,
          branchId,
          terminalId,
          refRequestId,
          refRequestDate,
          requestDate,
          status: 'success',
          stcResponse: { code: 1040, description: 'Already reversed by STC' },
        }).catch((e) =>
          this.logger.error('[Qitaf] Failed to log transaction', e?.message),
        );
        return { code: 1040, description: 'Already reversed by STC' };
      }
      // Log but don't crash — reverse is often a background/auto call
      console.error('[Qitaf] Reverse FAILED', {
        refRequestId,
        error: err?.data ?? err,
      });
      void this.logTransaction({
        tenantId,
        partnerId,
        msisdn,
        transactionType: 'reverse',
        globalId,
        branchId,
        terminalId,
        refRequestId,
        refRequestDate,
        requestDate,
        status: 'failed',
        stcError: err?.data ?? err,
      }).catch((e) =>
        this.logger.error('[Qitaf] Failed to log transaction', e?.message),
      );
      return { error: true, details: err?.data ?? 'Reverse request failed' };
    }
  }

  /**
   * Load integration credentials from DB.
   * Validates the integration exists, is enabled, and has all required config keys.
   */
  private async loadIntegration(
    tenantId: number,
  ): Promise<{ integration: TenantPartnerIntegration; config: QitafConfig }> {
    const integration = await this.integrationRepo.findOne({
      where: {
        tenant_id: tenantId,
        is_enabled: 1,
      },
    });

    if (!integration) {
      throw new BadRequestException(
        `No active Qitaf integration for tenant #${tenantId}. Enable it in admin panel.`,
      );
    }

    const config = integration.configuration as QitafConfig;

    if (
      !config?.authUsername ||
      !config?.authPassword ||
      !config?.secretToken ||
      !config?.apiBaseUrl
    ) {
      throw new BadRequestException(
        `Qitaf config incomplete for tenant #${tenantId}. ` +
          `Ensure secretToken, authUsername, authPassword, apiBaseUrl are set in admin panel.`,
      );
    }

    // Trim trailing slash so URL concatenation never produces double-slashes
    config.apiBaseUrl = config.apiBaseUrl.replace(/\/+$/, '');

    return { integration, config };
  }

  /**
   * Validate that the given BranchId + TerminalId exist in our DB for this tenant.
   * This confirms the cashier is using a registered, active terminal.
   * If not found → reject the request before even calling STC.
   */
  private async validateTerminal(
    tenantId: number,
    branchId: string,
    terminalId: string,
  ): Promise<void> {
    const integration = await this.integrationRepo.findOne({
      where: { tenant_id: tenantId },
      select: ['id'],
    });

    if (!integration) {
      throw new BadRequestException(
        `Integration not found for tenant #${tenantId}`,
      );
    }

    const terminal = await this.terminalRepo.findOne({
      where: {
        tenant_partner_integration_id: integration.id,
        branch_id: branchId,
        terminal_id: terminalId,
        is_active: 1,
      },
    });

    if (!terminal) {
      throw new BadRequestException(
        `Terminal BranchId="${branchId}" TerminalId="${terminalId}" is not registered or inactive. ` +
          `Add it from admin panel under this tenant's Qitaf integration.`,
      );
    }
  }

  /**
   * Build the HTTP headers STC requires on every single request.
   *
   * Content-Type  — always application/json
   * X-Secret-Token — JWT provided by STC, stored in integration config
   * Authorization  — Basic Auth: base64(username:password) from config
   * GlobalId       — unique UUID per request; STC uses this as transaction ID
   */
  private buildHeaders(
    config: QitafConfig,
    globalId: string,
  ): Record<string, string> {
    const basicAuth = Buffer.from(
      `${config.authUsername}:${config.authPassword}`,
    ).toString('base64');
    return {
      'Content-Type': 'application/json',
      'Accept-Language': 'en-US',
      'X-Secret-Token': config.secretToken,
      Authorization: `Basic ${basicAuth}`,
      GlobalId: globalId,
    };
  }

  /**
   * Make one HTTP call to STC with mTLS and a 60-second timeout.
   *
   * On success: returns response.data
   * On timeout: throws { isTimeout: true }
   * On STC HTTP error (4xx/5xx): throws { isStcError: true, httpStatus, data }
   * On network error: re-throws the original error
   */
  private async callStc(
    method: 'POST' | 'PUT',
    url: string,
    headers: Record<string, string>,
    body: Record<string, any>,
    timeoutMs = STC_TIMEOUT_MS,
  ): Promise<any> {
    try {
      const response = await axios({
        method,
        url,
        headers,
        data: body,
        httpsAgent: this.httpsAgent,
        timeout: timeoutMs,
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          throw { isTimeout: true, originalError: error };
        }
        if (error.response) {
          throw {
            isStcError: true,
            httpStatus: error.response.status,
            data: error.response.data,
          };
        }
      }
      throw error; // Network-level failure (DNS, no connection, etc.)
    }
  }

  /**
   * Extract STC's error code string from an error response body.
   * STC format: { errors: [{ code: '2311', description: '...' }] }
   */
  private extractStcCode(err: any): string | null {
    if (
      err?.isStcError &&
      Array.isArray(err?.data?.errors) &&
      err.data.errors.length > 0
    ) {
      return String(err.data.errors[0]?.code ?? '');
    }
    return null;
  }

  /**
   * Convert internal error objects into clean NestJS HTTP exceptions for the API caller.
   */
  private throwForCaller(err: any, context: string): never {
    if (err?.isTimeout) {
      console.error(
        `[Qitaf] [${context}] Timed out after ${STC_TIMEOUT_MS / 1000}s`,
      );
      throw new HttpException(
        { message: `STC Qitaf API timed out on ${context}. Please try again.` },
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }
    if (err?.isStcError) {
      const code = this.extractStcCode(err);
      console.error(`[Qitaf] [${context}] STC error ${code}:`, err.data);
      throw new HttpException(
        { message: `STC Qitaf error on ${context}`, stcError: err.data },
        err.httpStatus ?? HttpStatus.BAD_GATEWAY,
      );
    }
    console.error(`[Qitaf] [${context}] Unexpected error:`, err);
    throw new HttpException(
      { message: `Unexpected error on ${context}` },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  /** UUID v4 — used as GlobalId (unique transaction ID) per STC request */
  private newGlobalId(): string {
    return uuidv4();
  }

  /**
   * Current datetime in KSA timezone (UTC+3) formatted as ISO 8601.
   * STC requires all timestamps in KSA local time, NOT UTC.
   * Example output: "2024-06-15T14:30:00"
   */
  private ksaNow(): string {
    return dayjs().tz('Asia/Riyadh').format('YYYY-MM-DDTHH:mm:ss');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
