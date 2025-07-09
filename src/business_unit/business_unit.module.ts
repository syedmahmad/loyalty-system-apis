import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessUnit } from './entities/business_unit.entity';
import { BusinessUnitsController } from './business_unit/business_unit.controller';
import { BusinessUnitsService } from './business_unit/business_unit.service';
import { BusinessUnitBootstrapService } from './startup/business-unit-bootstrap.service';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { User } from 'src/users/entities/user.entity';
import { BusinessUnitMiddleware } from './middleware/business_unit.middleware';

@Module({
  imports: [TypeOrmModule.forFeature([BusinessUnit, Tenant, User])],
  controllers: [BusinessUnitsController],
  providers: [
    BusinessUnitsService,
    BusinessUnitBootstrapService,
    BusinessUnitMiddleware,
  ],
})
export class BusinessUnitsModule {}
