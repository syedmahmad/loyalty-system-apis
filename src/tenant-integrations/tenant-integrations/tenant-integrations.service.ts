import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TenantPartnerIntegration } from '../entities/tenant-partner-integration.entity';
import { Partner } from 'src/partners/entities/partner.entity';
import { User } from 'src/users/entities/user.entity';
import { CreateTenantIntegrationDto } from '../dto/create-tenant-integration.dto';
import { UpdateTenantIntegrationDto } from '../dto/update-tenant-integration.dto';

@Injectable()
export class TenantIntegrationsService {
  constructor(
    @InjectRepository(TenantPartnerIntegration)
    private tpiRepository: Repository<TenantPartnerIntegration>,

    @InjectRepository(Partner)
    private partnerRepository: Repository<Partner>,

    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findByTenant(tenantId: number): Promise<TenantPartnerIntegration[]> {
    return this.tpiRepository.find({
      where: { tenant_id: tenantId },
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number): Promise<TenantPartnerIntegration> {
    const record = await this.tpiRepository.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Tenant integration #${id} not found`);
    }
    return record;
  }

  async create(
    dto: CreateTenantIntegrationDto,
    userUuid: string,
  ): Promise<TenantPartnerIntegration> {
    const user = await this.userRepository.findOne({
      where: { uuid: userUuid },
    });
    if (!user) {
      throw new BadRequestException('User not found against user-token');
    }

    const partner = await this.partnerRepository.findOne({
      where: { id: dto.partner_id },
    });
    if (!partner) {
      throw new BadRequestException(`Partner #${dto.partner_id} not found`);
    }

    const existing = await this.tpiRepository.findOne({
      where: { tenant_id: dto.tenant_id, partner_id: dto.partner_id },
    });
    if (existing) {
      throw new BadRequestException(
        'This partner integration already exists for the tenant',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const record = queryRunner.manager.create(TenantPartnerIntegration, {
        tenant_id: dto.tenant_id,
        partner_id: dto.partner_id,
        is_enabled: 0,
        configuration: dto.configuration ?? null,
        created_by: user.id,
        updated_by: user.id,
      });

      const saved = await queryRunner.manager.save(record);
      await queryRunner.commitTransaction();

      return this.tpiRepository.findOne({ where: { id: saved.id } });
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async update(
    id: number,
    dto: UpdateTenantIntegrationDto,
    userUuid: string,
  ): Promise<TenantPartnerIntegration> {
    const user = await this.userRepository.findOne({
      where: { uuid: userUuid },
    });
    if (!user) {
      throw new BadRequestException('User not found against user-token');
    }

    const record = await this.tpiRepository.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Tenant integration #${id} not found`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.update(
        TenantPartnerIntegration,
        { id },
        {
          ...(dto.is_enabled !== undefined && { is_enabled: dto.is_enabled }),
          ...(dto.configuration !== undefined && {
            configuration: dto.configuration,
          }),
          updated_by: user.id,
        },
      );

      await queryRunner.commitTransaction();
      return this.tpiRepository.findOne({ where: { id } });
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: number, userUuid: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { uuid: userUuid },
    });
    if (!user) {
      throw new BadRequestException('User not found against user-token');
    }

    const record = await this.tpiRepository.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Tenant integration #${id} not found`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.delete(TenantPartnerIntegration, { id });
      await queryRunner.commitTransaction();
      return { message: 'Tenant integration removed successfully' };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
