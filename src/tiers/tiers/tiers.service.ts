import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tier } from '../entities/tier.entity';
import { CreateTierDto } from '../dto/create-tier.dto';
import { UpdateTierDto } from '../dto/update-tier.dto';
import { RuleTarget } from '../../rules/entities/rule-target.entity'; // adjust path as needed
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';

@Injectable()
export class TiersService {
  constructor(
    @InjectRepository(Tier)
    private tiersRepository: Repository<Tier>,
    @InjectRepository(RuleTarget)
    private ruleTargetRepository: Repository<RuleTarget>,
    @InjectRepository(BusinessUnit)
    private businessUnitRepository: Repository<BusinessUnit>, // adjust path as needed
  ) {}

  async create(dto: CreateTierDto) {
    const tier = this.tiersRepository.create(dto);
    const savedTier = await this.tiersRepository.save(tier);
    // 2. Create RuleTarget records for this tier
    // const createdBy = dto.created_by || 2;

    // if (dto.rule_targets?.length) {
    //   const targets = dto.rule_targets.map((rt) =>
    //     this.ruleTargetRepository.create({
    //       rule_id: rt.rule_id,
    //       target_type: 'tier',
    //       target_id: savedTier.id,
    //       created_by: createdBy,
    //       updated_by: createdBy,
    //     }),
    //   );
    //   await this.ruleTargetRepository.save(targets);
    // }

    return savedTier;
  }

  async findAll() {
    const ruleTargets = await this.ruleTargetRepository.find({
      where: { target_type: 'tier' },
      relations: { rule: true },
    });

    const tiers = await this.tiersRepository.find({
      relations: { business_unit: true },
      order: { created_at: 'DESC' },
    });

    return {
      tiers: tiers.map((tier) => {
        const targets = ruleTargets
          .filter((rt) => rt.target_id === tier.id)
          .map((rt) => ({
            id: rt.id,
            rule_id: rt.rule_id,
          }));
        return { ...tier, rule_targets: targets };
      }),
    };
  }

  async findOne(id: number) {
    const tier = await this.tiersRepository.findOne({
      where: { id },
      relations: { business_unit: true },
      order: { created_at: 'DESC' },
    });

    if (!tier) throw new NotFoundException('Tier not found');

    const ruleTargets = await this.ruleTargetRepository.find({
      where: {
        target_type: 'tier',
        target_id: id,
      },
      relations: { rule: true },
    });

    const rule_targets = ruleTargets.map((rt) => ({
      id: rt.id,
      rule_id: rt.rule_id,
    }));

    return {
      ...tier,
      rule_targets,
    };
  }

  async update(id: number, dto: UpdateTierDto) {
    const tier = await this.findOne(id);
    Object.assign(tier, dto);
    // return this.tiersRepository.save(tier);
    const updatedTier = await this.tiersRepository.save(tier);

    // const updatedBy = dto.updated_by || 2;

    // Remove existing rule_targets linked to this tier
    await this.ruleTargetRepository.delete({
      target_type: 'tier',
      target_id: id,
    });

    // Add new rule_targets
    // if (dto.rule_targets?.length) {
    //   const newTargets = dto.rule_targets.map((rt) =>
    //     this.ruleTargetRepository.create({
    //       rule_id: rt.rule_id,
    //       target_type: 'tier',
    //       target_id: id,
    //       created_by: updatedBy,
    //       updated_by: updatedBy,
    //     }),
    //   );
    //   await this.ruleTargetRepository.save(newTargets);
    // }

    return updatedTier;
  }

  async remove(id: number) {
    const tier = await this.findOne(id);
    await this.tiersRepository.remove(tier);
  }
}
