import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CouponTypeService } from './coupon_type/coupon_type.service';
import { CouponTypeController } from './coupon_type/coupon_type.controller';
import { CouponType } from './entities/coupon_type.entity';
import { RuleTarget } from 'src/rules/entities/rule-target.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { CouponTypeBootstrapService } from './startup/coupon-type-bootstrap.service';
import { Tenant } from 'src/tenants/entities/tenant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CouponType, RuleTarget, BusinessUnit, Tenant]),
  ],
  controllers: [CouponTypeController],
  providers: [CouponTypeService, CouponTypeBootstrapService],
})
export class CouponTypeModule {}
