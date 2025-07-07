import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { CreateBusinessUnitDto } from '../dto/create-business-unit.dto';
import { UpdateBusinessUnitDto } from '../dto/update-business-unit.dto';
import { BusinessUnit } from '../entities/business_unit.entity';

@Injectable()
export class BusinessUnitsService {
  constructor(
    @InjectRepository(BusinessUnit)
    private readonly repo: Repository<BusinessUnit>,
  ) {}

  async create(dto: CreateBusinessUnitDto) {
    const unit = this.repo.create(dto);
    return await this.repo.save(unit);
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
        tenant_id: client_id,
        ...optionalWhereClause,
      },
    });
  }

  async findOne(id: number) {
    return await this.repo.findOne({ where: { id } });
  }

  async update(id: number, dto: UpdateBusinessUnitDto) {
    const unit = await this.repo.findOne({ where: { id } });
    if (!unit) {
      throw new Error(`Business Unit with id ${id} not found`);
    }

    if (unit.name === 'All Business Unit') {
      throw new Error('Cannot update the default business unit');
    }

    await this.repo.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: number) {
    const unit = await this.repo.findOne({ where: { id } });
    if (!unit) {
      throw new Error(`Business Unit with id ${id} not found`);
    }

    if (unit.name === 'All Business Unit') {
      throw new Error('Cannot delete the default business unit');
    }

    return await this.repo.delete(id);
  }
}
