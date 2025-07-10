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
    await this.backfillMissingUUIDs(); // ✅ First step
    await this.ensureDefaultBusinessUnit(); // ✅ Then normal logic
  }

  private async backfillMissingUUIDs() {
    const units = await this.businessUnitRepo.find({
      where: [{ uuid: null }, { uuid: '' }],
    });

    if (units.length) {
      for (const unit of units) {
        unit.uuid = uuidv4();
        await this.businessUnitRepo.save(unit);
      }
      console.log(`✅ UUIDs added to ${units.length} business units`);
    } else {
      console.log('ℹ️ All business units already have UUIDs');
    }
  }

  private async ensureDefaultBusinessUnit() {
    const defaultBUName = 'All Business Unit';

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

      const defaultUnit = this.businessUnitRepo.create({
        tenant_id: tenant.id,
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
