import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
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

    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateTierDto, user: string): Promise<Tier> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = { user };

    try {
      // 1. Create and save the Tier
      const tier = this.tiersRepository.create(dto);
      const savedTier = await queryRunner.manager.save(tier);

      // 2. Optionally create RuleTarget records
      // if (dto.rule_targets?.length) {
      //   const createdBy = dto.created_by || user;

      //   const targets = dto.rule_targets.map((rt) =>
      //     this.ruleTargetRepository.create({
      //       rule_id: rt.rule_id,
      //       target_type: 'tier',
      //       target_id: savedTier.id,
      //       created_by: createdBy,
      //       updated_by: createdBy,
      //     }),
      //   );

      //   await queryRunner.manager.save(targets);
      // }

      await queryRunner.commitTransaction();
      return savedTier;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(client_id: number, name: string) {
    const ruleTargets = await this.ruleTargetRepository.find({
      where: { target_type: 'tier' },
      relations: { rule: true },
    });

    let optionalWhereClause = {};

    if (name) {
      optionalWhereClause = {
        name: ILike(`%${name}%`),
      };
    }

    const tiers = await this.tiersRepository.find({
      where: { tenant_id: client_id, ...optionalWhereClause },
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

  async update(id: number, dto: UpdateTierDto, user: string): Promise<Tier> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = { user };

    try {
      const tier = await queryRunner.manager.findOne(Tier, {
        where: { id },
        relations: ['business_unit'],
      });

      if (!tier) {
        throw new NotFoundException(`Tier with id ${id} not found`);
      }

      if (
        dto.business_unit_id &&
        dto.business_unit_id !== tier.business_unit?.id
      ) {
        const bu = await queryRunner.manager.findOne(BusinessUnit, {
          where: { id: dto.business_unit_id },
        });

        if (!bu) {
          throw new NotFoundException('Business Unit not found');
        }

        tier.business_unit = bu;
      }

      Object.assign(tier, dto);
      const updatedTier = await queryRunner.manager.save(tier);

      // Optional RuleTargets
      // if (dto.rule_targets) {
      //   // Remove old rule_targets
      //   await queryRunner.manager.delete(this.ruleTargetRepository.target, {
      //     target_type: 'tier',
      //     target_id: id,
      //   });

      //   if (dto.rule_targets.length > 0) {
      //     const updatedBy = dto.updated_by || user;
      //     const newTargets = dto.rule_targets.map((rt) =>
      //       this.ruleTargetRepository.create({
      //         rule_id: rt.rule_id,
      //         target_type: 'tier',
      //         target_id: id,
      //         created_by: updatedBy,
      //         updated_by: updatedBy,
      //       }),
      //     );
      //     await queryRunner.manager.save(newTargets);
      //   }
      // }

      await queryRunner.commitTransaction();
      return updatedTier;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
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
      const tier = await queryRunner.manager.findOne(Tier, { where: { id } });
      if (!tier) throw new NotFoundException(`Tier with id ${id} not found`);

      await queryRunner.manager.remove(tier);
      await queryRunner.commitTransaction();

      return { deleted: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
