import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { OciService } from 'src/oci/oci.service';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { User } from 'src/users/entities/user.entity';
import { OffersEntity } from './entities/offers.entity';
import { OffersController } from './offers/offers.controller';
import { OffersService } from './offers/offers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OffersEntity, BusinessUnit, Tenant, User]),
  ],
  controllers: [OffersController],
  providers: [OffersService, OciService],
  exports: [OffersService],
})
export class OffersModule {}
