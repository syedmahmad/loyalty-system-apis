import {
  Injectable,
  NotFoundException,
  BadRequestException,
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

    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,

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
        coupons: coupons ? coupons.map((c) => omitCritical(c)) : [],
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
