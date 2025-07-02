import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CouponsService } from './coupons/coupons.service';
import { CouponsController } from './coupons/coupons.controller';
import { Coupon } from './entities/coupon.entity';
import { RuleTarget } from 'src/rules/entities/rule-target.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Coupon, RuleTarget, BusinessUnit])],
  controllers: [CouponsController],
  providers: [CouponsService],
})
export class CouponsModule {}
