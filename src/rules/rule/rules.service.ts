import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { Rule } from '../entities/rules.entity';
import { CreateRuleDto } from '../dto/create-rule.dto';
import { UpdateRuleDto } from '../dto/update-rule.dto';
import { Tenant } from 'src/tenants/entities/tenant.entity';

@Injectable()
export class RulesService {
  constructor(
    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,

    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,

    @InjectDataSource()
    private readonly dataSource: DataSource,
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
        validity_after_assignment: dto.validity_after_assignment,
        frequency: dto.frequency,
        created_by: createdBy,
        updated_by: createdBy,
        condition_type: dto.condition_type,
        condition_operator: dto.condition_operator,
        condition_value: dto.condition_value,
        status: 1, // Default to active,
        burn_type: dto?.burn_type || null,
        reward_condition: dto?.reward_condition || null,
      });

      const savedRule = await queryRunner.manager.save(rule);
      await queryRunner.commitTransaction();
      return savedRule;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  findAll(client_id: number, name: string) {
    let optionalWhereClause: Record<string, any> = {};

    if (name) {
      optionalWhereClause = [
        { name: ILike(`%${name}%`) },
        { rule_type: ILike(`%${name}%`) },
      ];
    }

    return this.ruleRepository.find({
      select: [
        'id',
        'name',
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
        'validity_after_assignment',
        'frequency',
        'burn_type',
        'status',
        'uuid',
        'reward_condition',
      ],
      where: name
        ? optionalWhereClause.map((condition) => ({
            tenant_id: client_id,
            status: 1,
            ...condition,
          }))
        : {
            tenant_id: client_id,
            status: 1,
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
        'validity_after_assignment',
        'frequency',
        'burn_type',
        'status',
        'reward_condition',
      ],
      where: {
        tenant_id: tenant.id,
        ...optionalWhereClause,
        status: 1, // Only active rules
      },
    });
  }

  async findOne(uuid: string) {
    return this.ruleRepository.findOne({
      select: [
        'name',
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
        'validity_after_assignment',
        'frequency',
        'burn_type',
        'status',
        'reward_condition',
      ],
      where: { uuid },
    });
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
      rule.condition_type = dto.condition_type ?? rule.condition_type;
      rule.condition_operator =
        dto.condition_operator ?? rule.condition_operator;
      rule.condition_value = dto.condition_value ?? rule.condition_value;
      rule.updated_by = dto.updated_by ?? rule.updated_by;
      rule.frequency = dto.frequency ?? rule.frequency;
      rule.burn_type = dto.burn_type ? rule.burn_type : null;
      rule.reward_condition = dto.reward_condition ?? rule.reward_condition;

      await manager.save(rule);
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
