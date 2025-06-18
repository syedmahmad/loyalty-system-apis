import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../entities/tenant.entity';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import { UpdateTenantDto } from '../dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private tenantsRepository: Repository<Tenant>,
  ) {}

  async create(dto: CreateTenantDto) {
    const tenant = this.tenantsRepository.create(dto);
    return await this.tenantsRepository.save(tenant);
  }

  async findAll() {
    return await this.tenantsRepository.find();
  }

  async findOne(id: number) {
    const tenant = await this.tenantsRepository.findOneBy({ id });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async findByDomain(domain: string) {
    const tenant = await this.tenantsRepository.findOneBy({ domain });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async update(id: number, dto: UpdateTenantDto) {
    const tenant = await this.findOne(id);
    Object.assign(tenant, dto);
    return await this.tenantsRepository.save(tenant);
  }

  async remove(id: number) {
    const tenant = await this.findOne(id);
    await this.tenantsRepository.remove(tenant);
  }
}
