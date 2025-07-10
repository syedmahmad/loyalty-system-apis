// business-units/startup/business-unit-bootstrap.service.ts
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessUnit } from '../entities/business_unit.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class BusinessUnitBootstrapService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(BusinessUnit)
    private readonly businessUnitRepo: Repository<BusinessUnit>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async onApplicationBootstrap() {
    const defaultBUName = 'All Business Unit';

    // 1. Backfill UUIDs for existing business units (if missing)
    const unitsWithoutUuid = await this.businessUnitRepo.find({
      where: [{ uuid: null }, { uuid: '' }],
    });

    if (unitsWithoutUuid.length > 0) {
      for (const unit of unitsWithoutUuid) {
        unit.uuid = uuidv4();
        await this.businessUnitRepo.save(unit);
      }
      console.log(
        `✅ Added UUIDs to ${unitsWithoutUuid.length} business units`,
      );
    }

    // 2. Create default BU if it doesn't exist
    const existing = await this.businessUnitRepo.findOneBy({
      name: defaultBUName,
    });

    if (!existing) {
      const tenant = await this.tenantRepo.create({
        name: 'NATC',
        currency: 'SAR',
        domain: 'https://petromin.com/',
        created_by: 1,
        updated_by: 1,
      });

      await this.tenantRepo.save(tenant);

      const existingTenant = await this.tenantRepo.find();

      const defaultUnit = this.businessUnitRepo.create({
        tenant_id: existingTenant[0].id,
        name: defaultBUName,
        description: 'this is default you can not delete it',
        location: 'system created',
      });

      await this.businessUnitRepo.save(defaultUnit);
      console.log('✅ Default Business Unit created');
    } else {
      console.log('ℹ️ Default Business Unit already exists');
    }
  }
}
