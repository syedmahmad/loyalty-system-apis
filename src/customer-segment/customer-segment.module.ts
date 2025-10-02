import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerSegment } from './entities/customer-segment.entity';
import { User } from 'src/users/entities/user.entity';
import { Customer } from 'src/customers/entities/customer.entity';
import { CustomerSegmentsController } from './customer-segment/customer-segment.controller';
import { CustomerSegmentsService } from './customer-segment/customer-segment.service';
import { CustomerSegmentMember } from './entities/customer-segment-member.entity';
import { QrCode } from 'src/qr_codes/entities/qr_code.entity';
import { OciService } from 'src/oci/oci.service';
import { CustomerService } from 'src/customers/customer.service';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import { QrcodesService } from 'src/qr_codes/qr_codes/qr_codes.service';
import { TiersService } from 'src/tiers/tiers/tiers.service';
import { Rule } from 'src/rules/entities/rules.entity';
import { WalletTransaction } from 'src/wallet/entities/wallet-transaction.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { WalletOrder } from 'src/wallet/entities/wallet-order.entity';
import { WalletSettings } from 'src/wallet/entities/wallet-settings.entity';
import { CampaignCustomerSegment } from 'src/campaigns/entities/campaign-customer-segments.entity';
import { CampaignRule } from 'src/campaigns/entities/campaign-rule.entity';
import { CustomerActivity } from 'src/customers/entities/customer-activity.entity';
import { CampaignCoupons } from 'src/campaigns/entities/campaign-coupon.entity';
import { CouponTypeService } from 'src/coupon_type/coupon_type/coupon_type.service';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { Coupon } from 'src/coupons/entities/coupon.entity';
import { UserCoupon } from 'src/wallet/entities/user-coupon.entity';
import { Tier } from 'src/tiers/entities/tier.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { CouponType } from 'src/coupon_type/entities/coupon_type.entity';
import { NotificationModule } from 'src/petromin-it/notification/notification.module';
import { OpenaiModule } from 'src/openai/openai.module';
import { CustomerPreference } from 'src/petromin-it/preferences/entities/customer-preference.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerSegment,
      CustomerSegmentMember,
      Customer,
      User,
      QrCode,
      Rule,
      WalletTransaction,
      Wallet,
      WalletOrder,
      WalletSettings,
      CampaignCustomerSegment,
      CampaignRule,
      CustomerActivity,
      CampaignCoupons,
      Campaign,
      Coupon,
      UserCoupon,
      Tier,
      BusinessUnit,
      Tenant,
      CouponType,
      CustomerPreference,
    ]),
    NotificationModule,
    OpenaiModule,
  ],
  controllers: [CustomerSegmentsController],
  providers: [
    CustomerSegmentsService,
    OciService,
    CustomerService,
    WalletService,
    QrcodesService,
    TiersService,
    CouponTypeService,
  ],
})
export class CustomerSegmentsModule {}
