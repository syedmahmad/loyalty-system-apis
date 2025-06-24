import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessUnit } from './entities/business_unit.entity';
import { BusinessUnitsController } from './business_unit/business_unit.controller';
import { BusinessUnitsService } from './business_unit/business_unit.service';
import { BusinessUnitBootstrapService } from './startup/business-unit-bootstrap.service';

@Module({
  imports: [TypeOrmModule.forFeature([BusinessUnit])],
  controllers: [BusinessUnitsController],
  providers: [BusinessUnitsService, BusinessUnitBootstrapService],
})
export class BusinessUnitsModule {}
