import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { CreateBusinessUnitDto } from '../dto/create-business-unit.dto';
import { UpdateBusinessUnitDto } from '../dto/update-business-unit.dto';
import { BusinessUnit } from '../entities/business_unit.entity';

@Injectable()
export class BusinessUnitsService {
  constructor(
    @InjectRepository(BusinessUnit)
    private readonly repo: Repository<BusinessUnit>,

    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateBusinessUnitDto, user: string) {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user }; // ✅ make user available in subscriber

      const repo = queryRunner.manager.getRepository(BusinessUnit);

      const unit = repo.create({
        ...dto,
        status: 1, // 👈 Hardcoded status
      });

      const saved = await repo.save(unit);

      await queryRunner.commitTransaction();
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(client_id: number, name: string) {
    let optionalWhereClause = {};

    if (name) {
      optionalWhereClause = {
        name: ILike(`%${name}%`),
      };
    }

    return await this.repo.find({
      where: {
        status: 1, // Only active business units
        tenant_id: client_id,
        ...optionalWhereClause,
      },
    });
  }

  async findOne(id: number) {
    return await this.repo.findOne({ where: { id } });
  }

  async update(id: number, dto: UpdateBusinessUnitDto, user: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user }; // 👈 Pass user for audit trail

      const repo = queryRunner.manager.getRepository(BusinessUnit);

      const unit = await repo.findOne({ where: { id } });
      if (!unit) {
        throw new Error(`Business Unit with id ${id} not found`);
      }

      if (unit.name === 'All Business Unit') {
        throw new Error('Cannot update the default business unit');
      }

      // Merge the DTO into the existing entity
      repo.merge(unit, dto);
      await repo.save(unit); // save triggers beforeUpdate + afterInsert

      await queryRunner.commitTransaction();
      return await this.findOne(id); // Can optionally re-fetch using main repo
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: number, user: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      queryRunner.data = { user };

      const repo = queryRunner.manager.getRepository(BusinessUnit);

      const unit = await repo.findOne({ where: { id } });
      if (!unit) {
        throw new Error(`Business Unit with id ${id} not found`);
      }

      if (unit.name === 'All Business Unit') {
        throw new Error('Cannot delete the default business unit');
      }

      // Instead of removing, we soft-delete by updating status
      unit.status = 0;
      await repo.save(unit);

      await queryRunner.commitTransaction();
      return { message: 'Marked as inactive successfully' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
