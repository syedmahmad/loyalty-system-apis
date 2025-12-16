import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GetCustomerDataDto } from '../dto/burning.dto';
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
    } = body;

    const hashedPhone = encrypt(customer_phone_number);
    console.log('/////////customer_id//////////', customer_id);
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
        customer_id: customer.id,
        business_unit_id: customer.business_unit.id,
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

      //#region Step 7: Build and return response
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
        },
        errors: [],
      };
      //#endregion
    } catch (error) {
      //#region Step 8: Error handling
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
    const { transaction_id, burn_point, coupon_code } = body;
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

      const updatedTx = await this.walletTxnRepo.save(transaction);

      wallet.available_balance -= appliedBurnPoints;
      wallet.total_burned_points += appliedBurnPoints;
      await this.walletRepo.save(wallet);
      //#endregion

      const customerPreferences = await this.customerPreferencesRepo.findOne({
        where: {
          customer: { id: customer.id },
        },
      });

      if (customerPreferences && customerPreferences?.push_notification) {
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
      }

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
}
