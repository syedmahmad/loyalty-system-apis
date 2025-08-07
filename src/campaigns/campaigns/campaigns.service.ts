import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, ILike } from 'typeorm';
import { Campaign } from '../entities/campaign.entity';
import { CampaignRule } from '../entities/campaign-rule.entity';
import { CampaignTier } from '../entities/campaign-tier.entity';
import { CampaignCoupons } from '../entities/campaign-coupon.entity';
import { CustomerSegment } from 'src/customer-segment/entities/customer-segment.entity';
import { CreateCampaignDto } from '../dto/create-campaign.dto';
import { UpdateCampaignDto } from '../dto/update-campaign.dto';
import { Rule } from 'src/rules/entities/rules.entity';
import { Tier } from 'src/tiers/entities/tier.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Coupon } from 'src/coupons/entities/coupon.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { User } from 'src/users/entities/user.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { CampaignCustomerSegment } from '../entities/campaign-customer-segments.entity';
import { omit } from 'lodash';
import { Customer } from 'src/customers/entities/customer.entity';
import { TiersService } from 'src/tiers/tiers/tiers.service';
import { CustomerSegmentMember } from 'src/customer-segment/entities/customer-segment-member.entity';
import { BurnPoints, BurnWithCampaignDto } from '../dto/burn.dto';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import {
  WalletTransactionStatus,
  WalletTransactionType,
} from 'src/wallet/entities/wallet-transaction.entity';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,

    @InjectRepository(CampaignRule)
    private readonly campaignRuleRepository: Repository<CampaignRule>,

    @InjectRepository(CampaignTier)
    private readonly campaignTierRepository: Repository<CampaignTier>,

    @InjectRepository(CampaignCoupons)
    private readonly campaignCouponsRepository: Repository<CampaignCoupons>,

    @InjectRepository(CampaignCustomerSegment)
    private readonly campaignSegmentRepository: Repository<CampaignCustomerSegment>,

    @InjectRepository(CustomerSegment)
    private readonly segmentRepository: Repository<CustomerSegment>,

    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,

    @InjectRepository(Tier)
    private readonly tierRepository: Repository<Tier>,

    @InjectRepository(Coupon)
    private readonly couponRepository: Repository<Coupon>,

    @InjectRepository(BusinessUnit)
    private businessUnitRepository: Repository<BusinessUnit>,

    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectRepository(CustomerSegmentMember)
    private readonly customerSegmentMemberRepository: Repository<CustomerSegmentMember>,

    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,

    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,

    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,

    private readonly tierService: TiersService,

    private readonly walletService: WalletService,

    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateCampaignDto, user: string): Promise<Campaign> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user };

      const {
        name,
        start_date,
        end_date,
        description,
        business_unit_id,
        rules,
        tiers,
        coupons,
        client_id,
        customer_segment_ids = [],
        campaign_type,
      } = dto;

      const manager = queryRunner.manager;

      // Validate rules
      const ruleEntities = await this.ruleRepository.findBy({
        id: In(rules.map((r) => r.rule_id)),
      });
      if (ruleEntities.length !== rules.length) {
        throw new BadRequestException('Some rules not found');
      }

      // Validate tiers
      const tierEntities = await this.tierRepository.findBy({
        id: In(tiers.map((t) => t.tier_id)),
      });
      if (tierEntities.length !== tiers.length) {
        throw new BadRequestException('Some tiers not found');
      }

      // Validate coupons
      const couponEntities = await this.couponRepository.findBy({
        id: In(coupons.map((c) => c.coupon_id)),
      });
      if (couponEntities.length !== coupons.length) {
        throw new BadRequestException('Some coupons not found');
      }

      // Validate customer segments
      let campaignSegmentEntities: CampaignCustomerSegment[] = [];
      if (customer_segment_ids.length) {
        const segments = await this.segmentRepository.findBy({
          id: In(customer_segment_ids),
        });
        if (segments.length !== customer_segment_ids.length) {
          throw new BadRequestException('Some customer segments not found');
        }

        campaignSegmentEntities = segments.map((segment) =>
          this.campaignSegmentRepository.create({
            segment,
          }),
        );
      }

      // Save campaign
      const campaign = manager.create(Campaign, {
        name,
        start_date,
        end_date,
        description,
        business_unit_id,
        tenant_id: client_id,
        active: true,
        status: 1,
        campaign_type,
      });
      const savedCampaign = await manager.save(campaign);

      // Add campaign to relations
      campaignSegmentEntities.forEach((c) => (c.campaign = savedCampaign));

      const campaignRules = ruleEntities.map((rule) =>
        this.campaignRuleRepository.create({ campaign: savedCampaign, rule }),
      );

      const dtoTierMap = new Map(tiers.map((t) => [t.tier_id, t]));
      const campaignTiers = tierEntities.map((tier) => {
        const matchedDtoTier = dtoTierMap.get(tier.id);
        return this.campaignTierRepository.create({
          campaign: savedCampaign,
          tier,
          point_conversion_rate: matchedDtoTier.point_conversion_rate,
        });
      });

      const campaignCoupons = couponEntities.map((coupon) =>
        this.campaignCouponsRepository.create({
          campaign: savedCampaign,
          coupon,
        }),
      );

      // Save all
      await manager.save(CampaignRule, campaignRules);
      await manager.save(CampaignTier, campaignTiers);
      await manager.save(CampaignCoupons, campaignCoupons);
      if (campaignSegmentEntities.length) {
        await manager.save(CampaignCustomerSegment, campaignSegmentEntities);
      }

      await queryRunner.commitTransaction();
      return savedCampaign;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(
    client_id: number,
    name: string,
    userId: number,
  ): Promise<Campaign[]> {
    let optionalWhereClause = {};

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user)
      throw new BadRequestException('User not found against user-token');

    const privileges: any[] = user.user_privileges || [];
    const tenant = await this.tenantRepository.findOne({
      where: { id: client_id },
    });
    if (!tenant) throw new BadRequestException('Tenant not found');
    const tenantName = tenant.name;

    const hasGlobalAccess = privileges.some(
      (p) =>
        p.module === 'businessUnits' &&
        p.name === `${tenantName}_All Business Unit`,
    );

    if (name?.trim()) {
      optionalWhereClause = { name: ILike(`%${name}%`) };
    }

    if (hasGlobalAccess) {
      return this.campaignRepository.find({
        where: {
          tenant_id: Number(client_id),
          status: 1,
          ...optionalWhereClause,
        },
        relations: ['rules', 'tiers', 'business_unit', 'coupons'],
        order: { created_at: 'DESC' },
      });
    }

    const accessibleBU = privileges
      .filter(
        (p) =>
          p.module === 'businessUnits' &&
          p.name.startsWith(`${tenantName}_`) &&
          p.name !== `${tenantName}_All Business Unit`,
      )
      .map((p) => p.name.replace(`${tenantName}_`, ''));

    if (!accessibleBU.length) return [];

    const businessUnits = await this.businessUnitRepository.find({
      where: { status: 1, tenant_id: client_id, name: In(accessibleBU) },
    });

    const businessUnitIds = businessUnits.map((bu) => bu.id);

    return this.campaignRepository.find({
      where: {
        tenant_id: Number(client_id),
        status: 1,
        business_unit_id: In(businessUnitIds),
        ...optionalWhereClause,
      },
      relations: [
        'rules',
        'tiers',
        'business_unit',
        'coupons',
        'customerSegments',
        'customerSegments.segment',
      ],
      order: { created_at: 'DESC' },
    });
  }

  async findAllForThirdPart(
    tenantId: string,
    businessUnitId: string,
    uuid: string,
  ): Promise<any[]> {
    // Validate tenantId and businessUnitId to ensure they are valid numbers
    const tenantIdNum = Number(tenantId);
    const businessUnitIdNum = Number(businessUnitId);

    if (isNaN(tenantIdNum)) {
      throw new Error('Invalid tenantId: must be a number');
    }
    if (isNaN(businessUnitIdNum)) {
      throw new Error('Invalid businessUnitId: must be a number');
    }

    let optionalWhereClause = {};

    if (uuid?.trim()) {
      optionalWhereClause = { uuid: uuid };
    }

    const campaigns = await this.campaignRepository.find({
      where: {
        tenant_id: tenantIdNum,
        business_unit_id: businessUnitIdNum,
        status: 1,
        ...optionalWhereClause,
      },
      relations: [
        'rules',
        'rules.rule', // <-- ensure we load the related rule entity
        'tiers',
        'business_unit',
        'coupons',
        'coupons.coupon', // <-- ensure we load the related coupon entity
        'customerSegments',
        'customerSegments.segment',
      ],
      order: { created_at: 'DESC' },
    });

    // Helper to omit sensitive/critical fields
    function omitCritical(obj: any, extraOmit: string[] = []) {
      if (!obj) return null;
      const omitFields = [
        'id',
        'tenant_id',
        'created_at',
        'updated_at',
        'created_by',
        'updated_by',
        'errors',
        ...extraOmit,
      ];
      return Object.fromEntries(
        Object.entries(obj).filter(([key]) => !omitFields.includes(key)),
      );
    }

    return campaigns.map((campaign) => {
      const {
        rules,
        tiers,
        business_unit,
        coupons,
        customerSegments,
        ...rest
      } = campaign;

      console.log('///////////////////////', rules);

      return {
        ...omitCritical(rest),
        business_unit: business_unit ? omitCritical(business_unit) : null,
        // Flatten rules to just the rule object, omitting critical fields
        rules: rules
          ? rules
              .map((r) => r.rule)
              .filter(Boolean)
              .map((rule) => omitCritical(rule))
          : [],
        tiers: tiers ? tiers.map((t) => omitCritical(t)) : [],
        // Flatten rules to just the rule object, omitting critical fields
        coupons: coupons
          ? coupons
              .map((r) => r.coupon)
              .filter(Boolean)
              .map((rule) => omitCritical(rule))
          : [],
        customerSegments: customerSegments
          ? customerSegments.map((cs) => ({
              ...omitCritical(cs),
              segment: cs.segment ? omitCritical(cs.segment) : null,
            }))
          : [],
      };
    });
  }

  async findOne(id: number): Promise<Campaign> {
    const campaign = await this.campaignRepository.findOne({
      where: { id },
      relations: [
        'rules',
        'tiers',
        'business_unit',
        'coupons',
        'customerSegments',
        'customerSegments.segment',
      ],
    });
    if (!campaign)
      throw new NotFoundException(`Campaign with ID ${id} not found`);
    return campaign;
  }

  async findOneThirdParty(id: string): Promise<any> {
    const campaign = await this.campaignRepository.findOne({
      where: { uuid: id },
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

    if (!campaign) {
      throw new NotFoundException(`Campaign with ID ${id} not found`);
    }

    const { rules, tiers, business_unit, coupons, customerSegments, ...rest } =
      campaign;

    // omit function will remove the 'id' field from each entity
    // and return the rest of the properties
    return {
      // ...rest,
      ...omit(rest, 'id'),
      business_unit: business_unit ? omit(business_unit, 'id') : null,
      rules:
        rules?.map((r) => ({
          ...omit(r, 'id'),
          rule: r.rule ? omit(r.rule, 'id') : null,
        })) || [],
      tiers:
        tiers?.map((t) => ({
          ...omit(t, 'id'),
          tier: t.tier ? omit(t.tier, 'id') : null,
        })) || [],
      coupons: coupons?.map((c) => omit(c, 'id')) || [],
      customerSegments:
        customerSegments?.map((cs) => ({
          ...omit(cs, 'id'),
          segment: cs.segment ? omit(cs.segment, 'id') : null,
        })) || [],
    };
  }

  async update(
    id: number,
    dto: UpdateCampaignDto,
    user: string,
  ): Promise<Campaign> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = { user };

    try {
      const manager = queryRunner.manager;

      const campaign = await manager.findOne(Campaign, {
        where: { id },
        relations: ['rules.rule', 'tiers.tier', 'coupons.coupon'],
      });
      if (!campaign)
        throw new NotFoundException(`Campaign with ID ${id} not found`);

      Object.assign(campaign, {
        name: dto.name,
        start_date: dto.start_date,
        end_date: dto.end_date,
        description: dto.description,
        business_unit_id: dto.business_unit_id,
        campaign_type: dto.campaign_type,
      });

      const updatedCampaign = await manager.save(campaign);

      // === RULES Sync ===
      const incomingRuleIds = dto.rules.map((r) => r.rule_id);
      const existingRuleIds = campaign.rules.map((cr) => cr.rule.id);
      const ruleIdsToRemove = existingRuleIds.filter(
        (id) => !incomingRuleIds.includes(id),
      );
      const ruleIdsToAdd = incomingRuleIds.filter(
        (id) => !existingRuleIds.includes(id),
      );
      if (ruleIdsToRemove.length) {
        await manager.delete(CampaignRule, {
          campaign: { id },
          rule: In(ruleIdsToRemove),
        });
      }
      if (ruleIdsToAdd.length) {
        const rulesToAdd = await this.ruleRepository.findBy({
          id: In(ruleIdsToAdd),
        });
        const newRules = rulesToAdd.map((rule) =>
          this.campaignRuleRepository.create({
            campaign: updatedCampaign,
            rule,
          }),
        );
        await manager.save(CampaignRule, newRules);
      }

      // === COUPONS Sync ===
      const incomingCouponIds = dto.coupons.map((c) => c.coupon_id);
      const existingCouponIds = campaign.coupons.map((cc) => cc.coupon.id);
      const couponIdsToRemove = existingCouponIds.filter(
        (id) => !incomingCouponIds.includes(id),
      );
      const couponIdsToAdd = incomingCouponIds.filter(
        (id) => !existingCouponIds.includes(id),
      );
      if (couponIdsToRemove.length) {
        await manager.delete(CampaignCoupons, {
          campaign: { id },
          coupon: In(couponIdsToRemove),
        });
      }
      if (couponIdsToAdd.length) {
        const couponsToAdd = await this.couponRepository.findBy({
          id: In(couponIdsToAdd),
        });
        const newCoupons = couponsToAdd.map((coupon) =>
          this.campaignCouponsRepository.create({
            campaign: updatedCampaign,
            coupon,
          }),
        );
        await manager.save(CampaignCoupons, newCoupons);
      }

      // === TIERS Sync ===
      const dtoTierMap = new Map(dto.tiers.map((t) => [t.tier_id, t]));
      const incomingTierIds = dto.tiers.map((t) => t.tier_id);
      const existingTierIds = campaign.tiers.map((ct) => ct.tier.id);
      const tierIdsToRemove = existingTierIds.filter(
        (id) => !incomingTierIds.includes(id),
      );
      const tierIdsToAdd = incomingTierIds.filter(
        (id) => !existingTierIds.includes(id),
      );
      if (tierIdsToRemove.length) {
        await manager.delete(CampaignTier, {
          campaign: { id },
          tier: In(tierIdsToRemove),
        });
      }
      if (tierIdsToAdd.length) {
        const tiersToAdd = await this.tierRepository.findBy({
          id: In(tierIdsToAdd),
        });
        const newTiers = tiersToAdd.map((tier) => {
          const match = dtoTierMap.get(tier.id);
          return this.campaignTierRepository.create({
            campaign: updatedCampaign,
            tier,
            point_conversion_rate: match.point_conversion_rate,
          });
        });
        await manager.save(CampaignTier, newTiers);
      }
      // update point_conversion_rate of existing
      const existingCampaignTiers = await manager.find(CampaignTier, {
        where: { campaign: { id }, tier: In(existingTierIds) },
        relations: ['tier'],
      });
      for (const ct of existingCampaignTiers) {
        const newRate = dtoTierMap.get(ct.tier.id)?.point_conversion_rate;
        if (newRate !== undefined && ct.point_conversion_rate !== newRate) {
          ct.point_conversion_rate = newRate;
        }
      }
      await manager.save(CampaignTier, existingCampaignTiers);

      // === CUSTOMER SEGMENTS Sync ===
      const incomingSegmentIds = dto.customer_segment_ids || [];
      const existingSegments = await manager.find(CampaignCustomerSegment, {
        where: { campaign: { id } },
        relations: ['segment'],
      });
      const existingSegmentIds = existingSegments.map((cs) => cs.segment.id);
      const segmentIdsToRemove = existingSegmentIds.filter(
        (id) => !incomingSegmentIds.includes(id),
      );
      const segmentIdsToAdd = incomingSegmentIds.filter(
        (id) => !existingSegmentIds.includes(id),
      );

      if (segmentIdsToRemove.length) {
        await manager.delete(CampaignCustomerSegment, {
          campaign: { id },
          segment: In(segmentIdsToRemove),
        });
      }

      if (segmentIdsToAdd.length) {
        const segmentsToAdd = await this.segmentRepository.findBy({
          id: In(segmentIdsToAdd),
        });
        const newSegments = segmentsToAdd.map((segment) =>
          this.campaignSegmentRepository.create({
            campaign: updatedCampaign,
            segment,
          }),
        );
        await manager.save(CampaignCustomerSegment, newSegments);
      }

      await queryRunner.commitTransaction();
      return updatedCampaign;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: number, user: string): Promise<{ deleted: boolean }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = { user };

    try {
      const manager = queryRunner.manager;
      const campaign = await manager.findOne(Campaign, { where: { id } });
      if (!campaign)
        throw new NotFoundException(`Campaign with ID ${id} not found`);
      campaign.status = 0;
      await manager.save(campaign);
      await queryRunner.commitTransaction();
      return { deleted: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async burnPoints(bodyPayload: BurnPoints) {
    const { customer_id, order, rule_uuid } = bodyPayload;

    const total_amount = Number(order.amount);

    const customerInfo = await this.customerRepository.find({
      where: { uuid: customer_id },
      relations: ['business_unit'],
    });

    const wallet = await this.walletRepository.findOne({
      where: { customer: { uuid: customer_id } },
      relations: ['business_unit'],
    });

    const customer = customerInfo[0];
    if (!customer) throw new NotFoundException('Customer not found');

    const rule = await this.ruleRepository.findOne({
      where: { uuid: rule_uuid },
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

    // Step 9: Create burn transaction in wallet

    const orderResponse = await this.walletService.addOrder({
      ...order,
      delivery_date: order.delivery_date
        ? new Date(order.delivery_date)
        : undefined,
      order_date: order.order_date ? new Date(order.order_date) : undefined,
      subtotal: total_amount - discountAmount,
      discount: discountAmount,
      wallet_id: wallet?.id,
      business_unit_id: customer?.business_unit?.id,
      items: order.items ? JSON.stringify(order.items) : undefined,
    });

    await this.walletService.addTransaction(
      {
        ...burnPayload,
        wallet_order_id: orderResponse?.id,
        wallet_id: wallet?.id,
        business_unit_id: customer?.business_unit?.id,
      },
      customer?.id,
      true,
    );

    const walletInfo = await this.walletRepository.findOne({
      where: { id: wallet.id },
      relations: ['business_unit'],
    });

    const updatedOrder = {
      ...omit(orderResponse, ['wallet', 'business_unit']),
      discount: discountAmount,
      payable_amount: total_amount - discountAmount,
    };

    return {
      message: 'Burn successful',
      wallet: omit(walletInfo, ['customer', 'id', 'business_unit.id']),
      order: updatedOrder,
    };
  }

  async burnPointsWithCampaign(bodyPayload: BurnWithCampaignDto) {
    const { customer_id, campaign_uuid, order, rule_uuid } = bodyPayload;

    const total_amount = Number(order.amount);

    const customerInfo = await this.customerRepository.find({
      where: { uuid: customer_id },
      relations: ['business_unit'],
    });

    const wallet = await this.walletRepository.findOne({
      where: { customer: { uuid: customer_id } },
      relations: ['business_unit'],
    });

    const customer = customerInfo[0];
    if (!customer) throw new NotFoundException('Customer not found');

    const currentCustomerTier = await this.tierService.getCurrentCustomerTier(
      customer?.id,
    );

    // Step 2: Fetch active campaign
    const campaignInfo = await this.campaignRepository.findOne({
      where: { uuid: campaign_uuid, status: 1 },
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

    const campaign = campaignInfo;
    if (!campaign) {
      throw new NotFoundException('No active campaign found');
    }
    const campaignTiers = campaignInfo.tiers || [];

    // Step 3: Segment validation
    const hasSegments = await this.campaignSegmentRepository.find({
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
          customer: { id: customer.id },
        },
      });

      if (!match) {
        throw new ForbiddenException(
          'Customer is not eligible for this campaign',
        );
      }
    }

    // Step 4: Fetch burn rule
    const campaignRule = await this.campaignRuleRepository.findOne({
      where: {
        campaign: { id: campaign.id },
        rule: {
          uuid: rule_uuid,
          rule_type: 'burn',
          status: 1,
        },
      },
      relations: ['rule'],
    });

    const rule = campaignRule.rule;
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
    let conversionRate = rule.points_conversion_factor;

    if (campaignTiers.length > 0) {
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

    // Step 9: Create burn transaction in wallet

    const orderResponse = await this.walletService.addOrder({
      ...order,
      delivery_date: order.delivery_date
        ? new Date(order.delivery_date)
        : undefined,
      order_date: order.order_date ? new Date(order.order_date) : undefined,
      subtotal: total_amount - discountAmount,
      discount: discountAmount,
      wallet_id: wallet?.id,
      business_unit_id: customer?.business_unit?.id,
      items: order.items ? JSON.stringify(order.items) : undefined,
    });

    await this.walletService.addTransaction(
      {
        ...burnPayload,
        wallet_order_id: orderResponse?.id,
        wallet_id: wallet?.id,
        business_unit_id: customer?.business_unit?.id,
      },
      customer?.id,
      true,
    );

    const walletInfo = await this.walletRepository.findOne({
      where: { id: wallet.id },
      relations: ['business_unit'],
    });

    const updatedOrder = {
      ...omit(orderResponse, ['wallet', 'business_unit']),
      discount: discountAmount,
      payable_amount: total_amount - discountAmount,
    };

    return {
      message: 'Burn successful',
      wallet: omit(walletInfo, ['customer', 'id', 'business_unit.id']),
      order: updatedOrder,
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    console.log('Running campaign expiry check...');

    const expiredCampaigns = await this.campaignRepository.find({
      where: { end_date: today, active: true },
    });

    for (const campaign of expiredCampaigns) {
      campaign.active = false;
      await this.campaignRepository.save(campaign);
      console.log(`Deactivated campaign: ${campaign.name}`);
    }
  }
}
