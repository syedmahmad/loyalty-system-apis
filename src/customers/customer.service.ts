import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as QRCode from 'qrcode';
import { In, LessThanOrEqual, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { BulkCreateCustomerDto } from './dto/create-customer.dto';
import { Request } from 'express';
import * as dayjs from 'dayjs';
import { Customer } from './entities/customer.entity';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import { OciService } from 'src/oci/oci.service';
import { v4 as uuidv4 } from 'uuid';
import { nanoid } from 'nanoid';
import { QrCode } from '../qr_codes/entities/qr_code.entity';
import { QrcodesService } from '../qr_codes/qr_codes/qr_codes.service';
import { CustomerActivity } from './entities/customer-activity.entity';
import { TiersService } from 'src/tiers/tiers/tiers.service';
import { Rule } from 'src/rules/entities/rules.entity';
import {
  WalletTransaction,
  WalletTransactionStatus,
  WalletTransactionType,
} from 'src/wallet/entities/wallet-transaction.entity';
import { CampaignsService } from 'src/campaigns/campaigns/campaigns.service';
import { CampaignCustomerSegment } from 'src/campaigns/entities/campaign-customer-segments.entity';
import { CampaignRule } from 'src/campaigns/entities/campaign-rule.entity';
import { CreateCustomerActivityDto } from './dto/create-customer-activity.dto';
import { CustomerEarnDto } from './dto/customer-earn.dto';
import { CampaignCoupons } from 'src/campaigns/entities/campaign-coupon.entity';
import { CouponTypeService } from 'src/coupon_type/coupon_type/coupon_type.service';
import { CustomerSegmentMember } from 'src/customer-segment/entities/customer-segment-member.entity';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { Coupon } from 'src/coupons/entities/coupon.entity';
import {
  CouponStatus,
  UserCoupon,
} from 'src/wallet/entities/user-coupon.entity';
import { EarnWithEvent } from 'src/customers/dto/earn-with-event.dto';
import { WalletSettings } from 'src/wallet/entities/wallet-settings.entity';
import { WalletOrder } from 'src/wallet/entities/wallet-order.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BurnWithEvent } from './dto/burn-with-event.dto';
import { omit } from 'lodash';
import { Wallet } from 'src/wallet/entities/wallet.entity';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly walletService: WalletService,
    private readonly ociService: OciService,
    @InjectRepository(QrCode)
    private readonly qrCodeRepo: Repository<QrCode>,
    private readonly qrService: QrcodesService,
    private readonly tiersService: TiersService,
    @InjectRepository(Rule)
    private readonly ruleRepo: Repository<Rule>,
    @InjectRepository(WalletTransaction)
    private txRepo: Repository<WalletTransaction>,
    @InjectRepository(Wallet)
    private walletRepo: Repository<Wallet>,
    @InjectRepository(WalletOrder)
    private WalletOrderrepo: Repository<WalletOrder>,
    @InjectRepository(WalletSettings)
    private walletSettingsRepo: Repository<WalletSettings>,
    private readonly campaignsService: CampaignsService,
    @InjectRepository(CampaignCustomerSegment)
    private readonly campaignCustomerSegmentRepo: Repository<CampaignCustomerSegment>,
    @InjectRepository(CampaignRule)
    private readonly campaignRuleRepo: Repository<CampaignRule>,
    @InjectRepository(CustomerActivity)
    private readonly customeractivityRepo: Repository<CustomerActivity>,
    @InjectRepository(CampaignCoupons)
    private readonly campaignCouponRepo: Repository<CampaignCoupons>,
    private readonly couponTypeService: CouponTypeService,
    @InjectRepository(CustomerSegmentMember)
    private readonly customerSegmentMemberRepository: Repository<CustomerSegmentMember>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(Coupon)
    private readonly couponRepo: Repository<Coupon>,

    @InjectRepository(UserCoupon)
    private userCouponRepo: Repository<UserCoupon>,
  ) {}

  async createCustomer(req: Request, dto: BulkCreateCustomerDto) {
    const businessUnit = (req as any).businessUnit;

    if (!businessUnit) {
      throw new BadRequestException('Invalid Business Unit Key');
    }

    const customerUuid = uuidv4();

    const results = [];
    for (const customerDto of dto.customers) {
      if (!customerDto.phone) {
        results.push({
          status: 'failed',
          message: 'Phone number is required',
        });
        continue;
      }

      const existing = await this.customerRepo.findOne({
        where: {
          external_customer_id: customerDto.external_customer_id,
          business_unit: { id: businessUnit.id },
        },
      });

      if (existing) {
        if (!existing.uuid) {
          existing.uuid = customerUuid;
          await this.customerRepo.save(existing);
        }

        let existCustomerQr = await this.qrService.findOne(existing.id);

        if (!existCustomerQr) {
          existCustomerQr = await this.createAndSaveCustomerQrCode(
            customerUuid,
            existing.id,
          );
        }

        results.push({
          status: 'exists',
          qr_code_url: `/qrcodes/qr/${existCustomerQr.short_id}`,
        });
        continue;
      }

      const encryptedEmail = await this.ociService.encryptData(
        customerDto.email,
      );
      const encryptedPhone = await this.ociService.encryptData(
        customerDto.phone,
      );

      const customer = this.customerRepo.create({
        ...customerDto,
        email: encryptedEmail,
        phone: encryptedPhone,
        DOB: new Date(customerDto.DOB),
        business_unit: businessUnit,
        uuid: customerUuid,
      });
      const saved = await this.customerRepo.save(customer);

      const saveCustomerQrCodeInfo = await this.createAndSaveCustomerQrCode(
        customerUuid,
        saved.id,
      );
      // TODO: need to check existing wallet for customer, his point balance.
      // how to do that,
      // create a new transaction for customer wallet and add reason of adjustment like import form external system
      // and then add points to customer wallet
      await this.walletService.createWallet({
        customer_id: saved.id,
        business_unit_id: businessUnit.id,
      });

      results.push({
        status: 'created',
        // TODO: baseUrl is wrong, we do not allow direct admin API access, all communication should be through gatwway
        qr_code_url: `/qrcodes/qr/${saveCustomerQrCodeInfo.short_id}`,
      });
    }

    return results;
  }

  async getCustomerById(id: number) {
    const customer = await this.customerRepo.findOne({
      where: { id },
    });

    if (!customer) {
      throw new Error(`Customer with ID ${id} not found`);
    }

    return customer;
  }

  async getAllCustomers(search?: string) {
    const query = this.customerRepo
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.business_unit', 'business_unit')
      .leftJoinAndSelect('business_unit.tenant', 'tenant');

    if (search) {
      query.where('customer.name LIKE :search', { search: `%${search}%` });
    }

    return await query.orderBy('customer.created_at', 'DESC').getMany();
  }

  async updateStatus(id: number, status: 0 | 1) {
    const customer = await this.customerRepo.findOne({ where: { id } });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    customer.status = status;
    return this.customerRepo.save(customer);
  }

  async getCustomerByUuid(req: Request, uuid: string) {
    const businessUnit = (req as any).businessUnit;

    if (!businessUnit) {
      throw new BadRequestException('Invalid Business Unit Key');
    }

    const customer = await this.customerRepo.findOne({
      where: { uuid: uuid },
    });

    if (!customer) {
      throw new NotFoundException(`Customer not found`);
    }

    const walletinfo = await this.walletService.getSingleCustomerWalletInfo(
      customer.id,
      businessUnit.id,
    );
    const transactionInfo = await this.walletService.getWalletTransactions(
      walletinfo?.id,
    );
    return {
      total_balance: walletinfo?.total_balance,
      available_balance: walletinfo?.available_balance,
      locked_balance: walletinfo?.locked_balance,
      customer_name: customer.name,
      city: customer.city,
      address: customer.address,
      businessUnit: walletinfo?.business_unit?.name,
      tenant_id: walletinfo?.business_unit?.tenant_id,
      transactions: transactionInfo || [],
    };
  }

  async createAndSaveCustomerQrCode(customerUuid, customerId) {
    const shortId = nanoid(8);
    const customerQrcode = await QRCode?.toDataURL(customerUuid);
    const mapping = this.qrCodeRepo.create({
      customer: { id: customerId },
      short_id: shortId,
      qr_code_base64: customerQrcode,
    });
    return await this.qrCodeRepo.save(mapping);
  }

  async getCustomerWithWalletAndTransactions(
    req: Request,
    customerId: number,
    pointPage: number = 1,
    couponPage: number = 1,
    pageSize: number,
    pointQuery: string,
    couponQuery: string,
  ) {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId },
    });

    const walletinfo = await this.walletService.getSingleCustomerWalletInfoById(
      customer.id,
    );

    const transactionInfo = await this.walletService.getWalletTransactions(
      walletinfo?.id,
      pointPage,
      pageSize,
      pointQuery,
    );

    const couponTransactionInfo =
      await this.walletService.getWalletTransactions(
        walletinfo?.id,
        couponPage,
        pageSize,
        couponQuery,
        'coupon',
      );

    const tiersInfo =
      await this.tiersService.getCurrentCustomerTier(customerId);

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${customerId} not found`);
    }

    return {
      ...customer,
      wallet: walletinfo,
      transactions: transactionInfo,
      couponTransactionInfo: couponTransactionInfo,
      tier: tiersInfo,
    };
  }

  async createCustomerActivity(body: CreateCustomerActivityDto) {
    const customer = await this.customerRepo.findOne({
      where: { uuid: body.customer_uuid },
    });

    if (!customer) {
      throw new NotFoundException(`Customer not found`);
    }

    const customerActivity = this.customeractivityRepo.create({
      ...body,
    });

    return this.customeractivityRepo.save(customerActivity);
  }

  async earnPoints(bodyPayload: CustomerEarnDto) {
    const { customer_id, campaign_type, campaign_id } = bodyPayload;

    // Step 1: Get Customer & Wallet Info
    const customer = await this.customerRepo.findOne({
      where: { uuid: customer_id },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const wallet = await this.walletService.getSingleCustomerWalletInfoById(
      customer.id,
    );
    if (!wallet) throw new NotFoundException('Wallet not found');

    if (campaign_id && !campaign_type) {
      throw new BadRequestException('campaign_type is missing');
    }

    // Step 2: handling CampaignRuleEarning, SimpleRuleEarning and CampaignCouponEarning
    return campaign_type
      ? this.handleCampaignEarning({ ...bodyPayload, wallet })
      : this.handleRuleEarning({
          ...bodyPayload,
          wallet,
        });
  }

  async earnWithEvent(bodyPayload: EarnWithEvent) {
    const { customer_id, event, BUId, metadata } = bodyPayload;
    // 1. Find customer by uuid
    const customer = await this.customerRepo.findOne({
      where: { uuid: customer_id, business_unit: { id: parseInt(BUId) } },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    // 2. Find earning rule by event name (case-insensitive)
    const rule = await this.ruleRepo.findOne({
      where: {
        status: 1,
        name: event,
        rule_type: Not('burn'),
        // event_triggerer: 'event based earn',
      },
    });
    if (!rule)
      throw new NotFoundException('Earning rule not found for this event');

    // // 3. Get customer wallet info
    const wallet = await this.walletService.getSingleCustomerWalletInfoById(
      customer.id,
    );
    if (!wallet) throw new NotFoundException('Wallet not found');

    // 4. Check frequency and if user already got this reward
    // const alreadyRewarded = false;
    // Find previous wallet transaction for this event, customer, and business_unit
    const txWhere: any = {
      wallet: { id: wallet.id },
      business_unit: { id: parseInt(BUId) },
      type: 'earn',
      source_type: event,
    };
    // if (walletOrderId) txWhere.wallet_order_id = walletOrderId;

    const previousTx = await this.txRepo.findOne({
      where: txWhere,
      order: { created_at: 'DESC' },
    });

    // Frequency logic
    if (rule.frequency === 'once' && previousTx) {
      throw new BadRequestException(
        'Reward for this event already granted (once per customer)',
      );
    }
    if (rule.frequency === 'daily' && previousTx) {
      // Check if already rewarded today
      const today = dayjs().startOf('day');
      const txDate = dayjs(previousTx.created_at).startOf('day');
      if (txDate.isSame(today)) {
        throw new BadRequestException(
          'Reward for this event already granted today',
        );
      }
    }
    if (rule.frequency === 'yearly' && previousTx) {
      // Check if already rewarded this year
      const thisYear = dayjs().year();
      const txYear = dayjs(previousTx.created_at).year();
      if (txYear === thisYear) {
        throw new BadRequestException(
          'Reward for this event already granted this year',
        );
      }
    }
    // 'anytime' means no restriction

    // 5. Calculate reward points
    let rewardPoints = rule.reward_points;
    const Orderamount = metadata?.amount ? Number(metadata.amount) : undefined;

    if (rule.rule_type === 'spend and earn') {
      if (!Orderamount) {
        throw new BadRequestException(
          'Amount is required for spend and earn rule',
        );
      }
      // in this case give rewards in the multple of what user spends.
      if (rule.reward_condition === 'perAmount') {
        // Points per amount spent
        const multiplier = Math.floor(Orderamount / rule.min_amount_spent);
        rewardPoints = multiplier * rewardPoints;
      } else if (
        rule.reward_condition === 'minimum' ||
        rule.reward_condition === null
      ) {
        if (Orderamount < rule.min_amount_spent) {
          throw new BadRequestException(
            `Minimum amount to earn points is ${rule.min_amount_spent}`,
          );
        }
        // Give fixed reward points, I think, don't need to assign it again.
        // rewardPoints = rule.reward_points;
      }
    }

    if (!rewardPoints || rewardPoints <= 0) {
      throw new BadRequestException('No reward points to grant');
    }

    const walletSettings = await this.walletSettingsRepo.findOne({
      where: { business_unit: { id: parseInt(BUId) } },
    });

    // 6. Check business unit's pending_method
    const pendingMethod = walletSettings?.pending_method || 'none';
    const pendingDays = walletSettings?.pending_days || 0;
    // Via the cron job to unlcok these locked balance on each midnight.

    // 7. Update wallet balances because it is priority
    if (pendingMethod === 'none') {
      // Immediately add to available_balance and total_balance
      wallet.available_balance += rewardPoints;
      wallet.total_balance += rewardPoints;
      await this.walletService.updateWalletBalances(wallet.id, {
        available_balance: wallet.available_balance,
        total_balance: wallet.total_balance,
      });
    } else if (pendingMethod === 'fixed_days') {
      // Add to locked_balance and total_balance, available_balance unchanged
      wallet.locked_balance += rewardPoints;
      wallet.total_balance += rewardPoints;
      await this.walletService.updateWalletBalances(wallet.id, {
        locked_balance: wallet.locked_balance,
        total_balance: wallet.total_balance,
      });
      // Cron job will unlock after pending_days
    }

    // 8. Now, we need to generate wallet_order if any
    // const walletOrderId: number | null = null;
    // Try to map metadata to wallet_order if possible (optional, depends on event)
    // For event-based, wallet_order may not exist, so we keep it null
    let walletOrderRes;
    if (metadata) {
      // Check if metadata is present, is an object, and contains 'amount'
      if (
        metadata &&
        typeof metadata === 'object' &&
        metadata.amount !== undefined
      ) {
        // You can access metadata.amount here if needed
        // For example, you might want to log or process the amount
        console.log('Amount in metadata:', metadata);
        // Add any additional logic here as required

        const walletOrder: Partial<WalletOrder> = {
          wallet: wallet, // pass the full Wallet entity instance
          // wallet_order_id: walletOrderId,
          business_unit: wallet.business_unit, // pass the full BusinessUnit entity instance
          amount: metadata.amount,
          store_id: metadata.store_id,
          product_type: metadata.product_type,
          quantity: metadata.quantity as string,
          discount: 0,
          subtotal: 0,
        };

        // Save order or metatDataInfo
        walletOrderRes = await this.WalletOrderrepo.save(walletOrder);
      }
    }

    // 9. Create wallet_transaction
    const walletTransaction: Partial<WalletTransaction> = {
      wallet: wallet, // pass the full Wallet entity instance
      orders: walletOrderRes,
      // wallet_order_id: walletOrderId,
      business_unit: wallet.business_unit, // pass the full BusinessUnit entity instance
      type: WalletTransactionType.EARN,
      source_type: event,
      amount: rewardPoints,
      status:
        pendingDays > 0
          ? WalletTransactionStatus.PENDING
          : WalletTransactionStatus.ACTIVE,
      description: `Earned ${rewardPoints} points ${event}`,
      // Set the unlock_date for the wallet transaction.
      // If there are pendingDays (i.e., points are locked for a period), set unlock_date to the date after pendingDays.
      // Otherwise, set unlock_date to null (no unlock needed).
      unlock_date:
        pendingDays > 0 ? dayjs().add(pendingDays, 'day').toDate() : null,

      // Set the expiry_date for the wallet transaction.
      // If the rule has a validity_after_assignment value:
      //   - If there are pendingDays (i.e., points are locked for a period), expiry is after (pendingDays + validity_after_assignment) days.
      //   - If there are no pendingDays, expiry is after validity_after_assignment days.
      // If the rule does not have validity_after_assignment, expiry_date is null (no expiry).
      expiry_date: rule.validity_after_assignment
        ? pendingDays > 0
          ? dayjs()
              .add(pendingDays + rule.validity_after_assignment, 'day')
              .toDate()
          : dayjs().add(rule.validity_after_assignment, 'day').toDate()
        : null,
    };
    // Save transaction
    const savedTx = await this.txRepo.save(walletTransaction);
    console.log('savedTx', savedTx);

    return {
      message: 'Points earned successfully',
      points: rewardPoints,
      status: walletTransaction.status,
      transaction_id: savedTx.id,
      available_balance: wallet.available_balance,
      locked_balance: wallet.locked_balance,
      total_balance: wallet.total_balance,
    };
  }

  async burnWithEvent(bodyPayload: BurnWithEvent) {
    const { customer_id, metadata, event } = bodyPayload;

    if (!metadata.amount) {
      throw new BadRequestException('Amount is required in metadata');
    }

    const total_amount = Number(metadata.amount);

    const customerInfo = await this.customerRepo.find({
      where: { uuid: customer_id },
      relations: ['business_unit'],
    });

    const wallet = await this.walletRepo.findOne({
      where: { customer: { uuid: customer_id } },
      relations: ['business_unit'],
    });

    const customer = customerInfo[0];
    if (!customer) throw new NotFoundException('Customer not found');

    const rule = await this.ruleRepo.findOne({
      where: { name: event, status: 1, rule_type: 'burn' },
    });
    if (!rule)
      throw new NotFoundException('Burn rule not found for this campaign');

    // Step 5: Validate rule conditions
    if (total_amount < rule.min_amount_spent) {
      throw new BadRequestException(
        `Minimum amount to burn is ${rule.min_amount_spent}`,
      );
    }

    if (wallet.available_balance < rule.max_redeemption_points_limit) {
      throw new BadRequestException(
        `You don't have enough loyalty points, ${rule.max_redeemption_points_limit} loyalty point are required for this campaign and you've ${wallet.available_balance} loyalty points`,
      );
    }

    // Step 6: Determine applicable conversion rate
    const conversionRate = rule.points_conversion_factor;

    // Step 7: Calculate points and discount
    let discountAmount = 0;
    let pointsToBurn = 0;

    if (rule.burn_type === 'FIXED') {
      pointsToBurn = rule.max_redeemption_points_limit;
      discountAmount = pointsToBurn * conversionRate;
    } else if (rule.burn_type === 'PERCENTAGE') {
      discountAmount = (total_amount * rule.max_burn_percent_on_invoice) / 100;
      pointsToBurn = rule.max_redeemption_points_limit;
    } else {
      throw new BadRequestException('Invalid burn type in rule');
    }

    if (discountAmount > total_amount) {
      throw new BadRequestException(
        'Cannot gave discount because invoice amount is smaller than the discount amount',
      );
    }
    // Step 8: Create burn transaction
    // Import WalletTransactionType at the top if not already imported:
    // import { WalletTransactionType } from 'src/wallet/entities/wallet-transaction.entity';
    const burnPayload = {
      customer_id: customer.id,
      business_unit_id: customer.business_unit.id,
      wallet_id: wallet.id,
      type: WalletTransactionType.BURN,
      amount: pointsToBurn,
      status: WalletTransactionStatus.ACTIVE,
      source_type: rule.name,
      source_id: rule.id,
      description: `Burned ${pointsToBurn} points for discount of ${discountAmount} on amount ${total_amount}`,
    };

    // 8. Now, we need to generate wallet_order if any
    // const walletOrderId: number | null = null;
    // Try to map metadata to wallet_order if possible (optional, depends on event)
    // For event-based, wallet_order may not exist, so we keep it null
    let walletOrderRes;
    if (metadata) {
      // Check if metadata is present, is an object, and contains 'amount'
      if (
        metadata &&
        typeof metadata === 'object' &&
        metadata.amount !== undefined
      ) {
        // You can access metadata.amount here if needed
        // For example, you might want to log or process the amount
        console.log('Amount in metadata:', metadata);
        // Add any additional logic here as required

        const walletOrder: Partial<WalletOrder> = {
          wallet: wallet, // pass the full Wallet entity instance
          // wallet_order_id: walletOrderId,
          business_unit: wallet.business_unit, // pass the full BusinessUnit entity instance
          amount: metadata.amount,
          store_id: metadata.store_id,
          product_type: metadata.product_type,
          quantity: metadata.quantity as string,
          discount: 0,
          subtotal: 0,
        };

        // Save order or metatDataInfo
        walletOrderRes = await this.WalletOrderrepo.save(walletOrder);
      }
    }

    // Step 9: Create burn transaction in wallet

    await this.walletService.addTransaction(
      {
        ...burnPayload,
        wallet_order_id: walletOrderRes?.id,
        wallet_id: wallet?.id,
        business_unit_id: customer?.business_unit?.id,
      },
      customer?.id,
      true,
    );

    const walletInfo = await this.walletRepo.findOne({
      where: { id: wallet.id },
      relations: ['business_unit'],
    });

    const updatedOrder = {
      ...omit(walletOrderRes, ['wallet', 'business_unit']),
      discount: discountAmount,
      payable_amount: total_amount - discountAmount,
    };

    return {
      message: 'Burn successful',
      wallet: omit(walletInfo, ['customer', 'id', 'business_unit.id']),
      order: updatedOrder,
    };
  }

  async handleCampaignEarning(payload) {
    const {
      wallet,
      order,
      rule_info,
      campaign_type,
      campaign_id,
      coupon_info,
    } = payload;
    const { amount } = order ?? {};

    switch (campaign_type) {
      case 'POINTS': {
        // Step 1: get matching rule
        const { campaign_uuid, matchedRule } = await this.handleCampaignRules({
          customer_id: wallet.customer.id,
          business_unit_id: wallet.business_unit.id,
          rule_info,
          wallet,
          campaign_id,
          total_amount: amount,
        });

        if (!matchedRule) {
          throw new BadRequestException('No rule found for this event.');
        }

        this.validateSpecialConditions(matchedRule, wallet, rule_info);
        await this.checkAlreadyRewaredPoints(
          wallet?.business_unit.id,
          wallet?.id,
          matchedRule,
        );

        return this.processTransaction({
          matchedRule,
          wallet,
          order,
          source_type:
            matchedRule.rule_type === 'dynamic rule'
              ? matchedRule.condition_type
              : matchedRule.event_triggerer,
          campaignId: campaign_uuid,
        });
      }
      case 'COUPONS': {
        return await this.handleCampaignCoupons({
          campaign_id,
          wallet,
          coupon_info,
          amount,
          order,
        });
      }
      default:
        throw new BadRequestException(
          `Unsupported campaign type: ${campaign_type}`,
        );
    }
  }

  async handleRuleEarning(payload) {
    const { wallet, rule_info, order } = payload;

    // Step 1: Resolve matching rule
    const matchedRule = await this.getRule(rule_info.uuid, order);
    if (!matchedRule) {
      throw new BadRequestException('No earning rule found for this event.');
    }

    this.validateSpecialConditions(matchedRule, wallet, rule_info);
    await this.checkAlreadyRewaredPoints(
      wallet?.business_unit.id,
      wallet?.id,
      matchedRule,
    );

    return this.processTransaction({
      matchedRule,
      wallet,
      order,
      source_type:
        matchedRule.rule_type === 'dynamic rule'
          ? matchedRule.condition_type
          : matchedRule.event_triggerer,
    });
  }

  async getRule(uuid, order) {
    const { amount } = order ?? {};
    const rule = await this.ruleRepo.findOne({
      where: {
        status: 1,
        uuid: uuid,
        rule_type: Not('burn'),
      },
    });

    if (rule?.rule_type === 'spend and earn' && !amount) {
      throw new BadRequestException(`Amount is required`);
    }

    if (amount && amount < rule?.min_amount_spent) {
      throw new BadRequestException(
        `Minimum amount to earn points is ${rule.min_amount_spent}`,
      );
    }

    if (
      rule.reward_condition === 'perAmount' &&
      amount >= rule?.min_amount_spent
    ) {
      const multiplier = amount / rule?.min_amount_spent;
      rule.reward_points = multiplier * rule.reward_points;
    }

    return rule;
  }

  private validateSpecialConditions(
    matchedRule: any,
    wallet: any,
    rule_info: any,
  ) {
    // Birthday
    if (matchedRule.event_triggerer === 'birthday') {
      const today = new Date();
      const dob = new Date(wallet.customer.DOB);
      const isBirthday =
        today.getDate() === dob.getDate() &&
        today.getMonth() === dob.getMonth();

      if (!isBirthday) {
        throw new BadRequestException(
          "Today is not your birthday, so you're not eligible.",
        );
      }
    }

    // Dynamic rule
    if (matchedRule.rule_type === 'dynamic rule') {
      if (matchedRule.condition_type !== rule_info.condition_type) {
        throw new BadRequestException(
          `Expected condition '${matchedRule.condition_type}' but got '${rule_info.condition_type}'`,
        );
      }

      const isSatisfy = this.isSatisfyingDynamicCondition(
        rule_info.condition_value,
        matchedRule.condition_operator,
        matchedRule.condition_value,
      );

      if (!isSatisfy) {
        throw new BadRequestException(
          `Condition '${matchedRule.condition_type}' did not satisfy '${matchedRule.condition_operator} ${matchedRule.condition_value}'`,
        );
      }
    }
  }

  private async processTransaction({
    matchedRule,
    wallet,
    order,
    source_type,
    campaignId,
  }: {
    matchedRule: any;
    wallet: any;
    order?: any;
    source_type: string;
    campaignId?: string;
  }) {
    const earnPoints = matchedRule.reward_points || 0;
    const currentDate = new Date();

    const payload: any = {
      customer_id: wallet.customer.id,
      business_unit_id: wallet.business_unit.id,
      wallet_id: wallet.id,
      type: 'earn',
      amount: earnPoints,
      status: 'active',
      source_type,
      source_id: matchedRule.id,
      description: `Earned ${earnPoints} points (${matchedRule.name})`,
    };

    if (matchedRule.validity_after_assignment) {
      payload.expiry_date = dayjs(currentDate)
        .add(Number(matchedRule.validity_after_assignment), 'day')
        .format('YYYY-MM-DD');
    }

    try {
      let wallet_order_id: number | null = null;
      if (order) {
        const orderRes = await this.walletService.addOrder({
          ...order,
          wallet_id: wallet.id,
          business_unit_id: wallet.business_unit.id,
        });
        wallet_order_id = orderRes?.id || null;
      }

      const transactionRes = await this.walletService.addTransaction(
        {
          ...payload,
          wallet_order_id,
        },
        null,
        true,
      );

      const customerActivityPayload = {
        customer_uuid: wallet.customer.uuid,
        activity_type: 'rule',
        campaign_uuid: campaignId ? campaignId : null,
        rule_id: matchedRule.id,
        rule_name: matchedRule.name,
        amount: earnPoints,
      };

      await this.createCustomerActivity(customerActivityPayload);

      return {
        success: true,
        point: Number(transactionRes.amount),
      };
    } catch (error: any) {
      const message =
        error?.response?.data?.message || 'Failed to create wallet transaction';
      const status = error?.response?.status || 500;

      if (status >= 400 && status < 500) {
        throw new BadRequestException(message);
      }

      throw new InternalServerErrorException(message);
    }
  }

  async checkAlreadyRewaredPoints(business_unit_id, wallet_id, matchedRule) {
    const { frequency, event_triggerer, rule_type, condition_type } =
      matchedRule;

    const previousRewards = await this.txRepo.find({
      where: {
        business_unit: { id: business_unit_id },
        wallet: { id: wallet_id },
      },
    });

    const currentDate = new Date();

    const isSameYear = (d1: Date, d2: Date) =>
      d1.getFullYear() === d2.getFullYear();

    const isSameDate = (d1: Date, d2: Date) =>
      // d1.toDateString() === d2.toDateString();
      d1.getHours() === d2.getHours() &&
      d1.getMinutes() === d2.getMinutes() &&
      d1.getSeconds() === d2.getSeconds();

    const triggerer =
      rule_type === 'dynamic rule' ? condition_type : event_triggerer;

    const hasBeenRewarded = () => {
      if (!previousRewards.length) return false;

      const matchingRewards = previousRewards.filter(
        (reward) => reward.source_type === triggerer,
      );

      if (!matchingRewards.length) return false;

      return matchingRewards.some((reward) => {
        const rewardDate = new Date(reward.created_at);

        switch (frequency) {
          case 'once': {
            return true;
          }

          case 'daily': {
            const today = dayjs().startOf('day');
            const rewardedDate = dayjs(reward.created_at).startOf('day');
            if (rewardedDate.isSame(today)) {
              throw new BadRequestException(
                'Already rewarded today, try again tomorrow',
              );
            }
          }

          case 'yearly': {
            return isSameYear(rewardDate, currentDate);
          }

          case 'anytime': {
            return isSameDate(rewardDate, currentDate);
          }

          default:
            return false;
        }
      });
    };

    if (hasBeenRewarded()) {
      throw new BadRequestException('Already rewarded');
    }
  }

  async handleCampaignRules(bodyPayload) {
    const { total_amount, rule_info, wallet, campaign_id } = bodyPayload;
    try {
      const today = new Date();
      const campaign = await this.campaignRepository.findOne({
        where: {
          uuid: campaign_id,
          status: 1,
          start_date: LessThanOrEqual(today),
          end_date: MoreThanOrEqual(today),
        },
        relations: [
          'rules',
          'rules.rule',
          'tiers',
          'tiers.tier',
          'business_unit',
          'coupons',
          'customerSegments',
          'customerSegments.segment',
        ],
      });

      if (campaign) {
        const campaignId = campaign.id;
        const customerId = wallet.customer.id;

        // Segment validation
        const hasSegments = await this.campaignCustomerSegmentRepo.find({
          where: { campaign: { id: campaign.id } },
          relations: ['segment'],
        });

        if (hasSegments.length > 0) {
          // Extract segment IDs
          const segmentIds = hasSegments.map((cs) => cs.segment.id);
          if (segmentIds.length === 0) {
            throw new ForbiddenException('Customer segment not found');
          }
          const match = await this.customerSegmentMemberRepository.findOne({
            where: {
              segment: { id: In(segmentIds) },
              customer: { id: customerId },
            },
          });
          if (!match) {
            throw new ForbiddenException(
              'Customer is not eligible for this campaign',
            );
          }
        }

        const campaignRule = await this.campaignRuleRepo.findOne({
          where: {
            campaign: { id: campaignId },
            rule: {
              status: 1,
              uuid: rule_info.uuid,
            },
          },
          relations: ['rule'],
        });
        const rule = campaignRule?.rule;

        let conversionRate = 1;
        // customer eligible tier checking
        const campaignTiers = campaign.tiers || [];
        if (campaignTiers.length > 0) {
          const currentCustomerTier =
            await this.tiersService.getCurrentCustomerTier(customerId);
          const matchedTier = campaignTiers.find((ct) => {
            return (
              ct.tier &&
              currentCustomerTier?.tier &&
              ct.tier.name === currentCustomerTier.tier.name &&
              ct.tier.level === currentCustomerTier.tier.level
            );
          });

          if (matchedTier) {
            conversionRate = matchedTier.point_conversion_rate;
          } else {
            throw new ForbiddenException(
              'Customer tier is not eligible for this campaign',
            );
          }
        }

        if (
          rule?.rule_type === 'spend and earn' &&
          (total_amount === undefined ||
            total_amount === null ||
            total_amount === '')
        ) {
          throw new BadRequestException(`Amount is required`);
        }

        if (total_amount) {
          if (total_amount < rule?.min_amount_spent) {
            throw new BadRequestException(
              `Minimum amount to earn points is ${rule.min_amount_spent}`,
            );
          }
        }

        if (
          rule.reward_condition === 'perAmount' &&
          total_amount >= rule?.min_amount_spent
        ) {
          const multiplier = Math.floor(total_amount / rule?.min_amount_spent);
          rule.reward_points = multiplier * rule.reward_points;
        }

        rule['reward_points'] = rule.reward_points * conversionRate;
        return { campaign_uuid: campaign.uuid, matchedRule: rule };
      }

      throw new NotFoundException(
        'Campaign not found or it may not started yet',
      );
    } catch (error) {
      throw new BadRequestException(error?.message || 'Something went wrong');
    }
  }

  isSatisfyingDynamicCondition(
    contextValue: any,
    operator: string,
    conditionValue: any,
  ): boolean {
    switch (operator) {
      case '==':
        return contextValue == conditionValue;
      case '!==':
        return contextValue !== conditionValue;
      case '>':
        return contextValue > conditionValue;
      case '<':
        return contextValue < conditionValue;
      case '>=':
        return contextValue >= conditionValue;
      case '<=':
        return contextValue <= conditionValue;
      default:
        console.warn('Unsupported operator:', operator);
        return false;
    }
  }

  async checkAlreadyRewaredCoupons(customer_uuid, coupon_uuid, coupon) {
    const previousRewards = await this.customeractivityRepo.find({
      where: {
        customer_uuid: customer_uuid,
        coupon_uuid: coupon_uuid,
      },
    });

    // Check per-user limit
    if (
      coupon.max_usage_per_user &&
      previousRewards.length >= coupon.max_usage_per_user
    ) {
      throw new BadRequestException(
        'You have reached the maximum usage limit for this coupon',
      );
    }

    // if (previousRewards.length) {
    //   throw new BadRequestException('Already rewarded Coupon');
    // }
  }

  async handleCampaignCoupons(bodyPayload) {
    const { campaign_id, wallet, coupon_info, amount, order } = bodyPayload;
    const today = new Date();
    const campaign = await this.campaignRepository.findOne({
      where: {
        uuid: campaign_id,
        status: 1,
        start_date: LessThanOrEqual(today),
        end_date: MoreThanOrEqual(today),
      },
      relations: [
        'rules',
        'rules.rule',
        'tiers',
        'tiers.tier',
        'business_unit',
        'coupons',
        'customerSegments',
        'customerSegments.segment',
      ],
    });

    if (campaign) {
      const campaignId = campaign.id;
      const customerId = wallet.customer.id;

      // Segment validation
      const hasSegments = await this.campaignCustomerSegmentRepo.find({
        where: { campaign: { id: campaign.id } },
        relations: ['segment'],
      });

      if (hasSegments.length > 0) {
        // Extract segment IDs
        const segmentIds = hasSegments.map((cs) => cs.segment.id);

        if (segmentIds.length === 0) {
          return false;
        }

        const match = await this.customerSegmentMemberRepository.findOne({
          where: {
            segment: { id: In(segmentIds) },
            customer: { id: customerId },
          },
        });

        if (!match) {
          throw new ForbiddenException(
            'Customer is not eligible for this campaign',
          );
        }
      }

      // customer eligible tier checking
      const campaignTiers = campaign.tiers || [];
      if (campaignTiers.length > 0) {
        const currentCustomerTier =
          await this.tiersService.getCurrentCustomerTier(customerId);
        const matchedTier = campaignTiers.find((ct) => {
          return (
            ct.tier &&
            currentCustomerTier?.tier &&
            ct.tier.name === currentCustomerTier.tier.name &&
            ct.tier.level === currentCustomerTier.tier.level
          );
        });

        if (!matchedTier) {
          throw new ForbiddenException(
            'Customer tier is not eligible for this campaign',
          );
        }
      }

      const campaignCoupon = await this.campaignCouponRepo.findOne({
        where: {
          campaign: { id: campaignId },
          coupon: {
            // status: 1,
            uuid: coupon_info.uuid,
          },
        },
        relations: ['coupon'],
      });

      // Coupon Not Found
      if (!campaignCoupon) {
        throw new BadRequestException('Coupon not found');
      }

      const coupon = campaignCoupon.coupon;

      const now = new Date();

      // Check From Date
      if (coupon.date_from && now < coupon.date_from) {
        throw new BadRequestException('Coupon is not yet valid');
      }

      // Coupon is expried
      if (coupon.date_to && coupon.date_to < now && coupon?.status === 0) {
        throw new BadRequestException('This coupon has been expired!');
      }

      // Coupon is inactive
      if (coupon.status === 0)
        throw new BadRequestException('Coupon is not active');

      // Check reuse interval for this user
      const lastUsage = await this.userCouponRepo.findOne({
        where: { customer: { id: customerId }, coupon_code: coupon.code },
        order: { redeemed_at: 'DESC' },
      });

      if (lastUsage && coupon.reuse_interval > 0) {
        const nextAvailable = new Date(lastUsage.redeemed_at);
        nextAvailable.setDate(nextAvailable.getDate() + coupon.reuse_interval);

        if (now < nextAvailable) {
          throw new BadRequestException(
            `You can reuse this coupon after ${nextAvailable.toDateString()}`,
          );
        }
      }

      // Check total usage limit
      if (
        coupon.usage_limit &&
        coupon.number_of_times_used >= coupon.usage_limit
      ) {
        const errMsgEn =
          coupon.errors?.general_error_message_en ||
          'Coupon usage limit reached';
        const errMsgAr =
          coupon.errors?.general_error_message_ar ||
          'تم الوصول إلى الحد الأقصى لاستخدام القسيمة';

        throw new BadRequestException(`${errMsgEn} / ${errMsgAr}`);
      }

      if (
        // coupon?.complex_coupon && coupon?.complex_coupon.length >= 1
        coupon?.coupon_type_id === null
      ) {
        const conditions = coupon?.complex_coupon;
        const result = await this.validateComplexCouponConditions(
          coupon_info.complex_coupon,
          conditions,
          wallet,
          coupon,
        );
        if (!result.valid) {
          throw new BadRequestException(result.message);
        }
      }
      // else if (coupon?.conditions) {
      else {
        const couponType = await this.couponTypeService.findOne(
          coupon?.coupon_type_id,
        );

        if (couponType.coupon_type === 'BIRTHDAY') {
          const today = new Date();
          const dob = new Date(wallet.customer.DOB);
          const isBirthday =
            today.getDate() === dob.getDate() &&
            today.getMonth() === dob.getMonth();

          if (!isBirthday) {
            throw new BadRequestException(
              "Today is not your birthday, so you're not eligible.",
            );
          }
        } else if (couponType.coupon_type === 'TIER_BASED') {
          const customerTierInfo =
            await this.tiersService.getCurrentCustomerTier(wallet.customer.id);

          const cutomerFallInTier = coupon_info.conditions.find(
            (singleTier) => singleTier.tier === customerTierInfo.tier.id,
          );
          coupon.discount_type = 'percentage_discount';
          coupon.discount_price = cutomerFallInTier.value;
        } else if (couponType.coupon_type === 'USER_SPECIFIC') {
          const decryptedEmail = await this.ociService.decryptData(
            wallet.customer.email,
          );
          const decryptedPhone = await this.ociService.decryptData(
            wallet.customer.phone,
          );
          const isApplicableForUser = await this.matchConditions(
            coupon_info.conditions,
            {
              email: decryptedEmail,
              phone_number: decryptedPhone,
            },
          );
          if (!isApplicableForUser) {
            throw new BadRequestException(
              "you're not eligible for this coupon",
            );
          }
        } else {
          const result = this.validateSimpleCouponConditions(
            coupon_info,
            coupon.conditions,
            couponType,
          );
          if (!result.valid) {
            throw new BadRequestException(result.message);
          }
        }
      }

      await this.checkAlreadyRewaredCoupons(
        wallet.customer.uuid,
        campaignCoupon?.coupon.uuid,
        coupon,
      );

      if (
        coupon.discount_type === 'percentage_discount' &&
        (amount === undefined || amount === null || amount === '')
      ) {
        throw new BadRequestException(`Amount is required`);
      }

      const earnPoints =
        coupon.discount_type === 'fixed_discount'
          ? (coupon.discount_price ?? 0)
          : (amount * Number(coupon.discount_price)) / 100;

      const customerWalletPayload: any = {
        customer_id: wallet.customer.id,
        business_unit_id: wallet.business_unit.id,
        wallet_id: wallet.id,
        type: 'earn',
        amount: earnPoints,
        status: 'active',
        source_type: 'coupon',
        source_id: coupon.id,
        description: `Redeemed ${earnPoints} amount (${coupon?.coupon_title})`,
      };

      try {
        let orderResponse: any = null;
        if (order) {
          const orderRes = await this.walletService.addOrder({
            ...order,
            wallet_id: wallet.id,
            business_unit_id: wallet.business_unit.id,
          });
          orderResponse = orderRes?.id || null;
        }

        const transactionRes = await this.walletService.addTransaction(
          {
            ...customerWalletPayload,
            wallet_order_id: orderResponse,
          },
          null,
          true,
        );

        const customerActivityPayload = {
          customer_uuid: wallet.customer.uuid,
          activity_type: 'coupon',
          campaign_uuid: campaign.uuid,
          coupon_uuid: coupon.uuid,
          amount: earnPoints,
        };

        await this.createCustomerActivity(customerActivityPayload);

        const userCouponPayload = {
          coupon_code: coupon.code,
          status: CouponStatus.USED,
          redeemed_at: new Date(),
          customer: { id: wallet.customer.id },
          business_unit: { id: wallet.business_unit.id },
          issued_from_type: 'coupon',
          issued_from_id: coupon.id,
        };

        await this.userCouponRepo.save(userCouponPayload);

        coupon.number_of_times_used = Number(coupon?.number_of_times_used + 1);
        await this.couponRepo.save(coupon);

        return {
          success: true,
          amount: Number(transactionRes.amount),
        };
      } catch (error: any) {
        const message =
          error?.response?.data?.message ||
          'Failed to get customer wallet info';
        const status = error?.response?.status || 500;

        if (status >= 400 && status < 500) {
          throw new BadRequestException(message);
        }

        throw new InternalServerErrorException(message);
      }
    }
    throw new NotFoundException('Campaign not found or it may not started yet');
  }

  async validateComplexCouponConditions(
    userCouponInfo,
    dbCouponInfo,
    wallet,
    coupon,
  ) {
    const failedConditions: any = [];
    for (const userCoupon of userCouponInfo) {
      const match = dbCouponInfo.find(
        (dbCoupon) =>
          dbCoupon.selectedCouponType === userCoupon.selectedCouponType,
      );

      // Coupon Type mismatch in userCouponInfo and dbCouponInfo
      if (!match) {
        failedConditions.push(
          `No matching condition type found for '${userCoupon.selectedCouponType}'`,
        );
        continue;
      }

      if (match.selectedCouponType === 'BIRTHDAY') {
        const today = new Date();
        const dob = new Date(wallet.customer.DOB);
        const isBirthday =
          today.getDate() === dob.getDate() &&
          today.getMonth() === dob.getMonth();

        if (!isBirthday) {
          failedConditions.push(
            "Today is not your birthday, so you're not eligible.",
          );
          continue;
        }
      } else if (match.selectedCouponType === 'TIER_BASED') {
        const customerTierInfo = await this.tiersService.getCurrentCustomerTier(
          wallet.customer.id,
        );

        const cutomerFallInTier = match.dynamicRows.find(
          (singleTier) => singleTier.tier === customerTierInfo?.tier?.id,
        );

        if (!cutomerFallInTier?.tier) {
          failedConditions.push(`Customer doesn't fall in any tier`);
          continue;
        }

        coupon['discount_type'] = 'percentage_discount';
        coupon['discount_price'] = cutomerFallInTier.value;
      } else {
        // condition length mismatch in userCouponInfo and dbCouponInfo
        if (userCoupon.dynamicRows.length !== match.dynamicRows.length) {
          failedConditions.push(
            `condition not satisfied '${userCoupon.selectedCouponType}'`,
          );
          continue;
        }

        for (let i = 0; i < userCoupon.dynamicRows.length; i++) {
          const userRow = userCoupon.dynamicRows[i];
          const dbRow = match.dynamicRows[i];

          if (
            !(
              userRow.type === dbRow.type &&
              userRow.operator === dbRow.operator &&
              userRow.value === dbRow.value
            )
            // JSON.stringify(userRow.models) === JSON.stringify(dbRow.models) &&
            // JSON.stringify(userRow.variants) === JSON.stringify(dbRow.variants)
          ) {
            failedConditions.push(
              `No matching condition '${userCoupon.selectedCouponType}'`,
            );
            continue;
          }
        }
      }
    }

    if (failedConditions.length > 0) {
      return {
        valid: false,
        message: `Coupon not applicable: \n${failedConditions.join('\n')}`,
      };
    }

    return { valid: true, message: 'Coupon is applicable.' };
  }

  validateSimpleCouponConditions(userCouponInfo, dbCouponInfo, couponType) {
    const failedConditions: any = [];

    for (const userCoupon of userCouponInfo.conditions) {
      const matched = dbCouponInfo.find((cond: any) => {
        const baseMatch =
          cond.type === userCoupon.type &&
          (cond.operator === '' && cond.value === ''
            ? true
            : cond.operator === userCoupon.operator &&
              String(cond.value) === String(userCoupon.value));

        if (couponType.coupon_type === 'VEHICLE_SPECIFIC') {
          const makeMatch =
            userCoupon.make !== undefined
              ? cond.make === userCoupon.make
              : true;
          const yearMatch =
            userCoupon.year !== undefined
              ? cond.year === userCoupon.year
              : true;
          const modelMatch =
            userCoupon.model !== undefined
              ? cond.model === userCoupon.model
              : true;

          const variantMatch =
            userCoupon.variant !== undefined
              ? Array.isArray(cond.variant) &&
                Array.isArray(userCoupon.variant) &&
                cond.variant.length === userCoupon.variant.length &&
                cond.variant.every((v: any) => userCoupon.variant.includes(v))
              : true;

          return (
            baseMatch && makeMatch && yearMatch && modelMatch && variantMatch
          );
        }

        return baseMatch;
      });

      if (!matched) {
        failedConditions.push(`Missing condition: "${userCoupon.type}"`);
        continue;
      }
    }

    if (failedConditions.length > 0) {
      return {
        valid: false,
        message: `Coupon not applicable:\n${failedConditions.join('\n')}`,
      };
    }

    return { valid: true, message: 'Coupon is applicable.' };
  }

  matchConditions(couponConditions, customer) {
    return couponConditions.every((condition) => {
      const valuesArray = condition.value.split(',').map((v) => v.trim());

      switch (condition.type) {
        case 'EMAIL': {
          return condition.operator === '=='
            ? valuesArray.includes(customer.email)
            : !valuesArray.includes(customer.email);
        }

        case 'PHONE_NUMBER': {
          return condition.operator === '=='
            ? valuesArray.includes(customer.phone_number)
            : !valuesArray.includes(customer.phone_number);
        }

        // case 'NOT_APPLICABLE':
        //   return condition.operator === '=='
        //     ? valuesArray.includes(customer.email) ||
        //         valuesArray.includes(customer.phone_number)
        //     : !valuesArray.includes(customer.email) &&
        //         !valuesArray.includes(customer.phone_number);

        default:
          return false;
      }
    });
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async unLockWalletPointsAndAddThemInAvailableBalance() {
    console.log('unLockWalletPointsAndAddThemInAvailableBalance');
    // 1. Find all wallet transactions where unlock_date is today or earlier and status is 'pending'
    // const today = new Date();

    // Find all transactions that should be unlocked
    // To handle date-only unlock_date (e.g., '2025-08-12') vs. JS Date (with time),
    // we need to find all transactions where unlock_date is <= today (date part only).
    // We'll use a raw query or Between/LessThanOrEqual with date string.
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of today
    const transactionsToUnlock = await this.txRepo.find({
      where: {
        unlock_date: LessThanOrEqual(today),
        status: WalletTransactionStatus.PENDING,
        type: WalletTransactionType.EARN,
      },
      relations: ['wallet'],
    });

    // console.log('transactionsToUnlock', transactionsToUnlock, today);

    for (const tx of transactionsToUnlock) {
      const wallet = tx.wallet;
      if (!wallet) continue;

      // Move points from locked_balance to available_balance, so picking how much locked points are for this transaction
      const amount = Number(tx.amount);
      // Update wallet balances
      wallet.locked_balance = Number(wallet.locked_balance) - amount;
      wallet.available_balance = Number(wallet.available_balance) + amount;

      console.log('/////////////////////////////', wallet);
      // Update transaction status to 'active'
      tx.status = WalletTransactionStatus.ACTIVE;

      // Save changes
      await this.walletService.updateWalletBalances(wallet.id, {
        ...wallet,
      });
      await this.txRepo.save(tx);
    }
  }
}
