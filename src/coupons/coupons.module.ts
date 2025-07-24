import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CouponsService } from './coupons/coupons.service';
import { CouponsController } from './coupons/coupons.controller';
import { Coupon } from './entities/coupon.entity';
import { RuleTarget } from 'src/rules/entities/rule-target.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { User } from 'src/users/entities/user.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { CouponCustomerSegment } from './entities/coupon-customer-segments.entity';
import { CustomerSegment } from 'src/customer-segment/entities/customer-segment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Coupon,
      CouponCustomerSegment,
      CustomerSegment,
      RuleTarget,
      BusinessUnit,
      User,
      Tenant,
    ]),
  ],
  controllers: [CouponsController],
  providers: [CouponsService],
})
export class CouponsModule {}
