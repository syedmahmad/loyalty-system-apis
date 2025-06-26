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
      min_transaction_amount: dto.min_transaction_amount,
      max_points_limit: dto.max_points_limit,
      earn_conversion_factor: dto.earn_conversion_factor,
      burn_factor: dto.burn_factor,
      max_burn_percent: dto.max_burn_percent,
      min_points_to_burn: dto.min_points_to_burn,
      description: dto.description,
      created_by: createdBy,
      updated_by: createdBy,
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
    rule.min_transaction_amount =
      dto.min_transaction_amount ?? rule.min_transaction_amount;
    rule.max_points_limit = dto.max_points_limit ?? rule.max_points_limit;
    rule.earn_conversion_factor =
      dto.earn_conversion_factor ?? rule.earn_conversion_factor;
    rule.burn_factor = dto.burn_factor ?? rule.burn_factor;
    rule.max_burn_percent = dto.max_burn_percent ?? rule.max_burn_percent;
    rule.min_points_to_burn = dto.min_points_to_burn ?? rule.min_points_to_burn;
    rule.description = dto.description ?? rule.description;
    rule.updated_by = dto.updated_by ?? rule.updated_by;

    await this.ruleRepository.save(rule);

    return this.findOne(id);
  }

  async remove(id: number) {
    await this.ruleRepository.delete(id);
    return { deleted: true };
  }
}
