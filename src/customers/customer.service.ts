import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as QRCode from 'qrcode';
import {
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Raw,
  Repository,
} from 'typeorm';
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
import { WalletTransaction } from 'src/wallet/entities/wallet-transaction.entity';
import { CampaignsService } from 'src/campaigns/campaigns/campaigns.service';
import { CampaignCustomerSegment } from 'src/campaigns/entities/campaign-customer-segments.entity';
import { CampaignRule } from 'src/campaigns/entities/campaign-rule.entity';
import { CreateCustomerActivityDto } from './dto/create-customer-activity.dto';
import { CustomerEarnDto } from './dto/customer-earn.dto';
import { CampaignCoupons } from 'src/campaigns/entities/campaign-coupon.entity';
import { CouponTypeService } from 'src/coupon_type/coupon_type/coupon_type.service';
import { CustomerSegmentMember } from 'src/customer-segment/entities/customer-segment-member.entity';
import { Campaign } from 'src/campaigns/entities/campaign.entity';

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
    page: number,
    pageSize: number,
    query: string,
  ) {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId },
    });

    const walletinfo = await this.walletService.getSingleCustomerWalletInfoById(
      customer.id,
    );
    const transactionInfo = await this.walletService.getWalletTransactions(
      walletinfo?.id,
      page,
      pageSize,
      query,
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
    const { customer_id, campaign_type } = bodyPayload;

    // Step 1: Get Customer & Wallet Info
    const customer = await this.customerRepo.findOne({
      where: { uuid: customer_id },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const wallet = await this.walletService.getSingleCustomerWalletInfoById(
      customer.id,
    );
    if (!wallet) throw new NotFoundException('Wallet not found');

    // Step 2: handling CampaignRuleEarning, SimpleRuleEarning and CampaignCouponEarning
    return campaign_type
      ? this.handleCampaignEarning({ ...bodyPayload, wallet })
      : this.handleRuleEarning({
          ...bodyPayload,
          wallet,
        });
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
      case 'DISCOUNT_POINTS': {
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
      case 'DISCOUNT_COUPONS': {
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

      return transactionRes;
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
      const where: any = {
        uuid: campaign_id,
        status: 1,
      };

      const campaign = await this.campaignRepository.findOne({
        where,
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

        rule['reward_points'] = rule.reward_points * conversionRate;
        return { campaign_uuid: campaign.uuid, matchedRule: rule };
      }

      throw new NotFoundException('Campaign not found');
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

  async checkAlreadyRewaredCoupons(customer_uuid, coupon_uuid) {
    const previousRewards = await this.customeractivityRepo.find({
      where: {
        customer_uuid: customer_uuid,
        coupon_uuid: coupon_uuid,
      },
    });

    if (previousRewards.length) {
      throw new BadRequestException('Already rewarded Coupon');
    }
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
            status: 1,
            uuid: coupon_info.uuid,
          },
        },
        relations: ['coupon'],
      });

      if (!campaignCoupon) {
        throw new BadRequestException('Coupon not found');
      }
      const coupon = campaignCoupon.coupon;

      if (coupon?.complex_coupon && coupon?.complex_coupon.length >= 1) {
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
      } else if (coupon?.conditions) {
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
        description: `Earned ${earnPoints} points (${coupon?.coupon_title})`,
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

        return transactionRes;
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
}
