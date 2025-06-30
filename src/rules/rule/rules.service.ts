import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rule } from '../entities/rules.entity';
import { CreateRuleDto } from '../dto/create-rule.dto';
import { UpdateRuleDto } from '../dto/update-rule.dto';

@Injectable()
export class RulesService {
  constructor(
    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,
  ) {}

  async create(dto: CreateRuleDto) {
    const createdBy =
      dto.created_by && dto.created_by !== 0 ? dto.created_by : 2;

    const rule = this.ruleRepository.create({
      name: dto.name,
      rule_type: dto.rule_type,
      min_amount_spent: dto.min_amount_spent,
      reward_points: dto.reward_points,
      event_triggerer: dto.event_triggerer,
      max_redeemption_points_limit: dto.max_redeemption_points_limit,
      points_conversion_factor: dto.points_conversion_factor,
      max_burn_percent_on_invoice: dto.max_burn_percent_on_invoice,
      description: dto.description,
      created_by: createdBy,
      updated_by: createdBy,
      condition_type: dto.condition_type,
      condition_operator: dto.condition_operator,
      condition_value: dto.condition_value,
    });

    return await this.ruleRepository.save(rule);
  }

  findAll() {
    return this.ruleRepository.find();
  }

  findOne(id: number) {
    return this.ruleRepository.findOne({ where: { id } });
  }

  async update(id: number, dto: UpdateRuleDto) {
    const rule = await this.ruleRepository.findOne({ where: { id } });
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
    rule.condition_operator = dto.condition_operator ?? rule.condition_operator;
    rule.condition_value = dto.condition_value ?? rule.condition_value;
    rule.updated_by = dto.updated_by ?? rule.updated_by;

    await this.ruleRepository.save(rule);
    return this.findOne(id);
  }

  async remove(id: number) {
    await this.ruleRepository.delete(id);
    return { deleted: true };
  }
}
