import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { Rule } from '../entities/rules.entity';
import { CreateRuleDto } from '../dto/create-rule.dto';
import { UpdateRuleDto } from '../dto/update-rule.dto';

@Injectable()
export class RulesService {
  constructor(
    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,

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
        created_by: createdBy,
        updated_by: createdBy,
        condition_type: dto.condition_type,
        condition_operator: dto.condition_operator,
        condition_value: dto.condition_value,
        status: 1, // Default to active
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
    let optionalWhereClause = {};

    if (name) {
      optionalWhereClause = {
        name: ILike(`%${name}%`),
      };
    }

    return this.ruleRepository.find({
      where: {
        tenant_id: client_id,
        ...optionalWhereClause,
        status: 1, // Only active rules
      },
    });
  }

  findOne(id: number) {
    return this.ruleRepository.findOne({ where: { id } });
  }

  async update(id: number, dto: UpdateRuleDto, user: string): Promise<Rule> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = { user };

    try {
      const manager = queryRunner.manager;

      const rule = await manager.findOne(Rule, { where: { id } });
      if (!rule) throw new Error('Rule not found');

      rule.name = dto.name ?? rule.name;
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

      await manager.save(rule);
      await queryRunner.commitTransaction();

      return await this.findOne(id); // from your service
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
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

      const rule = await manager.findOne(Rule, { where: { id } });
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
