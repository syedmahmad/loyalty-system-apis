import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Tenant } from '../entities/tenant.entity';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import { UpdateTenantDto } from '../dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private tenantsRepository: Repository<Tenant>,

    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateTenantDto, user: string): Promise<Tenant> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = { user };

    try {
      const tenant = this.tenantsRepository.create({ ...dto, status: 1 }); // Default to active status
      const savedTenant = await queryRunner.manager.save(tenant);

      await queryRunner.commitTransaction();
      return savedTenant;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll() {
    return await this.tenantsRepository.find();
  }

  async findOne(id: number) {
    const tenant = await this.tenantsRepository.findOneBy({ id, status: 1 });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async findByDomain(domain: string) {
    const tenant = await this.tenantsRepository.findOneBy({ domain });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async update(
    id: number,
    dto: UpdateTenantDto,
    user: string,
  ): Promise<Tenant> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    queryRunner.data = { user };

    try {
      const tenant = await queryRunner.manager.findOne(Tenant, {
        where: { id },
      });
      if (!tenant) throw new Error(`Tenant with ID ${id} not found`);

      Object.assign(tenant, dto);
      const updatedTenant = await queryRunner.manager.save(tenant);

      await queryRunner.commitTransaction();
      return updatedTenant;
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
      const tenant = await queryRunner.manager.findOne(Tenant, {
        where: { id },
      });
      if (!tenant) throw new Error(`Tenant with ID ${id} not found`);

      tenant.status = 0; // 👈 Set status to 0 instead of deleting
      await queryRunner.manager.save(tenant);

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
