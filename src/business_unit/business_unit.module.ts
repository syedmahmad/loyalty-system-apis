import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessUnit } from './entities/business_unit.entity';
import { BusinessUnitsController } from './business_unit/business_unit.controller';
import { BusinessUnitsService } from './business_unit/business_unit.service';
import { BusinessUnitBootstrapService } from './startup/business-unit-bootstrap.service';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { User } from 'src/users/entities/user.entity';
import { BusinessUnitMiddleware } from './middleware/business_unit.middleware';
import { LoyaltyProgramsController } from './business_unit/loyalty-programs.controller';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { Customer } from 'src/customers/entities/customer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BusinessUnit, Tenant, User, Wallet, Customer])],
  controllers: [BusinessUnitsController, LoyaltyProgramsController],
  providers: [
    BusinessUnitsService,
    BusinessUnitBootstrapService,
    BusinessUnitMiddleware,
  ],
})
export class BusinessUnitsModule {}
