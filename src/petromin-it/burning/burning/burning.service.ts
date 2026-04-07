import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import {
  GenerateOtpDto,
  GetCustomerDataDto,
  VerifyOtpDto,
} from '../dto/burning.dto';
import { Customer } from 'src/customers/entities/customer.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import {
  WalletTransaction,
  WalletTransactionStatus,
  WalletTransactionType,
} from 'src/wallet/entities/wallet-transaction.entity';
import { TiersService } from 'src/tiers/tiers/tiers.service';
import { decrypt, encrypt } from 'src/helpers/encryption';
import { Rule } from 'src/rules/entities/rules.entity';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import { NotificationService } from 'src/petromin-it/notification/notification/notifications.service';
import { OpenAIService } from 'src/openai/openai/openai.service';
import { CustomerPreference } from 'src/petromin-it/preferences/entities/customer-preference.entity';
import { DeviceToken } from 'src/petromin-it/notification/entities/device-token.entity';
import { BurnOtp } from '../entities/burn-otp.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import * as dayjs from 'dayjs';
import { randomInt } from 'crypto';

@Injectable()
export class BurningService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,

    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,

    @InjectRepository(WalletTransaction)
    private readonly walletTxnRepo: Repository<WalletTransaction>,

    @InjectRepository(Rule)
    private readonly ruleRepo: Repository<Rule>,

    @InjectRepository(CustomerPreference)
    private readonly customerPreferencesRepo: Repository<CustomerPreference>,

    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepo: Repository<DeviceToken>,

    @InjectRepository(BurnOtp)
    private readonly burnOtpRepo: Repository<BurnOtp>,

    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,

    private readonly tiersService: TiersService,
    private readonly walletService: WalletService,
    private readonly notificationService: NotificationService,
    private readonly openaiService: OpenAIService,
  ) {}

  // #region getCustomerData Service
  async getCustomerData(dto: GetCustomerDataDto) {
    // Step 1: Encrypt phone number
    const hashedPhone = encrypt(dto.customer_phone_number);

    // Step 2: Find customer (by uuid or phone hash)
    const customer = await this.customerRepo.findOne({
      where: { hashed_number: hashedPhone, status: 1 },
      // { uuid: dto.custom_customer_unique_id, status: 1 },
      // ],
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // if (customer.status === 0) {
    //   throw new NotFoundException('Customer is inactive');
    // }

    // Step 3: Fetch customer wallet
    const wallet = await this.walletRepo.findOne({
      where: { customer: { id: customer.id } },
    });

    // Default to 0 if no wallet found
    const loyaltyPoints = wallet?.available_balance ?? 0;

    // Step 4: Calculate transactions (amount + count)
    const transactions = await this.walletTxnRepo.find({
      where: {
        customer: { id: customer.id },
        status: WalletTransactionStatus.ACTIVE,
        wallet: { id: wallet.id },
      },
      select: ['amount'],
    });

    // Calculate the total amount of all active transactions by adding up the "amount" field of each transaction
    const totalAmount = transactions.reduce(
      (sum, txn) => sum + Number(txn.amount), // add current transaction's amount to the running total
      0,
    );

    // Count how many active transactions exist for this customer
    const totalCount = transactions.length;

    // Step 5: Get current tier using our TierService
    const tierResult = await this.tiersService.getCurrentCustomerTier(
      customer.id,
    );

    // Step 6: Build response
    return {
      success: true,
      message: 'Customer details fetched successfully',
      result: {
        customer_name: customer.name,
        custom_customer_first_name: customer.first_name,
        custom_customer_last_name: customer.last_name,
        custom_customer_unique_id: customer.uuid,
        customer_referral_code: customer.referral_code,
        custom_customer_loyalty_points: loyaltyPoints,
        custom_total_transaction_amount: totalAmount,
        custom_total_transaction_count: totalCount,
        customer_tier:
          dto.language_code === 'ar'
            ? tierResult?.tier?.name
              ? await this.openaiService.translateToArabic(
                  tierResult?.tier?.name,
                )
              : null
            : (tierResult?.tier?.name ?? null),
      },
      errors: [],
    };
  }
  // #endregion

  //#region Burn Transaction
  /**
   * Handles burning loyalty points for a given transaction.
   *
   * Flow:
   *  1. Validate customer (exists + active).
   *  2. Get customer's wallet and active burn rules.
   *  3. Match the correct rule based on transaction amount.
   *  4. Calculate burnable points and discount:
   *      - Limited by wallet balance and max redemption limit.
   *      - Discount capped by max burn percentage on invoice.
   *  5. Create burn transaction in the wallet.
   *  6. Return structured response with details.
   */
  async burnTransaction(body, langCode = 'en') {
    //#region Step 1: Extract request body
    const {
      customer_id,
      customer_phone_number,
      transaction_amount,
      from_app,
      remarks,
      invoice_id,
    } = body;

    const hashedPhone = encrypt(customer_phone_number);
    console.log('/////////burnTransaction//////////', customer_id);
    //#endregion

    try {
      //#region Step 2: Find customer
      const customer = await this.customerRepo.findOne({
        where: { hashed_number: hashedPhone, status: 1 },
        // { uuid: customer_id, status: 1 },
        // ],
        relations: ['tenant', 'business_unit'],
      });

      if (!customer) {
        throw new NotFoundException(`Customer not found`);
      }

      // if (customer.status === 0) {
      //   throw new BadRequestException(`Customer is inactive`);
      // }

      // if (customer.status === 3) {
      //   throw new BadRequestException(`Customer is deleted`);
      // }

      //#endregion

      //#region Step 3: Get customer wallet
      const wallet = await this.walletService.getSingleCustomerWalletInfo(
        customer.id,
        customer.business_unit.id,
      );

      if (!wallet) {
        throw new NotFoundException(`Customer wallet not configured`);
      }
      //#endregion

      //#region Step 4: Get active burn rules
      const query = this.ruleRepo
        .createQueryBuilder('rule')
        .leftJoinAndSelect('rule.locales', 'locale') // join locales
        .leftJoinAndSelect('locale.language', 'language') // join language table
        .where('rule.rule_type = :ruleType', { ruleType: 'burn' })
        .andWhere('rule.tenant_id = :tenantId', {
          tenantId: customer.tenant.id,
        })
        .andWhere('rule.business_unit_id = :businessUnitId', {
          businessUnitId: customer.business_unit.id,
        });

      if (langCode) {
        query.andWhere('language.code = :langCode', { langCode });
      }
      const rules = await query.getMany();

      if (!rules.length) {
        throw new NotFoundException(`Rules not found`);
      }

      // Pick the first rule that matches transaction amount
      let matchedRule: Rule | undefined;
      for (const rule of rules) {
        if (transaction_amount >= rule.min_amount_spent) {
          matchedRule = rule;
          break;
        }
      }

      if (!matchedRule) {
        throw new BadRequestException(
          `No applicable burn rule for transaction amount`,
        );
      }
      //#endregion

      //#region Step 5: Calculate burnable points and discount
      // Step 5.1: Start with min(wallet balance, max redemption limit)
      let pointsToBurn = Math.min(
        wallet.available_balance,
        matchedRule.max_redeemption_points_limit,
      );

      // Step 5.2: Convert points into discount
      let discountAmount = pointsToBurn * matchedRule.points_conversion_factor;

      // Step 5.3: Calculate allowed maximum discount based on % of invoice
      const maxAllowedDiscount =
        (transaction_amount * matchedRule.max_burn_percent_on_invoice) / 100;

      // Step 5.4: If discount exceeds allowed % cap, adjust both discount and points
      if (discountAmount > maxAllowedDiscount) {
        discountAmount = maxAllowedDiscount;
        pointsToBurn = Math.floor(
          discountAmount / matchedRule.points_conversion_factor,
        );
      }
      //#endregion

      //#region Step 6: Create burn transaction in wallet
      const burnPayload = {
        invoice_id: invoice_id,
        customer_id: customer.id,
        business_unit_id: customer.business_unit?.id,
        wallet_id: wallet.id,
        type: WalletTransactionType.BURN,
        amount: transaction_amount,
        point_balance: pointsToBurn,
        status: WalletTransactionStatus.NOT_CONFIRMED,
        // source_type: matchedRule?.locales?.[0].name,
        source_type: 'transaction',
        source_id: matchedRule.id,
        description: remarks
          ? remarks
          : `Burned ${pointsToBurn} points for discount of ${discountAmount} on amount ${transaction_amount}`,
        external_program_type: from_app ? from_app : null,
        created_at: dayjs().toDate(),
        transaction_reference: remarks ? remarks : null,
      };

      const tx = await this.walletService.addTransaction(
        {
          ...burnPayload,
          wallet_order_id: null,
          wallet_id: wallet?.id,
          business_unit_id: customer?.business_unit?.id,
          prev_available_points: wallet.available_balance,
          points_balance: pointsToBurn,
        },
        customer?.id,
        true,
      );
      //#endregion

      //#region Step 7: OTP linking or generation (otp_burn_required tenants only)
      //
      // Hybrid flow:
      //   Path A — An active OTP already exists for this customer (unlinked or
      //     linked to a previous tx from a duplicate cashier call):
      //     → re-link it to the current transaction, no notification fired.
      //     → handles both: customer pre-generated on app (null) and cashier
      //       calling request-transaction multiple times (already linked).
      //   Path B — No active OTP exists at all:
      //     → generate a fresh OTP, link it to this transaction, push notification.
      //
      // Both paths converge at confirm-transaction with no changes needed there.
      if (customer.tenant.otp_burn_required) {
        const ttlMinutes = customer.tenant.otp_burn_ttl_minutes ?? 5;
        const now = new Date();

        // Look for ANY active OTP for this customer — unlinked (pre-generated on app)
        // or already linked to a previous transaction (duplicate cashier call).
        // Re-linking to the current tx ensures only one valid OTP exists at a time.
        const existingOtp = await this.burnOtpRepo.findOne({
          where: {
            customer_id: customer.id,
            used: 0,
            expires_at: MoreThan(now),
          },
        });

        if (existingOtp) {
          // Path A: link (or re-link) to the current transaction.
          // Prevents duplicate OTP records when cashier calls request-transaction
          // multiple times for the same customer.
          existingOtp.transaction_uuid = tx.uuid;
          existingOtp.cashier_request_count += 1;
          await this.burnOtpRepo.save(existingOtp);
        } else {
          // Path B: no pre-generated OTP — create one and push to customer's device.
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

          const expiresAt = dayjs().add(ttlMinutes, 'minute').toDate();

          const otpRecord = this.burnOtpRepo.create({
            otp,
            customer: { id: customer.id } as any,
            customer_id: customer.id,
            tenant_id: customer.tenant.id,
            business_unit_id: customer.business_unit.id,
            transaction_uuid: tx.uuid,
            used: 0,
            expires_at: expiresAt,
            used_at: null,
            app_generate_count: 0,
            cashier_request_count: 1,
          });
          await this.burnOtpRepo.save(otpRecord);

          // Fire push notification so customer sees OTP on their phone
          const deviceTokens = await this.deviceTokenRepo.find({
            where: { customer: { id: customer.id } },
            order: { createdAt: 'DESC' },
          });

          if (deviceTokens.length) {
            const tokensString = deviceTokens.map((t) => t.token).join(',');
            try {
              await this.notificationService.sendToUser(
                {
                  template_id: process.env.OTP_BURN_TEMPLATE_ID,
                  language_code: 'en',
                  business_name: 'PETROMINit',
                  to: [
                    {
                      user_device_token: tokensString,
                      customer_mobile: decrypt(customer.hashed_number),
                      dynamic_fields: {
                        otp,
                        ttlMinutes: ttlMinutes.toString(),
                      },
                    },
                  ],
                },
                {
                  title: 'Redemption OTP',
                  body: `Your redemption OTP is ${otp}. Share it with the cashier. Expires in ${ttlMinutes} minutes.`,
                  customer_id: customer.id,
                },
              );
            } catch (err) {
              console.error(
                'Failed to send OTP notification:',
                err.response?.data || err.message,
              );
              // Non-fatal — transaction is already created; log and continue
            }
          }
        }
      }
      //#endregion

      //#region Step 9: Build and return response
      return {
        success: true,
        message: `You can burn ${pointsToBurn} points for discount of ${discountAmount}`,
        result: {
          customer_id: customer.uuid,
          customer_phone_number,
          transaction_id: tx.uuid,
          transaction_amount: tx.amount,
          max_burn_point: pointsToBurn,
          max_burn_amount: discountAmount,
          redemption_factor: matchedRule.points_conversion_factor,
          from_app: from_app,
        },
        errors: [],
      };
      //#endregion
    } catch (error) {
      console.log(
        '////////error req transaction in burning catch block',
        error,
      );
      //#region Step 10: Error handling
      throw new BadRequestException({
        success: false,
        message: 'Failed to burn transaction',
        result: null,
        errors: error.message,
      });
      //#endregion
    }
  }
  //#endregion

  //#region Confirm Burn Transaction
  /**
   * Confirms a pending burn transaction by applying the provided burn points.
   *
   * Flow:
   *  1. Validate transaction exists (PENDING).
   *  2. Validate customer + wallet.
   *  3. Apply burn points from payload (capped by wallet balance).
   *  4. Recalculate discount and final amount.
   *  5. Update transaction status to ACTIVE.
   *  6. Return structured response.
   */
  async confirmBurnTransaction(body) {
    //#region Step 1: Extract request body
    const { transaction_id, burn_point, coupon_code, otp } = body;
    //#endregion

    try {
      //#region Step 2: Find existing pending transaction
      const transaction = await this.walletTxnRepo.findOne({
        where: { uuid: transaction_id },
        relations: ['customer'],
      });

      if (!transaction) {
        throw new NotFoundException(`Transaction not found`);
      }

      if (transaction.status !== WalletTransactionStatus.NOT_CONFIRMED) {
        throw new BadRequestException(`Transaction already processed`);
      }
      //#endregion

      //#region Step 3: Find customer & wallet

      console.log(' transaction', transaction.customer);

      const customer = await this.customerRepo.findOne({
        where: { id: transaction.customer.id, status: 1 },
        relations: ['tenant', 'business_unit'],
      });

      if (!customer) {
        throw new NotFoundException(`Customer not found`);
      }

      // if (customer.status === 0) {
      //   throw new BadRequestException(`Customer is inactive`);
      // }

      // if (customer.status === 3) {
      //   throw new BadRequestException(`Customer is deleted`);
      // }

      const wallet = await this.walletService.getSingleCustomerWalletInfo(
        customer.id,
        customer.business_unit.id,
      );

      if (!wallet) {
        throw new NotFoundException(`Customer wallet not configured`);
      }
      //#endregion

      //#region Step 3b: OTP validation (otp_burn_required tenants only)
      if (customer.tenant.otp_burn_required) {
        if (!otp) {
          throw new BadRequestException(
            'OTP is required to confirm this transaction',
          );
        }

        // Normalise: strip whitespace + non-digits to handle " 382 910 " or "382-910"
        const normalizedOtp = String(otp).trim().replace(/\D/g, '');

        if (normalizedOtp.length !== 6) {
          throw new BadRequestException('OTP must be a 6-digit number');
        }

        const now = new Date();
        const otpRecord = await this.burnOtpRepo.findOne({
          where: {
            otp: normalizedOtp,
            transaction_uuid: transaction_id,
            customer_id: customer.id,
            used: 0,
            expires_at: MoreThan(now),
          },
        });

        if (!otpRecord) {
          throw new BadRequestException(
            'Invalid or expired OTP. Please initiate a new request-transaction.',
          );
        }

        // Mark consumed immediately — prevents replay on any retry
        otpRecord.used = 1;
        otpRecord.used_at = now;
        await this.burnOtpRepo.save(otpRecord);
      }
      //#endregion

      //#region Step 4: Validate burn points & calculate discount
      const appliedBurnPoints = Math.min(
        wallet.available_balance,
        Number(burn_point),
      );

      // fetch conversion factor from rule linked to transaction
      const rule = await this.ruleRepo.findOne({
        where: { id: transaction.source_id },
      });

      if (!rule) {
        throw new NotFoundException(`Burn rule not found for transaction`);
      }

      if (wallet.available_balance < burn_point) {
        throw new BadRequestException('Insufficient Points balance');
      }

      // 1) Cap by user's available balance and rule's max redemption limit
      let pointsToBurn = Math.min(
        burn_point,
        wallet.available_balance,
        rule.max_redeemption_points_limit,
      );

      // 2) Convert points to monetary discount
      let discountAmount = pointsToBurn * rule.points_conversion_factor;

      // 3) Calculate percentage cap (max allowed discount based on invoice)
      const maxAllowedDiscount =
        (transaction.amount * (rule.max_burn_percent_on_invoice ?? 0)) / 100;

      // 4) If calculated discount is greater than allowed percentage cap,
      //    cap the discount and recalculate the points to burn accordingly.
      if (discountAmount > maxAllowedDiscount) {
        // cap discount
        discountAmount = maxAllowedDiscount;

        // recompute points needed for this capped discount
        // floor to ensure we don't try to burn fractional points
        pointsToBurn = Math.floor(
          discountAmount / rule.points_conversion_factor,
        );

        // recalc discountAmount from floored points (to keep values consistent)
        discountAmount = pointsToBurn * rule.points_conversion_factor;
      }

      // Ensure non-negative final amount
      const finalAmount = Math.max(0, transaction.amount - discountAmount);
      //#endregion

      //#region Step 5: Update transaction
      transaction.point_balance = appliedBurnPoints; // ✅ store actual burned points here
      (transaction.prev_available_points = wallet.available_balance),
        (transaction.status = WalletTransactionStatus.ACTIVE);
      transaction.description = coupon_code
        ? `Applied coupon ${coupon_code}, burned ${appliedBurnPoints} points for discount of ${discountAmount}`
        : `Confirmed burn of ${appliedBurnPoints} points for discount of ${discountAmount}`;
      transaction.external_program_type =
        transaction.external_program_type ?? null;

      // already called addTransaction method in request transaction, we are confirm only that transaction here.
      const updatedTx = await this.walletTxnRepo.save(transaction);

      // wallet.available_balance -= appliedBurnPoints;
      // wallet.total_burned_points += appliedBurnPoints;
      wallet.available_balance -= pointsToBurn;
      wallet.total_burned_points += pointsToBurn;
      await this.walletRepo.save(wallet);

      //#endregion

      // const customerPreferences = await this.customerPreferencesRepo.findOne({
      //   where: {
      //     customer: { id: customer.id },
      //   },
      // });

      // if (customerPreferences && customerPreferences?.push_notification) {
      const deviceTokens = await this.deviceTokenRepo.find({
        where: { customer: { id: customer.id } },
        order: { createdAt: 'DESC' },
      });

      const templateId = process.env.BURNED_POINTS_TEMPLATE_ID;

      const tokensString = deviceTokens.map((t) => t.token).join(',');

      try {
        // Prepare data payload
        const payload = {
          template_id: templateId,
          language_code: 'en', // or 'ar'
          business_name: 'PETROMINit',
          to: [
            {
              user_device_token: tokensString,
              customer_mobile: decrypt(customer.hashed_number),
              dynamic_fields: {
                appliedBurnPoints: appliedBurnPoints.toString(),
                discountAmount: discountAmount.toString(),
              },
            },
          ],
        };

        const saveNotificationPayload = {
          title: 'Points Burned',
          body: `You've Burned ${appliedBurnPoints} points and got a discount of ${discountAmount} SAR`,
          customer_id: customer.id,
        };

        // Send notification request
        await this.notificationService.sendToUser(
          payload,
          saveNotificationPayload,
        );
      } catch (err) {
        console.error(
          'Error while sending notification:',
          err.response?.data || err.message,
        );
      }
      // }

      //#region Step 6: Build and return response
      return {
        success: true,
        message: 'Your transaction has been completed successfully',
        result: {
          customer_id: customer.uuid,
          customer_phone_number: decrypt(customer.hashed_number),
          transaction_id: updatedTx.uuid,
          transaction_amount: transaction.amount,
          loyalty_discount: discountAmount,
          final_amount: finalAmount > 0 ? finalAmount : 0,
          loyalty_points_burned: appliedBurnPoints,
        },
        errors: [],
      };
      //#endregion
    } catch (error) {
      //#region Step 7: Error handling
      throw new BadRequestException({
        success: false,
        message: 'Failed to confirm transaction',
        result: null,
        errors: error.message,
      });
      //#endregion
    }
  }
  //#endregion

  // ═══════════════════════════════════════════════════════════════════════════
  // APP-FACING OTP ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  //#region generateOtp
  /**
   * POST /burning/otp/generate  — called by the APP (no MAC JWT required)
   *
   * Customer taps "Generate Redemption Code" on the app screen.
   *
   * Three cases handled:
   *   1. Active OTP already exists (not expired, not used) → return it as-is
   *      with remaining TTL. Covers both:
   *        a. Customer pre-generated before cashier acted (transaction_uuid = null)
   *        b. Cashier already called request-transaction and linked this OTP
   *           (transaction_uuid set) — customer sees same code cashier is holding
   *
   *   2. No active OTP + pending burn transaction exists → cashier already called
   *      request-transaction but the OTP expired. Generate new OTP and link it
   *      directly to the pending transaction so cashier can confirm without
   *      re-initiating request-transaction.
   *
   *   3. No active OTP + no pending transaction → fresh generate, saved unlinked
   *      (transaction_uuid = null). request-transaction will claim it later.
   */
  async generateOtp(dto: GenerateOtpDto) {
    const customer = await this.customerRepo.findOne({
      where: { uuid: dto.customer_id, status: 1 },
      relations: ['tenant', 'business_unit'],
    });

    if (!customer) {
      throw new NotFoundException('Customer not found or inactive');
    }

    const tenant = await this.tenantRepo.findOne({
      where: { id: customer.tenant.id },
    });

    if (!tenant.otp_burn_required) {
      throw new BadRequestException(
        'OTP burn is not enabled for this account. Contact support.',
      );
    }

    const ttlMinutes = tenant.otp_burn_ttl_minutes ?? 5;
    const now = new Date();

    // Case 1: active OTP already exists — return it with remaining time.
    // Covers pre-generated (unlinked) and already-linked (cashier initiated) OTPs.
    const existing = await this.burnOtpRepo.findOne({
      where: {
        customer_id: customer.id,
        used: 0,
        expires_at: MoreThan(now),
      },
    });

    if (existing) {
      // Customer tapped the button again while OTP is still active — increment counter.
      existing.app_generate_count += 1;
      await this.burnOtpRepo.save(existing);

      const secondsLeft = Math.floor(
        (existing.expires_at.getTime() - now.getTime()) / 1000,
      );
      return {
        success: true,
        otp: existing.otp,
        expires_in_seconds: secondsLeft,
      };
    }

    // No active OTP — generate a fresh unique one.
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

    const expiresAt = dayjs().add(ttlMinutes, 'minute').toDate();

    // Case 2 vs Case 3 — determine whether to link to an existing pending transaction.
    //
    // We only link if there is PROOF the cashier already called request-transaction:
    // an expired BurnOtp record that was linked to a transaction_uuid. This record
    // being expired (not just missing) is the evidence.
    //
    // We do NOT blindly query wallet_transactions for any NOT_CONFIRMED record —
    // that would incorrectly link a fresh app-generated OTP to old abandoned
    // transactions sitting in the DB from previous sessions.
    const expiredLinkedOtp = await this.burnOtpRepo.findOne({
      where: {
        customer_id: customer.id,
        used: 0,
        // expires_at <= now means it expired — intentionally no MoreThan filter here
      },
      order: { expires_at: 'DESC' }, // most recently expired first
    });

    let linkedTransactionUuid: string | null = null;

    if (expiredLinkedOtp?.transaction_uuid) {
      // Verify the linked transaction is still pending (cashier hasn't abandoned it)
      const pendingTx = await this.walletTxnRepo.findOne({
        where: {
          uuid: expiredLinkedOtp.transaction_uuid,
          status: WalletTransactionStatus.NOT_CONFIRMED,
        },
      });
      if (pendingTx) {
        // Case 2: cashier's OTP expired — link new OTP to the same pending tx.
        // Cashier doesn't need to re-call request-transaction.
        linkedTransactionUuid = pendingTx.uuid;
      }
      // If pendingTx not found: transaction was already confirmed or doesn't exist.
      // Fall through to Case 3 (save unlinked).
    }
    // Case 3: no expired linked OTP found — customer is pre-generating before
    // the cashier acts. Save unlinked; request-transaction will claim it later.

    const record = this.burnOtpRepo.create({
      otp,
      customer: { id: customer.id } as any,
      customer_id: customer.id,
      tenant_id: customer.tenant.id,
      business_unit_id: customer.business_unit.id,
      transaction_uuid: linkedTransactionUuid,
      used: 0,
      expires_at: expiresAt,
      used_at: null,
      app_generate_count: 1,
      cashier_request_count: 0,
    });

    await this.burnOtpRepo.save(record);

    return {
      success: true,
      otp,
      expires_in_seconds: ttlMinutes * 60,
    };
  }
  //#endregion

  //#region verifyOtp
  /**
   * POST /burning/otp/verify  — called by MAC (requires Rusty JWT)
   * Legacy standalone verify — kept for backwards compatibility.
   * In the current flow, OTP verification is handled inside confirmBurnTransaction().
   *
   * Cashier types the 6-digit OTP shown on the customer's phone screen.
   * This method:
   *   1. Resolves customer from phone
   *   2. Finds a matching, unexpired, unused OTP record
   *   3. Marks it as used (one-time use — cannot be replayed)
   *   4. Returns customer info + points + discount so MAC can proceed
   *      directly to request-transaction with correct values
   */
  async verifyOtp(dto: VerifyOtpDto) {
    // ── Normalise phone ───────────────────────────────────────────────────
    // Strip everything that is not a digit, then prepend exactly one +
    // so it matches how hashed_number is stored.
    // Handles all of:
    //   "+966 501 234 567"  →  "+966501234567"
    //   "966-501-234-567"   →  "+966501234567"
    //   " +966501234567 "   →  "+966501234567"
    //   "+966501234567"     →  "+966501234567"  (already correct)
    const digitsOnly = dto.customer_phone.replace(/\D/g, '');
    const hashedPhone = encrypt('+' + digitsOnly);

    const customer = await this.customerRepo.findOne({
      where: { hashed_number: hashedPhone, status: 1 },
      relations: ['tenant', 'business_unit'],
    });

    if (!customer) {
      throw new NotFoundException('Customer not found or inactive');
    }

    // ── Normalise OTP ─────────────────────────────────────────────────────
    // Trim whitespace and keep only digits in case the cashier's input
    // added stray characters (e.g. "382 910" → "382910", " 123456 " → "123456")
    const normalizedOtp = dto.otp.trim().replace(/\D/g, '');

    if (normalizedOtp.length !== 6) {
      throw new BadRequestException('OTP must be a 6-digit number');
    }

    const now = new Date();

    // Find a valid OTP: correct code + correct customer + not used + not expired
    const otpRecord = await this.burnOtpRepo.findOne({
      where: {
        otp: normalizedOtp,
        customer_id: customer.id,
        used: 0,
        expires_at: MoreThan(now),
      },
    });

    if (!otpRecord) {
      throw new BadRequestException(
        'Invalid or expired OTP. Ask the customer to generate a new one.',
      );
    }

    // Mark as used immediately — prevents replay attacks
    otpRecord.used = 1;
    otpRecord.used_at = now;
    await this.burnOtpRepo.save(otpRecord);

    // Fetch wallet and burn rule in parallel
    const [wallet, rule] = await Promise.all([
      this.walletService.getSingleCustomerWalletInfo(
        customer.id,
        customer.business_unit.id,
      ),
      this.ruleRepo.findOne({
        where: {
          rule_type: 'burn',
          tenant_id: customer.tenant.id,
          business_unit_id: customer.business_unit.id,
          status: 1,
        },
      }),
    ]);

    const availablePoints = wallet?.available_balance ?? 0;

    // Calculate the SAR equivalent of the customer's full available balance.
    // We don't have a transaction_amount here yet (that comes at request-transaction),
    // so we can't apply the invoice % cap — MAC uses these values to show the
    // cashier what the customer has and the per-point value before entering the invoice.
    let equivalentAmount = 0;
    let pointsConversionFactor = 0;
    let maxRedeemablePoints = availablePoints;

    if (rule) {
      pointsConversionFactor = rule.points_conversion_factor;
      // Cap by the rule's hard per-transaction point limit
      maxRedeemablePoints = Math.min(
        availablePoints,
        rule.max_redeemption_points_limit,
      );
      equivalentAmount = +(
        maxRedeemablePoints * pointsConversionFactor
      ).toFixed(2);
    }

    return {
      success: true,
      message: 'OTP verified successfully',
      result: {
        customer_name: customer.name,
        customer_phone: dto.customer_phone,
        // Points currently in the wallet
        available_points: availablePoints,
        // Max points allowed by the burn rule per transaction
        max_redeemable_points: maxRedeemablePoints,
        // SAR value of max_redeemable_points (before invoice % cap)
        equivalent_amount_sar: equivalentAmount,
        // How much 1 point is worth in SAR — MAC can use this to recalculate
        // the exact discount once the cashier enters the invoice amount
        points_conversion_factor: pointsConversionFactor,
      },
    };
  }
  //#endregion
}
