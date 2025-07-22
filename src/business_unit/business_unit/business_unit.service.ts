import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, In, Repository } from 'typeorm';
import { CreateBusinessUnitDto } from '../dto/create-business-unit.dto';
import { UpdateBusinessUnitDto } from '../dto/update-business-unit.dto';
import { BusinessUnit } from '../entities/business_unit.entity';
import { User } from 'src/users/entities/user.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';

@Injectable()
export class BusinessUnitsService {
  constructor(
    @InjectRepository(BusinessUnit)
    private readonly repo: Repository<BusinessUnit>,

    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,

    @InjectRepository(User)
    private userRepository: Repository<User>,

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

  async findAll(client_id: number, name: string, userId: number) {
    const optionalWhereClause: any = {};

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found against user-token');
    }

    const privileges: any[] = user.user_privileges || [];

    if (name) {
      optionalWhereClause.name = ILike(`%${name}%`);
    }

    // get tenant name from DB (we'll need this to match privileges like `NATC_service_center`)
    const tenant = await this.tenantRepository.findOne({
      where: { id: client_id },
    });
    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    const tenantName = tenant.name;

    // check for global business unit access for this tenant
    const hasGlobalBusinessUnitAccess = privileges.some(
      (p) =>
        p.module === 'businessUnits' &&
        p.name === `${tenantName}_All Business Unit`,
    );

    // if global access, return all business units under the tenant
    if (hasGlobalBusinessUnitAccess) {
      return await this.repo.find({
        where: {
          status: 1,
          tenant_id: client_id,
          ...optionalWhereClause,
        },
      });
    }

    // if no global access, extract specific BU names from privileges
    const accessibleBusinessUnitNames = privileges
      .filter(
        (p) =>
          p.module === 'businessUnits' &&
          p.name.startsWith(`${tenantName}_`) &&
          p.name !== `${tenantName}_All Business Unit`,
      )
      .map((p) => p.name.replace(`${tenantName}_`, ''));

    if (!accessibleBusinessUnitNames.length) {
      return []; // No access
    }

    return await this.repo.find({
      where: {
        status: 1,
        tenant_id: client_id,
        name: In(accessibleBusinessUnitNames),
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

  async getTanantInfo(id) {
    return await this.repo.findOne({
      where: { uuid: id },
      relations: { tenant: true },
    });
  }
}
