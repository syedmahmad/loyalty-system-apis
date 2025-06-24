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
      type: dto.type,
      condition_type: dto.condition_type,
      operator: dto.operator,
      value: dto.value,
      reward_value: dto.reward_value,
      unit_type: dto.unit_type,
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

    rule.type = dto.type;
    rule.condition_type = dto.condition_type;
    rule.operator = dto.operator;
    rule.value = dto.value;
    rule.reward_value = dto.reward_value;
    rule.unit_type = dto.unit_type;
    rule.description = dto.description;
    rule.updated_by = dto.updated_by;

    await this.ruleRepository.save(rule);

    return this.findOne(id);
  }

  async remove(id: number) {
    await this.ruleRepository.delete(id);
    return { deleted: true };
  }
}
