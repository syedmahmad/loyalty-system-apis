// business-units/startup/business-unit-bootstrap.service.ts
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessUnit } from '../entities/business_unit.entity';

@Injectable()
export class BusinessUnitBootstrapService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(BusinessUnit)
    private readonly businessUnitRepo: Repository<BusinessUnit>,
  ) {}

  async onApplicationBootstrap() {
    const defaultBUName = 'Default All Business Unit';

    const existing = await this.businessUnitRepo.findOneBy({
      name: defaultBUName,
    });

    if (!existing) {
      const defaultUnit = this.businessUnitRepo.create({
        tenant_id: 1,
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
