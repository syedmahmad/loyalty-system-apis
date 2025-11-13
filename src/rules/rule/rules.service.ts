import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { Rule } from '../entities/rules.entity';
import { CreateRuleDto } from '../dto/create-rule.dto';
import { UpdateRuleDto } from '../dto/update-rule.dto';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { RuleTier } from '../entities/rules-tier';
import { OpenAIService } from 'src/openai/openai/openai.service';
import {
  WalletTransaction,
  WalletTransactionType,
} from 'src/wallet/entities/wallet-transaction.entity';
import { Customer } from 'src/customers/entities/customer.entity';
import { RuleLocaleEntity } from '../entities/rule-locale.entity';
import { BaseService } from 'src/core/services/base.service';

@Injectable()
export class RulesService extends BaseService {
  constructor(
    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,

    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,

    @InjectRepository(BusinessUnit)
    private readonly businessUnitRepository: Repository<BusinessUnit>,

    @InjectRepository(RuleTier)
    private readonly ruleTierRepository: Repository<RuleTier>,

    @InjectRepository(WalletTransaction)
    private readonly walletTransactionRepository: Repository<WalletTransaction>,

    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,

    @InjectRepository(RuleLocaleEntity)
    private readonly ruleLocaleRepository: Repository<RuleLocaleEntity>,

    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly openaiService: OpenAIService,
  ) {
    super();
  }

  async create(dto: CreateRuleDto, user: string): Promise<Rule> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = { user }; // 👈 Pass the user into subscriber

    try {
      const createdBy =
        dto.created_by && dto.created_by !== 0 ? dto.created_by : 2;

      const rule = this.ruleRepository.create({
        slug: dto.slug,
        rule_type: dto.rule_type,
        tenant_id: dto.client_id,
        min_amount_spent: dto.min_amount_spent,
        reward_points: dto.reward_points,
        event_triggerer: dto.event_triggerer,
        max_redeemption_points_limit: dto.max_redeemption_points_limit,
        points_conversion_factor: dto.points_conversion_factor,
        max_burn_percent_on_invoice: dto.max_burn_percent_on_invoice,
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
        locales: dto?.locales?.map((locale) => ({
          name: locale.name,
          description: locale.description,
          language: { id: locale.languageId },
        })) as any,
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
    customer_id: string,
    language_code: string = 'en',
  ) {
    if (!customer_id) throw new NotFoundException('Customer not found');

    const customer = await this.customerRepo.findOne({
      where: {
        uuid: customer_id,
        status: 1,
        business_unit: { id: parseInt(business_unit_id) },
        tenant: { id: parseInt(tenant_id) },
      },
    });

    if (!customer) throw new NotFoundException('Customer not found');

    // Get all active event-based earn rules
    const queryBuilder = this.ruleRepository
      .createQueryBuilder('rule')
      .select([
        'rule.uuid',
        'rule.reward_points',
        'rule.event_triggerer',
        'rule.validity_after_assignment',
        'rule.status',
      ])
      .leftJoinAndSelect('rule.locales', 'locale')
      .leftJoinAndSelect('locale.language', 'language')
      .where('rule.rule_type = :ruleType', { ruleType: 'event based earn' })
      .andWhere('rule.status = :status', { status: 1 })
      .andWhere('rule.tenant_id = :tenantId', { tenantId: parseInt(tenant_id) })
      .andWhere('rule.business_unit_id = :businessUnitId', {
        businessUnitId: parseInt(business_unit_id),
      })
      .orderBy('rule.created_at', 'DESC');

    if (language_code) {
      queryBuilder.andWhere('language.code = :language_code', {
        language_code,
      });
    }

    const rules = await queryBuilder.getMany();

    // Get rules that the customer has already earned
    const earnedTransactions = await this.walletTransactionRepository.find({
      where: {
        customer: { id: customer.id },
        type: WalletTransactionType.EARN,
        business_unit: { id: parseInt(business_unit_id) },
      },
      select: ['source_type'],
    });

    // Extract unique rule names that customer has already earned
    const earnedRuleNames = new Set(
      earnedTransactions
        .map((transaction) => transaction.source_type)
        .filter((sourceType) => sourceType !== null),
    );

    // Filter out rules that customer has already earned
    const availableRules = rules.filter(
      (rule) => !earnedRuleNames.has(rule?.locales?.[0]?.name),
    );

    // The error message "Unknown column 'distinctAlias.Rule_id' in 'field list'" suggests that TypeORM is generating a query asking for 'Rule_id',
    // but the column in your database is probably called 'id' (or another field name), not 'Rule_id'.
    // In your `.findOne()` call, you are querying by the primary key using a select list that does NOT include 'id', which TypeORM often requires
    // (especially if the primary key column is called 'id', not 'Rule_id', or if you have customized entity field names).
    // To fix this, add 'id' to your select array:
    const spendAndEarn = await this.ruleRepository.find({
      select: [
        'uuid',
        'reward_points',
        'event_triggerer',
        'validity_after_assignment',
        'status',
      ],
      where: {
        tenant: { id: parseInt(tenant_id) },
        business_unit: { id: parseInt(business_unit_id) },
        rule_type: 'spend and earn',
        status: 1,
      },
    });

    if (spendAndEarn.length) {
      availableRules.push(spendAndEarn[0]);
    }

    // Map results and only return the correct language fields
    return await Promise.all(
      availableRules.map(async (rule) => ({
        uuid: rule?.uuid,
        name: rule?.locales?.[0]?.name,
        description: rule?.locales?.[0]?.description,
        reward_points: rule.reward_points,
        event_triggerer: rule.event_triggerer,
        validity_after_assignment: rule.validity_after_assignment,
        status: rule.status,
      })),
    );
  }

  async findAll(client_id: number, name: string, bu: number, langCode = 'en') {
    const queryBuilder = this.ruleRepository
      .createQueryBuilder('rules')
      .where('rules.status = :status', { status: 1 })
      .orderBy('rules.created_at', 'DESC');

    if (client_id) {
      queryBuilder.andWhere('rules.tenant_id = :tenant_id', {
        tenant_id: client_id,
      });
    }

    if (bu) {
      queryBuilder.andWhere('rules.business_unit_id = :business_unit_id', {
        business_unit_id: bu,
      });
    }

    if (name) {
      queryBuilder.andWhere(`locale.name LIKE :name`, {
        name: `%${name.trim()}%`,
      });
    }

    if (langCode) {
      queryBuilder
        .leftJoinAndSelect('rules.locales', 'locale')
        .leftJoin('locale.language', 'language')
        .andWhere('language.code = :langCode', { langCode: langCode });
    } else {
      queryBuilder
        .leftJoinAndSelect('rules.locales', 'locale')
        .leftJoinAndSelect('locale.language', 'language');
    }
    const rules = await queryBuilder.getMany();

    return {
      message: 'Rule retrieved successfully',
      rules,
    };
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

      if (dto.locales) {
        for (const locale of dto.locales) {
          const existing = await manager.findOne(RuleLocaleEntity, {
            where: { rule: { id: rule.id }, id: locale.id },
          });

          if (existing) {
            existing.name = locale.name ?? existing.name;
            existing.description = locale.description ?? existing.description;
            await manager.save(existing);
          } else {
            const newRuleTier = manager.create(RuleLocaleEntity, {
              rule,
              name: locale.name ?? null,
              description: locale.description ?? null,
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
