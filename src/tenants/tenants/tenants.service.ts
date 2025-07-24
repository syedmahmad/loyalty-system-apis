import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Tenant } from '../entities/tenant.entity';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import { UpdateTenantDto } from '../dto/update-tenant.dto';
import { User } from 'src/users/entities/user.entity';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private tenantsRepository: Repository<Tenant>,

    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateTenantDto, user: string): Promise<Tenant> {
    const userInfo = await this.userRepository.findOne({
      where: { uuid: user },
    });

    if (!userInfo) {
      throw new BadRequestException('User not found against user-token');
    }

    const privileges: any = userInfo.user_privileges || [];
    const hasGlobalAccess = privileges.some(
      (p: any) => p.name === 'all_tenants',
    );
    if (!hasGlobalAccess) {
      throw new BadRequestException(
        'User does not have permission to create tenants',
      );
    }

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

  async findAll(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new BadRequestException('User not found against user-token');
    }

    const privileges: any = user.user_privileges || [];

    const tenants = await this.tenantsRepository.find({
      where: { status: 1 },
      order: { created_at: 'DESC' },
    });

    const hasGlobalAccess = privileges.some(
      (p: any) => p.name === 'all_tenants',
    );

    if (hasGlobalAccess) {
      return await this.tenantsRepository.find({
        where: { status: 1 },
      });
    }

    let matchedTenants: any[] = [];

    if (!hasGlobalAccess) {
      const tenantSpecificAccessNames = privileges
        .filter((p) => p.module === 'tenants' && p.name !== 'all_tenants')
        .map((p) => p.name);

      matchedTenants = tenants.filter((tenant) =>
        tenantSpecificAccessNames.includes(tenant.name),
      );
    }

    return matchedTenants;
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
