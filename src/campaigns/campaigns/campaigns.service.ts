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
import { CreateCampaignDto } from '../dto/create-campaign.dto';
import { UpdateCampaignDto } from '../dto/update-campaign.dto';
import { Rule } from 'src/rules/entities/rules.entity';
import { Tier } from 'src/tiers/entities/tier.entity';

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

    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateCampaignDto): Promise<Campaign> {
    return await this.dataSource.transaction(async (manager) => {
      const {
        name,
        start_date,
        end_date,
        description,
        business_unit_id,
        rules,
        tiers,
        client_id,
      } = dto;

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

      // Create and save campaign
      const campaign = manager.create(Campaign, {
        name,
        start_date,
        end_date,
        description,
        business_unit_id,
        tenant_id: client_id,
      });

      const savedCampaign = await manager.save(campaign);

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

      return savedCampaign;
    });
  }

  async findAll(client_id: number, name: string): Promise<Campaign[]> {
    let optionalWhereClause = {};

    if (name) {
      optionalWhereClause = {
        name: ILike(`%${name}%`),
      };
    }

    return this.campaignRepository.find({
      where: { tenant_id: client_id, ...optionalWhereClause },
      relations: ['rules', 'tiers', 'business_unit'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Campaign> {
    const campaign = await this.campaignRepository.findOne({
      where: { id },
      relations: ['rules', 'tiers', 'business_unit'],
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign with ID ${id} not found`);
    }

    return campaign;
  }

  async update(id: number, dto: UpdateCampaignDto): Promise<Campaign> {
    return await this.dataSource.transaction(async (manager) => {
      const campaign = await manager.findOne(Campaign, {
        where: { id },
        relations: ['rules', 'tiers'],
      });

      if (!campaign) {
        throw new NotFoundException(`Campaign with ID ${id} not found`);
      }

      // Update basic fields
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

      if (ruleIdsToRemove.length > 0) {
        await manager.delete(CampaignRule, {
          campaign: { id },
          rule: In(ruleIdsToRemove),
        });
      }

      if (ruleIdsToAdd.length > 0) {
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

      if (tierIdsToRemove.length > 0) {
        await manager.delete(CampaignTier, {
          campaign: { id },
          tier: In(tierIdsToRemove),
        });
      }

      if (tierIdsToAdd.length > 0) {
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
              `Tier ID ${tier.id} does not match with DTO tiers`,
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

      // === UPDATE point_conversion_rate of existing tiers ===
      const existingCampaignTiers = await manager.find(CampaignTier, {
        where: {
          campaign: { id },
          tier: In(existingTierIds),
        },
        relations: ['tier'],
      });

      const tiersToUpdate = existingCampaignTiers.filter((ct) =>
        dtoTierMap.has(ct.tier.id),
      );

      for (const ct of tiersToUpdate) {
        const newRate = dtoTierMap.get(ct.tier.id)?.point_conversion_rate;
        if (ct.point_conversion_rate !== newRate) {
          ct.point_conversion_rate = newRate;
        }
      }

      if (tiersToUpdate.length > 0) {
        await manager.save(CampaignTier, tiersToUpdate);
      }

      return updatedCampaign;
    });
  }

  async remove(id: number): Promise<{ deleted: boolean }> {
    const result = await this.campaignRepository.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Campaign with ID ${id} not found`);
    }
    return { deleted: true };
  }
}
