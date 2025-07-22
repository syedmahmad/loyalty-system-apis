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
import { CreateCampaignDto } from '../dto/create-campaign.dto';
import { UpdateCampaignDto } from '../dto/update-campaign.dto';
import { Rule } from 'src/rules/entities/rules.entity';
import { Tier } from 'src/tiers/entities/tier.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Coupon } from 'src/coupons/entities/coupon.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { User } from 'src/users/entities/user.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,

    @InjectRepository(CampaignRule)
    private readonly campaignRuleRepository: Repository<CampaignRule>,

    @InjectRepository(CampaignTier)
    private readonly campaignTierRepository: Repository<CampaignTier>,

    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,

    @InjectRepository(Tier)
    private readonly tierRepository: Repository<Tier>,

    @InjectRepository(Coupon)
    private readonly couponRepository: Repository<Coupon>,

    @InjectRepository(CampaignCoupons)
    private readonly campaignCouponsRepository: Repository<CampaignCoupons>,

    @InjectRepository(BusinessUnit)
    private businessUnitRepository: Repository<BusinessUnit>, // adjust path as needed

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
      queryRunner.data = { user }; // 👈 Inject user into subscriber context

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
      } = dto;

      const manager = queryRunner.manager;

      // Validate rules
      const ruleIds = rules.map((r) => r.rule_id);
      const ruleEntities = await this.ruleRepository.findBy({
        id: In(ruleIds),
      });

      if (ruleEntities.length !== rules.length) {
        throw new BadRequestException('Some rules not found');
      }

      // Validate tiers
      const tierIds = tiers.map((t) => t.tier_id);
      const tierEntities = await this.tierRepository.findBy({
        id: In(tierIds),
      });

      if (tierEntities.length !== tiers.length) {
        throw new BadRequestException('Some tiers not found');
      }

      // Validate coupons
      const couponIds = coupons.map((t) => t.coupon_id);
      const couponEntities = await this.couponRepository.findBy({
        id: In(couponIds),
      });

      if (couponEntities.length !== coupons.length) {
        throw new BadRequestException('Some coupons not found');
      }

      // Create and save campaign
      const campaign = manager.create(Campaign, {
        name,
        start_date,
        end_date,
        description,
        business_unit_id,
        tenant_id: client_id,
        active: true, // Default to active
        status: 1, // Default to active status
      });

      const savedCampaign = await manager.save(campaign);

      // Create campaign coupons
      const campaignCoupons = couponEntities.map((coupon) =>
        this.campaignCouponsRepository.create({
          campaign: savedCampaign,
          coupon,
        }),
      );

      // Create campaign rules
      const campaignRules = ruleEntities.map((rule) =>
        this.campaignRuleRepository.create({
          campaign: savedCampaign,
          rule,
        }),
      );

      // Map tiers for quick lookup
      const dtoTierMap = new Map(tiers.map((t) => [t.tier_id, t]));

      // Create campaign tiers with point_conversion_rate
      const campaignTiers = tierEntities.map((tier) => {
        const matchedDtoTier = dtoTierMap.get(tier.id);
        if (!matchedDtoTier) {
          throw new BadRequestException(
            `Tier ID ${tier.id} does not match with DTO tiers`,
          );
        }

        return this.campaignTierRepository.create({
          campaign: savedCampaign,
          tier,
          point_conversion_rate: matchedDtoTier.point_conversion_rate,
        });
      });

      // Save campaign rules and tiers
      await manager.save(CampaignRule, campaignRules);
      await manager.save(CampaignTier, campaignTiers);
      await manager.save(CampaignCoupons, campaignCoupons);

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
    if (!user) {
      throw new BadRequestException('User not found against user-token');
    }

    const privileges: any[] = user.user_privileges || [];

    // get tenant name from DB (we'll need this to match privileges like `NATC_Service Center`)
    const tenant = await this.tenantRepository.findOne({
      where: { id: client_id },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    const tenantName = tenant.name;

    // check for global business unit access for this tenant
    const hasGlobalBusinessUnitAccess = privileges.some(
      (p) =>
        p.module === 'businessUnits' &&
        p.name === `${tenantName}_All Business Unit`,
    );

    if (typeof name === 'string' && name.trim() !== '') {
      optionalWhereClause = {
        name: ILike(`%${name}%`),
      };
    }

    if (hasGlobalBusinessUnitAccess) {
      return this.campaignRepository.find({
        where: { tenant_id: client_id, status: 1, ...optionalWhereClause },
        relations: ['rules', 'tiers', 'business_unit', 'coupons'],
        order: { created_at: 'DESC' },
      });
    }

    // if no global access, extract specific tier names from privileges
    const accessibleBusinessUnitNames = privileges
      .filter(
        (p) =>
          p.module === 'businessUnits' &&
          p.name.startsWith(`${tenantName}_`) &&
          p.name !== `${tenantName}_All Business Unit`,
      )
      .map((p) => p.name.replace(`${tenantName}_`, ''));

    if (!accessibleBusinessUnitNames.length) {
      return []; // No access
    }

    const businessUnits = await this.businessUnitRepository.find({
      where: {
        status: 1,
        tenant_id: client_id,
        name: In(accessibleBusinessUnitNames),
      },
    });

    const availableBusinessUnitIds = businessUnits.map((unit) => unit.id);

    return this.campaignRepository.find({
      where: {
        tenant_id: client_id,
        status: 1,
        business_unit_id: In(availableBusinessUnitIds),
        ...optionalWhereClause,
      },
      relations: ['rules', 'tiers', 'business_unit', 'coupons'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Campaign> {
    const campaign = await this.campaignRepository.findOne({
      where: { id },
      relations: ['rules', 'tiers', 'business_unit', 'coupons'],
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign with ID ${id} not found`);
    }

    return campaign;
  }

  async update(
    id: number,
    dto: UpdateCampaignDto,
    user: string,
  ): Promise<Campaign> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = { user }; // 👈 for audit logging

    try {
      const manager = queryRunner.manager;

      const campaign = await manager.findOne(Campaign, {
        where: { id },
        relations: [
          'rules',
          'tiers',
          'coupons',
          'tiers.tier',
          'rules.rule',
          'coupons.coupon',
        ],
      });

      if (!campaign) {
        throw new NotFoundException(`Campaign with ID ${id} not found`);
      }

      Object.assign(campaign, {
        name: dto.name,
        start_date: dto.start_date,
        end_date: dto.end_date,
        description: dto.description,
        business_unit_id: dto.business_unit_id,
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
        if (rulesToAdd.length !== ruleIdsToAdd.length) {
          throw new BadRequestException('Some new rules not found');
        }

        const newCampaignRules = rulesToAdd.map((rule) =>
          this.campaignRuleRepository.create({
            campaign: updatedCampaign,
            rule,
          }),
        );
        await manager.save(CampaignRule, newCampaignRules);
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
        if (couponsToAdd.length !== couponIdsToAdd.length) {
          throw new BadRequestException('Some new coupons not found');
        }

        const newCampaignCoupons = couponsToAdd.map((coupon) =>
          this.campaignCouponsRepository.create({
            campaign: updatedCampaign,
            coupon,
          }),
        );
        await manager.save(CampaignCoupons, newCampaignCoupons);
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
        if (tiersToAdd.length !== tierIdsToAdd.length) {
          throw new BadRequestException('Some new tiers not found');
        }

        const newCampaignTiers = tiersToAdd.map((tier) => {
          const matchedDtoTier = dtoTierMap.get(tier.id);
          if (!matchedDtoTier) {
            throw new BadRequestException(
              `Tier ID ${tier.id} does not match DTO tiers`,
            );
          }

          return this.campaignTierRepository.create({
            campaign: updatedCampaign,
            tier,
            point_conversion_rate: matchedDtoTier.point_conversion_rate,
          });
        });

        await manager.save(CampaignTier, newCampaignTiers);
      }

      // === UPDATE point_conversion_rate for existing tiers ===
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
      if (!campaign) {
        throw new NotFoundException(`Campaign with ID ${id} not found`);
      }

      campaign.status = 0; // 👈 Soft delete by updating status
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
    today.setHours(0, 0, 0, 0); // normalize to start of the day

    console.log('Running campaign expiry check...');

    const expiredCampaigns = await this.campaignRepository.find({
      where: {
        end_date: today,
        active: true,
      },
    });

    if (expiredCampaigns.length) {
      for (const campaign of expiredCampaigns) {
        campaign.active = false;
        await this.campaignRepository.save(campaign);
        console.log(`Deactivated campaign: ${campaign.name}`);
      }
    } else {
      console.log('No expired campaigns found today.');
    }
  }
}
