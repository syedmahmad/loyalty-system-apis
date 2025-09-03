import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';
import { Customer } from 'src/customers/entities/customer.entity';
import { User } from 'src/users/entities/user.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { BusinessUnitMiddleware } from 'src/business_unit/middleware/business_unit.middleware';
import { WalletModule } from 'src/wallet/wallet.module';
import { OciModule } from 'src/oci/oci.module';
import { QrCode } from 'src/qr_codes/entities/qr_code.entity';
import { QrcodesService } from '../qr_codes/qr_codes/qr_codes.service';
import { CustomerActivity } from 'src/customers/entities/customer-activity.entity';
import { Tier } from 'src/tiers/entities/tier.entity';
import { TiersService } from 'src/tiers/tiers/tiers.service';
import { RuleTarget } from 'src/rules/entities/rule-target.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { Rule } from 'src/rules/entities/rules.entity';
import { WalletTransaction } from 'src/wallet/entities/wallet-transaction.entity';
import { CampaignsService } from 'src/campaigns/campaigns/campaigns.service';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { CampaignRule } from 'src/campaigns/entities/campaign-rule.entity';
import { CampaignTier } from 'src/campaigns/entities/campaign-tier.entity';
import { CampaignCoupons } from 'src/campaigns/entities/campaign-coupon.entity';
import { CampaignCustomerSegment } from 'src/campaigns/entities/campaign-customer-segments.entity';
import { CustomerSegment } from 'src/customer-segment/entities/customer-segment.entity';
import { Coupon } from 'src/coupons/entities/coupon.entity';
import { CouponTypeService } from 'src/coupon_type/coupon_type/coupon_type.service';
import { CouponType } from 'src/coupon_type/entities/coupon_type.entity';
import { CustomerSegmentMember } from 'src/customer-segment/entities/customer-segment-member.entity';
import { UserCoupon } from 'src/wallet/entities/user-coupon.entity';
import { WalletSettings } from 'src/wallet/entities/wallet-settings.entity';
import { WalletOrder } from 'src/wallet/entities/wallet-order.entity';
import { CustomerBootstrapService } from './startup/customer-bootstrap.service';
import { CustomerCoupon } from './entities/customer-coupon.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      User,
      BusinessUnit,
      QrCode,
      CustomerActivity,
      Tier,
      WalletSettings,
      WalletOrder,
      RuleTarget,
      Wallet,
      Tenant,
      Rule,
      WalletTransaction,
      Campaign,
      CampaignRule,
      CampaignTier,
      CampaignCoupons,
      CampaignCustomerSegment,
      CustomerSegment,
      Coupon,
      CouponType,
      CustomerSegmentMember,
      UserCoupon,
      CustomerCoupon,
    ]),
    WalletModule,
    OciModule,
  ],
  controllers: [CustomerController],
  providers: [
    CustomerService,
    BusinessUnitMiddleware,
    QrcodesService,
    TiersService,
    CampaignsService,
    CouponTypeService,
    CustomerBootstrapService,
  ],
  exports: [CustomerService],
})
export class CustomerModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(BusinessUnitMiddleware).forRoutes(
      {
        path: 'customers',
        method: RequestMethod.POST,
      },
      { path: 'customers/single/:uuid', method: RequestMethod.GET },
    );
  }
}
