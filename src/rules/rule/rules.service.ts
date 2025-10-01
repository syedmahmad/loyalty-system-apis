import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { Rule } from '../entities/rules.entity';
import { CreateRuleDto } from '../dto/create-rule.dto';
import { UpdateRuleDto } from '../dto/update-rule.dto';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { RuleTier } from '../entities/rules-tier';
import { OpenAIService } from 'src/openai/openai/openai.service';

@Injectable()
export class RulesService {
  constructor(
    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,

    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,

    @InjectRepository(BusinessUnit)
    private readonly businessUnitRepository: Repository<BusinessUnit>,

    @InjectRepository(RuleTier)
    private readonly ruleTierRepository: Repository<RuleTier>,

    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly openaiService: OpenAIService,
  ) {}

  async create(dto: CreateRuleDto, user: string): Promise<Rule> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = { user }; // 👈 Pass the user into subscriber

    try {
      const createdBy =
        dto.created_by && dto.created_by !== 0 ? dto.created_by : 2;

      const rule = this.ruleRepository.create({
        name: dto.name,
        name_ar: dto.name_ar,
        slug: dto.slug,
        rule_type: dto.rule_type,
        tenant_id: dto.client_id,
        min_amount_spent: dto.min_amount_spent,
        reward_points: dto.reward_points,
        event_triggerer: dto.event_triggerer,
        max_redeemption_points_limit: dto.max_redeemption_points_limit,
        points_conversion_factor: dto.points_conversion_factor,
        max_burn_percent_on_invoice: dto.max_burn_percent_on_invoice,
        description: dto.description,
        description_ar: dto.description,
        validity_after_assignment: dto.validity_after_assignment
          ? dto.validity_after_assignment
          : 0,
        frequency: dto.frequency,
        created_by: createdBy,
        updated_by: createdBy,
        condition_type: dto.condition_type,
        condition_operator: dto.condition_operator,
        condition_value: dto.condition_value,
        status: 1, // Default to active,
        burn_type: dto?.burn_type || null,
        reward_condition: dto?.reward_condition || null,
        dynamic_conditions: dto?.dynamic_conditions || null,
        is_priority: dto?.is_priority,
        business_unit_id: dto?.business_unit_id,
      });

      const savedRule = await queryRunner.manager.save(rule);

      // Handle rule_tiers
      if (dto.tiers && dto.tiers.length > 0) {
        const ruleTiers = dto.tiers.map((t) =>
          queryRunner.manager.create(RuleTier, {
            rule: savedRule,
            tier: { id: t.tier_id },
            point_conversion_rate: t.point_conversion_rate ?? 1,
          }),
        );

        await queryRunner.manager.save(ruleTiers);
      }
      await queryRunner.commitTransaction();
      return savedRule;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async allEventBased(
    tenant_id: string,
    business_unit_id: string,
    language_code: string = 'en',
  ) {
    const tenant = await this.tenantRepository.findOne({
      where: {
        uuid: tenant_id,
      },
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const businessUnit = await this.businessUnitRepository.findOne({
      where: {
        uuid: business_unit_id,
        tenant: { id: tenant.id },
      },
    });

    const rules = await this.ruleRepository.find({
      select: [
        'uuid',
        'name',
        'name_ar',
        'reward_points',
        'event_triggerer',
        'description',
        'description_ar',
        'validity_after_assignment',
        'status',
      ],
      where: {
        tenant: { id: tenant.id },
        business_unit: { id: businessUnit.id },
        rule_type: 'event based earn',
        status: 1,
      },
    });

    // Map results and only return the correct language fields
    return await Promise.all(
      rules.map(async (rule) => ({
        uuid: rule.uuid,
        name:
          language_code === 'en'
            ? rule.name
            : await this.openaiService.translateToArabic(rule.name),
        reward_points: rule.reward_points,
        event_triggerer: rule.event_triggerer,
        description:
          language_code === 'en'
            ? rule.description
            : rule.description !== ''
              ? await this.openaiService.translateToArabic(rule.description)
              : null,
        validity_after_assignment: rule.validity_after_assignment,
        status: rule.status,
      })),
    );
  }

  findAll(client_id: number, name: string, bu: number) {
    let optionalWhereClause: Record<string, any> = {};

    if (name) {
      optionalWhereClause = [
        { name: ILike(`%${name}%`) },
        { rule_type: ILike(`%${name}%`) },
      ];
    }

    return this.ruleRepository.find({
      relations: { business_unit: true, tiers: true },
      select: [
        'id',
        'name',
        'name_ar',
        'slug',
        'rule_type',
        'condition_type',
        'condition_operator',
        'condition_value',
        'min_amount_spent',
        'reward_points',
        'event_triggerer',
        'max_redeemption_points_limit',
        'points_conversion_factor',
        'max_burn_percent_on_invoice',
        'description',
        'description_ar',
        'validity_after_assignment',
        'frequency',
        'burn_type',
        'status',
        'uuid',
        'reward_condition',
        'dynamic_conditions',
        'is_priority',
        'business_unit_id',
      ],
      where: name
        ? optionalWhereClause.map((condition) => ({
            tenant_id: client_id,
            status: 1,
            ...(bu ? { business_unit_id: bu } : {}),
            ...condition,
          }))
        : {
            tenant_id: client_id,
            status: 1,
            ...(bu ? { business_unit_id: bu } : {}),
          },
    });
  }

  async findAllForThirdParty(tenant_id: string, name: string) {
    let optionalWhereClause = {};

    const tenant = await this.tenantRepository.findOne({
      where: {
        uuid: tenant_id,
      },
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    if (name) {
      optionalWhereClause = {
        name: ILike(`%${name}%`),
      };
    }

    return this.ruleRepository.find({
      select: [
        'uuid',
        'name',
        'name_ar',
        'slug',
        'rule_type',
        'condition_type',
        'condition_operator',
        'condition_value',
        'min_amount_spent',
        'reward_points',
        'event_triggerer',
        'max_redeemption_points_limit',
        'points_conversion_factor',
        'max_burn_percent_on_invoice',
        'description',
        'description_ar',
        'validity_after_assignment',
        'frequency',
        'burn_type',
        'status',
        'reward_condition',
        'dynamic_conditions',
        'is_priority',
        'business_unit_id',
      ],
      where: {
        tenant_id: tenant.id,
        ...optionalWhereClause,
        status: 1, // Only active rules
      },
    });
  }

  async findOne(uuid: string) {
    const rule = await this.ruleRepository.findOne({
      select: [
        'id',
        'name',
        'name_ar',
        'slug',
        'rule_type',
        'condition_type',
        'condition_operator',
        'condition_value',
        'min_amount_spent',
        'reward_points',
        'event_triggerer',
        'max_redeemption_points_limit',
        'points_conversion_factor',
        'max_burn_percent_on_invoice',
        'description',
        'description_ar',
        'validity_after_assignment',
        'frequency',
        'burn_type',
        'status',
        'reward_condition',
        'dynamic_conditions',
        'is_priority',
        'business_unit_id',
      ],
      relations: { business_unit: true, tiers: true },
      where: { uuid },
    });

    // 👇 remove `id` before sending back
    if (rule) {
      delete (rule as any).id;
    }

    return rule;
  }

  async update(uuid: string, dto: UpdateRuleDto, user: string): Promise<Rule> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = { user };

    try {
      const manager = queryRunner.manager;

      const rule = await manager.findOne(Rule, { where: { uuid } });
      if (!rule) throw new Error('Rule not found');

      rule.name = dto.name ?? rule.name;
      rule.name_ar = dto.name_ar ?? rule.name_ar;
      rule.slug = dto.slug ?? rule.slug;
      rule.rule_type = dto.rule_type ?? rule.rule_type;
      rule.min_amount_spent = dto.min_amount_spent ?? rule.min_amount_spent;
      rule.reward_points = dto.reward_points ?? rule.reward_points;
      rule.event_triggerer = dto.event_triggerer ?? rule.event_triggerer;
      rule.max_redeemption_points_limit =
        dto.max_redeemption_points_limit ?? rule.max_redeemption_points_limit;
      rule.points_conversion_factor =
        dto.points_conversion_factor ?? rule.points_conversion_factor;
      rule.max_burn_percent_on_invoice =
        dto.max_burn_percent_on_invoice ?? rule.max_burn_percent_on_invoice;
      rule.description = dto.description ?? rule.description;
      rule.description_ar = dto.description_ar ?? rule.description_ar;
      rule.condition_type = dto.condition_type ?? rule.condition_type;
      rule.condition_operator =
        dto.condition_operator ?? rule.condition_operator;
      rule.condition_value = dto.condition_value ?? rule.condition_value;
      rule.updated_by = dto.updated_by ?? rule.updated_by;
      rule.frequency = dto.frequency ?? rule.frequency;
      rule.burn_type = dto.burn_type ?? null;
      rule.reward_condition = dto.reward_condition ?? rule.reward_condition;
      rule.dynamic_conditions = dto.dynamic_conditions || null;
      rule.is_priority = dto.is_priority;
      rule.business_unit_id = dto.business_unit_id;
      rule.validity_after_assignment = dto.validity_after_assignment
        ? dto.validity_after_assignment
        : 0;

      await manager.save(rule);
      // Replace tiers if provided
      if (dto.tiers) {
        for (const t of dto.tiers) {
          const existing = await manager.findOne(RuleTier, {
            where: { rule: { id: rule.id }, tier: { id: t.tier_id } },
          });

          if (existing) {
            // update existing
            existing.point_conversion_rate =
              t.point_conversion_rate ?? existing.point_conversion_rate;
            await manager.save(existing);
          } else {
            // create new
            const newRuleTier = manager.create(RuleTier, {
              rule,
              tier: { id: t.tier_id },
              point_conversion_rate: t.point_conversion_rate ?? 1,
            });
            await manager.save(newRuleTier);
          }
        }
      }

      await queryRunner.commitTransaction();

      return await this.findOne(uuid); // from your service
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(uuid: string, user: string): Promise<{ deleted: boolean }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = { user };

    try {
      const manager = queryRunner.manager;

      const rule = await manager.findOne(Rule, { where: { uuid } });
      if (!rule) throw new Error('Rule not found');

      rule.status = 0; // 👈 Soft delete by updating status
      await manager.save(rule);

      await queryRunner.commitTransaction();
      return { deleted: true };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
