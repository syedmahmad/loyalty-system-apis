import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CouponTypeService } from './coupon_type/coupon_type.service';
import { CouponTypeController } from './coupon_type/coupon_type.controller';
import { CouponType } from './entities/coupon_type.entity';
import { RuleTarget } from 'src/rules/entities/rule-target.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CouponType, RuleTarget, BusinessUnit])],
  controllers: [CouponTypeController],
  providers: [CouponTypeService],
})
export class CouponTypeModule {}
