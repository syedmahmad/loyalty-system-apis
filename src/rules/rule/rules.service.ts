import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rule } from '../entities/rules.entity';
import { RuleTarget } from '../entities/rule-target.entity';
import { CreateRuleDto } from '../dto/create-rule.dto';
import { UpdateRuleDto } from '../dto/update-rule.dto';

@Injectable()
export class RulesService {
  constructor(
    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,
    @InjectRepository(RuleTarget)
    private readonly ruleTargetRepository: Repository<RuleTarget>,
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
      targets: (dto.targets || [])
        .filter((t) => !!t.target_type && !!t.target_id)
        .map((t) => ({
          target_type: t.target_type,
          target_id: t.target_id,
          created_by: createdBy,
          updated_by: createdBy,
        })),
    });

    const savedRule = await this.ruleRepository.save(rule);

    return this.ruleRepository.findOne({
      where: { id: savedRule.id },
      relations: ['targets'],
    });
  }

  findAll() {
    return this.ruleRepository.find({ relations: ['targets'] });
  }

  findOne(id: number) {
    return this.ruleRepository.findOne({
      where: { id },
      relations: ['targets'],
    });
  }

  async update(id: number, dto: UpdateRuleDto) {
    const rule = await this.ruleRepository.findOne({
      where: { id },
      relations: ['targets'],
    });

    if (!rule) throw new Error('Rule not found');

    // 1. Update scalar fields
    rule.type = dto.type;
    rule.condition_type = dto.condition_type;
    rule.operator = dto.operator;
    rule.value = dto.value;
    rule.reward_value = dto.reward_value;
    rule.unit_type = dto.unit_type;
    rule.description = dto.description;
    rule.updated_by = dto.updated_by;

    // 2. Track existing targets by ID
    const existingTargets = rule.targets ?? [];
    const existingById = new Map(existingTargets.map((t) => [t.id, t]));

    console.log('existingById', existingById);

    const updatedTargets: RuleTarget[] = [];

    for (const t of dto.targets || []) {
      if (t.target_id && existingById.has(t.id)) {
        // Update existing target
        const target = existingById.get(t.id)!;
        target.target_type = t.target_type;
        target.target_id = t.target_id;
        target.updated_by = dto.updated_by;
        updatedTargets.push(target);
        existingById.delete(t.target_id); // Remove matched ones
      } else {
        console.log('inside create');

        // Create new target
        const newTarget = this.ruleTargetRepository.create({
          rule,
          target_type: t.target_type,
          target_id: t.target_id,
          created_by: dto.updated_by,
          updated_by: dto.updated_by,
        });
        updatedTargets.push(newTarget);
      }
    }

    // 3. Optionally delete removed targets
    // if (existingById.size > 0) {
    //   const removedTargets = Array.from(existingById.values());
    //   rule.targets = updatedTargets; // set new list
    //   await this.ruleTargetRepository.remove(removedTargets);
    // }

    // 4. Set targets and save everything in one go
    rule.targets = updatedTargets;

    await this.ruleRepository.save(rule);

    return this.findOne(id);
  }

  async remove(id: number) {
    await this.ruleRepository.delete(id);
    return { deleted: true };
  }
}
