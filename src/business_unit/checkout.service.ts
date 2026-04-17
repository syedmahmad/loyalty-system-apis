import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { randomInt } from 'crypto';
import { Customer } from 'src/customers/entities/customer.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import {
  WalletTransaction,
  WalletTransactionStatus,
  WalletTransactionType,
} from 'src/wallet/entities/wallet-transaction.entity';
import { Rule } from 'src/rules/entities/rules.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { BurnOtp } from 'src/petromin-it/burning/entities/burn-otp.entity';
import { encrypt } from 'src/helpers/encryption';
import {
  ConfirmTransactionDto,
  GetBurnRuleDto,
  RefundTransactionDto,
  RequestTransactionDto,
} from './dto/checkout.dto';
import { QitafService } from 'src/qitaf/qitaf.service';

@Injectable()
export class CheckoutService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,

    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,

    @InjectRepository(WalletTransaction)
    private readonly txnRepo: Repository<WalletTransaction>,

    @InjectRepository(Rule)
    private readonly ruleRepo: Repository<Rule>,

    @InjectRepository(BusinessUnit)
    private readonly buRepo: Repository<BusinessUnit>,

    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,

    @InjectRepository(BurnOtp)
    private readonly burnOtpRepo: Repository<BurnOtp>,

    private readonly qitafService: QitafService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED HELPER — normalise + encrypt phone
  //
  // Phone arrives in many forms:
  //   "966501234567"  →  "+966501234567"
  //   "+966501234567" →  "+966501234567"
  //   " 966501234567" →  "+966501234567"  (URL-decoded space from + sign)
  //
  // We always store with leading + in hashed_number so we must match exactly.
  // ─────────────────────────────────────────────────────────────────────────
  private hashPhone(phone: string): string {
    const normalised = '+' + phone.replace(/^[\s+]+/, '');
    return encrypt(normalised);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED HELPER — resolve customer by phone, validate active status
  // ─────────────────────────────────────────────────────────────────────────
  private async resolveCustomer(phone: string): Promise<Customer> {
    const hashed = this.hashPhone(phone);
    const customer = await this.customerRepo.findOne({
      where: { hashed_number: hashed, status: 1 },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found or inactive');
    }
    return customer;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED HELPER — resolve business unit by UUID, validate it belongs to tenant
  // ─────────────────────────────────────────────────────────────────────────
  private async resolveBu(
    programUuid: string,
    tenantId: number,
  ): Promise<BusinessUnit> {
    const bu = await this.buRepo.findOne({
      where: { uuid: programUuid, tenant_id: tenantId, status: 1 },
    });
    if (!bu) {
      throw new NotFoundException('Program not found or not active');
    }
    return bu;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED HELPER — resolve wallet for a customer scoped to a tenant
  //
  // Wallets are tenant-scoped, not BU-scoped. A customer has one wallet per
  // tenant regardless of which business unit (program) they are redeeming
  // against. Looking up by BU would fail for tenants like GVR/NCMC whose
  // wallets are created without a specific BU assignment.
  //
  // OTP-type programs never reach this method — all callers guard with
  // bu.type === 'otp' early returns before calling resolveWallet.
  // ─────────────────────────────────────────────────────────────────────────
  private async resolveWallet(
    customerId: number,
    tenantId: number,
  ): Promise<Wallet> {
    const wallet = await this.walletRepo.findOne({
      where: {
        customer: { id: customerId },
        tenant: { id: tenantId },
      },
    });
    if (!wallet) {
      throw new NotFoundException(
        'Wallet not found for this customer and tenant',
      );
    }
    return wallet;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED HELPER — fetch active burn rule for a tenant + business unit
  //
  // A business unit (program) has one burn rule that defines:
  //   - max_burn_percent_on_invoice  : max % of invoice that can be paid with points
  //   - points_conversion_factor     : 1 point = X SAR
  //   - max_redeemption_points_limit : hard cap on points per transaction
  //   - min_amount_spent             : minimum invoice amount for rule to activate
  //   - frequency                    : AnyTime | once | daily | yearly
  // ─────────────────────────────────────────────────────────────────────────
  private async resolveBurnRule(tenantId: number, buId: number): Promise<Rule> {
    const rule = await this.ruleRepo.findOne({
      where: {
        rule_type: 'burn',
        tenant_id: tenantId,
        business_unit_id: buId,
        status: 1,
      },
    });
    if (!rule) {
      throw new NotFoundException(
        'No active burn rule found for this program. Contact support.',
      );
    }
    return rule;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED HELPER — convert a raw phone string to a 9-digit Saudi Msisdn
  // integer that STC Qitaf APIs expect.
  //
  // Input examples:  "966544696960"  |  "+966544696960"  |  " 966544696960"
  // STC format:      544696960  (last 9 digits, no country code)
  //
  // Works directly from the phone string — no DB lookup required.
  // This means non-loyalty customers (not in our DB) are fully supported.
  // ─────────────────────────────────────────────────────────────────────────
  private phoneToMsisdn(phone: string): number {
    const digits = phone.replace(/\D/g, '');
    return Number(digits.slice(-9));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED HELPER — calculate the maximum points a customer can burn
  //
  // The cap is the LOWEST of three limits:
  //   1. Customer's available wallet balance
  //   2. Rule's hard point cap (max_redeemption_points_limit)
  //   3. Rule's invoice % cap  (max_burn_percent_on_invoice)
  //      — converted back to points via conversion factor
  //
  // Returns { pointsToBurn, discountAmount } both already floored/consistent.
  // ─────────────────────────────────────────────────────────────────────────
  private calculateMaxBurn(
    availablePoints: number,
    rule: Rule,
    transactionAmount: number,
  ): { pointsToBurn: number; discountAmount: number } {
    // Start with the lower of: wallet balance vs rule's point cap
    let pointsToBurn = Math.min(
      availablePoints,
      rule.max_redeemption_points_limit,
    );

    // Convert to money
    let discountAmount = pointsToBurn * rule.points_conversion_factor;

    // Cap by max allowed % of invoice
    const maxAllowedDiscount =
      (transactionAmount * rule.max_burn_percent_on_invoice) / 100;

    // If the discount would exceed the % cap, pull it back down
    if (discountAmount > maxAllowedDiscount) {
      discountAmount = maxAllowedDiscount;
      // Recalculate points from capped discount (floor to avoid fractional points)
      pointsToBurn = Math.floor(discountAmount / rule.points_conversion_factor);
      // Recalc discount from floored points to keep values consistent
      discountAmount = pointsToBurn * rule.points_conversion_factor;
    }

    return { pointsToBurn, discountAmount };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED HELPER — fetch tenant and check OTP burn requirement
  // ─────────────────────────────────────────────────────────────────────────
  private async resolveTenant(tenantId: number): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant #${tenantId} not found`);
    return tenant;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED HELPER — generate a 6-digit OTP and save it to burn_otps
  //
  // Mirrors the logic in BurningService.burnTransaction (Path B).
  // Collision-checked against active (unused + non-expired) records.
  // Returns the plain 6-digit code so the caller can include it in a
  // push notification if desired.
  // ─────────────────────────────────────────────────────────────────────────
  private async generateAndSaveBurnOtp(
    tenantId: number,
    txUuid: string,
    customerId: number,
    buId: number,
    ttlMinutes: number,
  ): Promise<string> {
    const now = new Date();
    let otp: string;
    let attempts = 0;

    do {
      otp = String(randomInt(100000, 1000000));
      attempts++;
      if (attempts > 10) {
        throw new BadRequestException(
          'Could not generate a unique OTP. Please try again.',
        );
      }
      const collision = await this.burnOtpRepo.findOne({
        where: { otp, used: 0, expires_at: MoreThan(now) },
      });
      if (!collision) break;
    } while (true);

    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

    await this.burnOtpRepo.save({
      otp,
      customer_id: customerId,
      tenant_id: tenantId,
      business_unit_id: buId,
      used: 0,
      expires_at: expiresAt,
      transaction_uuid: txUuid,
      app_generate_count: 0,
      cashier_request_count: 1,
    });

    return otp;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /loyalty/burn-rule
  //
  // Returns everything the checkout page needs to show the customer:
  //   - Their available points for the selected program
  //   - The burn rule (limits, conversion rate, frequency)
  //   - Optional simulation: if transaction_amount is provided, calculates
  //     exactly how many points they can burn and what discount they get
  //
  // OTP programs: burn-rule is not applicable — returns a clear explanation.
  // ═══════════════════════════════════════════════════════════════════════════
  async getBurnRule(tenantId: number, dto: GetBurnRuleDto) {
    const bu = await this.resolveBu(dto.program_uuid, tenantId);

    // OTP programs (e.g. Qitaf) do not have wallet points or burn rules.
    // Redemption happens via the /qitaf/* OTP flow, not through the wallet.
    if (bu.type === 'otp') {
      return {
        program: { id: bu.id, uuid: bu.uuid, name: bu.name, type: 'otp' },
        message:
          'This program uses OTP-based redemption. No burn rule applies.',
        burn_rule: null,
        customer: null,
        simulation: null,
      };
    }

    const customer = await this.resolveCustomer(dto.customer_phone);
    const wallet = await this.resolveWallet(customer.id, tenantId);
    const rule = await this.resolveBurnRule(tenantId, bu.id);

    const response: any = {
      program: { id: bu.id, uuid: bu.uuid, name: bu.name, type: bu.type },
      customer: {
        available_points: wallet.available_balance,
        available_in_sar: +(
          wallet.available_balance * rule.points_conversion_factor
        ).toFixed(2),
      },
      burn_rule: {
        max_burn_percent_on_invoice: rule.max_burn_percent_on_invoice,
        points_conversion_factor: rule.points_conversion_factor,
        max_redeemption_points_limit: rule.max_redeemption_points_limit,
        min_amount_spent: rule.min_amount_spent,
        frequency: rule.frequency,
      },
      simulation: null,
    };

    if (dto.transaction_amount !== undefined) {
      if (dto.transaction_amount < rule.min_amount_spent) {
        response.simulation = {
          eligible: false,
          reason: `Minimum transaction amount is SAR ${rule.min_amount_spent}`,
        };
      } else {
        const { pointsToBurn, discountAmount } = this.calculateMaxBurn(
          wallet.available_balance,
          rule,
          dto.transaction_amount,
        );
        response.simulation = {
          eligible: true,
          max_points_can_burn: pointsToBurn,
          max_discount_sar: +discountAmount.toFixed(2),
          min_amount_to_pay: +(dto.transaction_amount - discountAmount).toFixed(
            2,
          ),
        };
      }
    }

    return response;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /loyalty/request-transaction
  //
  // Creates a pending (NOT_CONFIRMED) transaction. Works for both types:
  //
  //   points — validates wallet + burn rule, confirms the invoice meets the
  //            minimum spend. Creates a placeholder. Actual points_to_burn is
  //            decided at confirm-transaction time (same pattern as the internal
  //            burning module — not locked in at request time).
  //
  //   otp    — no wallet or rule check. Logs the transaction amount as an
  //            audit record. The OTP redemption itself happens through Qitaf.
  //
  // Returns transaction_id (UUID) — pass to confirm-transaction after payment.
  // ═══════════════════════════════════════════════════════════════════════════
  async requestTransaction(tenantId: number, dto: RequestTransactionDto) {
    const bu = await this.resolveBu(dto.program_uuid, tenantId);

    // ── OTP program (e.g. Qitaf) ─────────────────────────────────────────
    // Trigger STC OTP SMS to the customer. Non-loyalty customers (not in our
    // DB) are fully supported — we only need their phone number.
    // branch_id and terminal_id identify which POS machine is initiating.
    if (bu.type === 'otp') {
      if (!dto.branch_id || !dto.terminal_id) {
        throw new BadRequestException(
          'branch_id and terminal_id are required for OTP-based programs',
        );
      }

      const msisdn = this.phoneToMsisdn(dto.customer_phone);

      // requestOtp returns qitafTxUuid — the uuid of the saved qitaf_transaction.
      // This becomes the transaction_id the caller passes to confirm-transaction.
      const otpResult = await this.qitafService.requestOtp(
        tenantId,
        {
          Msisdn: msisdn,
          BranchId: dto.branch_id,
          TerminalId: dto.terminal_id,
        },
        {
          invoiceId: dto.invoice_id,
          transactionAmount: dto.transaction_amount,
        },
      );

      return {
        transaction_id: otpResult.qitafTxUuid,
        program_type: 'otp',
        transaction_amount: dto.transaction_amount,
        note: 'OTP sent to customer. Call confirm-transaction with otp to finalise redemption.',
      };
    }

    // ── Points program — requires loyalty customer in our DB ──────────────
    const customer = await this.resolveCustomer(dto.customer_phone);
    const wallet = await this.resolveWallet(customer.id, tenantId);
    const rule = await this.resolveBurnRule(tenantId, bu.id);

    if (dto.transaction_amount < rule.min_amount_spent) {
      throw new BadRequestException(
        `Transaction amount SAR ${dto.transaction_amount} is below the minimum required SAR ${rule.min_amount_spent}`,
      );
    }

    // Calculate max the customer could burn — returned for UI reference only.
    // We do NOT lock in points here; the caller decides at confirm-transaction.
    const { pointsToBurn: maxAllowed, discountAmount: maxDiscount } =
      this.calculateMaxBurn(
        wallet.available_balance,
        rule,
        dto.transaction_amount,
      );

    const tx = this.txnRepo.create({
      type: WalletTransactionType.BURN,
      status: WalletTransactionStatus.NOT_CONFIRMED,
      wallet: { id: wallet.id } as any,
      customer: { id: customer.id } as any,
      business_unit: { id: bu.id } as any,
      tenant: { id: tenantId } as any,
      amount: dto.transaction_amount,
      point_balance: 0, // set on confirm-transaction
      prev_available_points: wallet.available_balance,
      source_type: 'checkout',
      source_id: rule.id, // stored so confirm-transaction can re-fetch the rule
      invoice_id: dto.invoice_id ?? null,
      invoice_no: dto.invoice_id ?? null,
      transaction_reference: dto.from_app ?? null,
      created_at: new Date(),
      description: dto.remarks
        ? `Checkout: ${dto.remarks}`
        : `Checkout: SAR ${dto.transaction_amount} invoice pending confirmation`,
    });

    const saved = await this.txnRepo.save(tx);

    // ── OTP burn required — generate code and link it to this transaction ──
    // When enabled, the customer must provide a 6-digit code from the Petromin
    // App to confirm the transaction. The code is saved to burn_otps and the
    // customer retrieves it (or regenerates it if expired) via the app's
    // POST /burning/otp/generate endpoint.
    const tenant = await this.resolveTenant(tenantId);
    const otpBurnRequired = tenant.otp_burn_required === 1;
    if (otpBurnRequired) {
      await this.generateAndSaveBurnOtp(
        tenantId,
        saved.uuid,
        customer.id,
        bu.id,
        tenant.otp_burn_ttl_minutes ?? 5,
      );
    }

    return {
      transaction_id: saved.uuid,
      program_type: 'points',
      transaction_amount: dto.transaction_amount,
      max_points_can_burn: maxAllowed,
      max_discount_sar: +maxDiscount.toFixed(2),
      otp_required: otpBurnRequired,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /loyalty/confirm-transaction
  //
  // Finalises a pending transaction. Works for both program types:
  //
  //   points — transaction_id is a wallet_transaction uuid (status NOT_CONFIRMED).
  //            Deducts points_to_burn from wallet and marks it ACTIVE.
  //
  //   otp    — transaction_id is a qitaf_transaction uuid (type='otp').
  //            Sends the PIN to STC, redeems Qitaf points, fires earn reward
  //            for any remaining cash amount. No wallet interaction.
  // ═══════════════════════════════════════════════════════════════════════════
  async confirmTransaction(tenantId: number, dto: ConfirmTransactionDto) {
    // ── Try points path first: look up wallet_transactions ────────────────
    const tx = await this.txnRepo.findOne({
      where: { uuid: dto.transaction_id },
      relations: ['customer', 'wallet', 'business_unit', 'tenant'],
    });

    if (tx) {
      if (tx.status !== WalletTransactionStatus.NOT_CONFIRMED) {
        throw new BadRequestException(
          `Transaction is already ${tx.status}. Cannot confirm again.`,
        );
      }
      if (tx.tenant?.id !== tenantId) {
        throw new BadRequestException(
          'Transaction does not belong to this tenant',
        );
      }

      // ── OTP burn verification (when tenant has otp_burn_required = 1) ────
      // Must happen before any wallet interaction so we don't deduct points
      // on an invalid or expired OTP.
      const tenant = await this.resolveTenant(tenantId);
      if (tenant.otp_burn_required === 1) {
        if (!dto.otp) {
          throw new BadRequestException(
            'otp is required to confirm this transaction. Ask the customer to open the Petromin App.',
          );
        }
        const normalized = String(dto.otp).trim().replace(/\D/g, '');
        const now = new Date();
        const otpRecord = await this.burnOtpRepo.findOne({
          where: {
            otp: normalized,
            transaction_uuid: tx.uuid,
            customer_id: tx.customer.id,
            used: 0,
            expires_at: MoreThan(now),
          },
        });
        if (!otpRecord) {
          throw new BadRequestException(
            'Invalid or expired OTP. Ask the customer to regenerate from the Petromin App.',
          );
        }
        // Mark consumed immediately — one-time use
        otpRecord.used = 1;
        otpRecord.used_at = now;
        await this.burnOtpRepo.save(otpRecord);
      }

      // ── Points program — deduct wallet ──────────────────────────────────
      const rule = await this.ruleRepo.findOne({ where: { id: tx.source_id } });
      if (!rule) {
        throw new NotFoundException(
          'Burn rule no longer found. Contact support.',
        );
      }

      const wallet = await this.walletRepo.findOne({
        where: { id: tx.wallet.id },
      });

      const pointsToBurn = Math.min(
        dto.points_to_burn,
        wallet.available_balance,
      );

      if (pointsToBurn <= 0) {
        throw new BadRequestException(
          'points_to_burn must be greater than 0 for a points program',
        );
      }

      const discountAmount = pointsToBurn * rule.points_conversion_factor;
      const finalAmount = Math.max(0, tx.amount - discountAmount);

      tx.point_balance = pointsToBurn;
      tx.status = WalletTransactionStatus.ACTIVE;
      tx.description = `Checkout confirmed: burned ${pointsToBurn} points for SAR ${discountAmount.toFixed(2)} discount`;
      await this.txnRepo.save(tx);

      wallet.available_balance -= pointsToBurn;
      wallet.total_burned_points += pointsToBurn;
      await this.walletRepo.save(wallet);

      return {
        transaction_id: tx.uuid,
        program_type: 'points',
        points_burned: pointsToBurn,
        discount_amount: +discountAmount.toFixed(2),
        final_amount: +finalAmount.toFixed(2),
        remaining_points: wallet.available_balance,
      };
    }

    // ── OTP program — look up qitaf_transactions by uuid ─────────────────
    // transaction_id is the qitaf_transaction.uuid returned by requestOtp.
    const otpTx = await this.qitafService.getOtpTxByUuid(
      dto.transaction_id,
      tenantId,
    );
    if (!otpTx) {
      throw new NotFoundException('Transaction not found');
    }

    if (!dto.otp) {
      throw new BadRequestException(
        'otp is required to confirm an OTP-based program transaction',
      );
    }

    // SAR amount to redeem via Qitaf. Defaults to full invoice amount.
    const redeemAmount = Math.floor(dto.redeem_amount ?? otpTx.amount);

    // Call STC — will auto-reverse internally on critical STC errors
    const redeemResult = await this.qitafService.redeemPoints(
      tenantId,
      {
        Msisdn: Number(otpTx.msisdn), // bigint columns return as string in MySQL
        BranchId: otpTx.branch_id,
        TerminalId: otpTx.terminal_id,
        PIN: Number(dto.otp), // otp is now a string field; STC expects a number
        Amount: redeemAmount,
      },
      { invoiceId: otpTx.invoice_id },
    );

    return {
      transaction_id: redeemResult.qitafTxUuid,
      program_type: 'otp',
      redeemed_sar: redeemAmount,
      remaining_amount: Math.floor(otpTx.amount ?? 0) - redeemAmount,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /loyalty/refund
  //
  // Full refund by invoice_id. Works for both program types — the system
  // auto-detects: checks wallet_transactions first (points), then
  // qitaf_transactions (OTP). Caller does not need to know the type.
  //
  // Partial refund is NOT supported — always reverses 100%.
  // ═══════════════════════════════════════════════════════════════════════════
  async refund(tenantId: number, dto: RefundTransactionDto) {
    // ── Try points path first: look up wallet_transaction by invoice_id ───
    const tx = await this.txnRepo.findOne({
      where: {
        invoice_id: dto.invoice_id,
        type: WalletTransactionType.BURN,
        status: WalletTransactionStatus.ACTIVE,
        tenant: { id: tenantId },
      },
      relations: ['customer', 'wallet', 'business_unit', 'tenant'],
    });

    if (tx) {
      const pointsToReturn = tx.point_balance ?? 0;

      const refundTx = this.txnRepo.create({
        type: WalletTransactionType.ADJUSTMENT,
        status: WalletTransactionStatus.ACTIVE,
        wallet: { id: tx.wallet.id } as any,
        customer: { id: tx.customer.id } as any,
        business_unit: { id: tx.business_unit.id } as any,
        tenant: { id: tenantId } as any,
        amount: tx.amount,
        point_balance: pointsToReturn,
        source_type: 'checkout_refund',
        source_id: tx.id,
        invoice_id: tx.invoice_id,
        invoice_no: tx.invoice_no,
        created_at: new Date(),
        description: `Refund: returned ${pointsToReturn} points from invoice ${dto.invoice_id}`,
      });

      await this.txnRepo.save(refundTx);

      const wallet = await this.walletRepo.findOne({
        where: { id: tx.wallet.id },
      });
      wallet.available_balance += pointsToReturn;
      wallet.total_burned_points = Math.max(
        0,
        wallet.total_burned_points - pointsToReturn,
      );
      await this.walletRepo.save(wallet);

      return {
        program_type: 'points',
        invoice_id: dto.invoice_id,
        points_returned: pointsToReturn,
        new_available_points: wallet.available_balance,
      };
    }

    // ── Try OTP path: look up qitaf redeem by invoice_id ─────────────────
    const redeemTx = await this.qitafService.getRedeemTxForRefund(
      tenantId,
      dto.invoice_id,
    );

    if (redeemTx) {
      // Exact reverse using stored global_id + request_date from the original
      // redeem — STC matches it precisely, no ambiguity.
      const reverseResult = await this.qitafService.reverseRedeem(tenantId, {
        Msisdn: Number(redeemTx.msisdn), // bigint columns return as string in MySQL
        BranchId: redeemTx.branch_id,
        TerminalId: redeemTx.terminal_id,
        RefRequestId: redeemTx.global_id,
        RefRequestDate: redeemTx.request_date,
      });

      return {
        program_type: 'otp',
        invoice_id: dto.invoice_id,
        reversed_amount: redeemTx.amount,
        stc_global_id: reverseResult?.globalId ?? null,
        message:
          'Qitaf redemption reversed. Points returned to customer by STC.',
      };
    }

    throw new NotFoundException(
      `No refundable transaction found for invoice_id "${dto.invoice_id}"`,
    );
  }
}
