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
import { CouponTypeService } from 'src/coupon_type/coupon_type/coupon_type.service';
import { CouponType } from 'src/coupon_type/entities/coupon_type.entity';
import { Customer } from 'src/customers/entities/customer.entity';
import { TiersService } from 'src/tiers/tiers/tiers.service';
import { Tier } from 'src/tiers/entities/tier.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { CustomerActivity } from 'src/customers/entities/customer-activity.entity';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import { WalletTransaction } from 'src/wallet/entities/wallet-transaction.entity';
import { WalletSettings } from 'src/wallet/entities/wallet-settings.entity';
import { UserCoupon } from 'src/wallet/entities/user-coupon.entity';
import { WalletOrder } from 'src/wallet/entities/wallet-order.entity';
import { CustomerService } from 'src/customers/customer.service';
import { OciService } from 'src/oci/oci.service';
import { QrCode } from 'src/qr_codes/entities/qr_code.entity';
import { QrcodesService } from 'src/qr_codes/qr_codes/qr_codes.service';
import { Rule } from 'src/rules/entities/rules.entity';
import { CampaignsService } from 'src/campaigns/campaigns/campaigns.service';
import { CampaignCustomerSegment } from 'src/campaigns/entities/campaign-customer-segments.entity';
import { CampaignRule } from 'src/campaigns/entities/campaign-rule.entity';
import { CampaignCoupons } from 'src/campaigns/entities/campaign-coupon.entity';
import { CustomerSegmentMember } from 'src/customer-segment/entities/customer-segment-member.entity';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { CampaignTier } from 'src/campaigns/entities/campaign-tier.entity';
import { CustomerCoupon } from 'src/customers/entities/customer-coupon.entity';

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
      CouponType,
      Customer,
      Tier,
      Wallet,
      CustomerActivity,
      WalletTransaction,
      WalletSettings,
      UserCoupon,
      WalletOrder,
      QrCode,
      Rule,
      CampaignCustomerSegment,
      CampaignRule,
      CampaignCoupons,
      CustomerSegmentMember,
      Campaign,
      CampaignTier,
      CustomerCoupon,
    ]),
  ],
  controllers: [CouponsController],
  providers: [
    CouponsService,
    CouponTypeService,
    TiersService,
    WalletService,
    CustomerService,
    OciService,
    QrcodesService,
    CampaignsService,
  ],
})
export class CouponsModule {}
