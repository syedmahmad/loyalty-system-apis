import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from './entities/campaign.entity';
import { CampaignRule } from './entities/campaign-rule.entity';
import { CampaignTier } from './entities/campaign-tier.entity';
import { CampaignCoupons } from './entities/campaign-coupon.entity';
import { Rule } from '../rules/entities/rules.entity';
import { Tier } from '../tiers/entities/tier.entity';
import { CampaignsController } from './campaigns/campaigns.controller';
import { CampaignsService } from './campaigns/campaigns.service';
import { User } from 'src/users/entities/user.entity';
import { Coupon } from '../coupons/entities/coupon.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { CampaignCustomerSegment } from './entities/campaign-customer-segments.entity';
import { CustomerSegment } from 'src/customer-segment/entities/customer-segment.entity';
import { Customer } from 'src/customers/entities/customer.entity';
import { TiersService } from 'src/tiers/tiers/tiers.service';
import { CustomerSegmentMember } from 'src/customer-segment/entities/customer-segment-member.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import { WalletTransaction } from 'src/wallet/entities/wallet-transaction.entity';
import { WalletSettings } from 'src/wallet/entities/wallet-settings.entity';
import { UserCoupon } from 'src/wallet/entities/user-coupon.entity';
import { WalletOrder } from 'src/wallet/entities/wallet-order.entity';
import { OciService } from 'src/oci/oci.service';
import { OpenaiModule } from 'src/openai/openai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Campaign,
      CampaignRule,
      CampaignTier,
      Rule,
      Tier,
      User,
      Coupon,
      CampaignCoupons,
      CampaignCustomerSegment,
      CustomerSegment,
      Tenant,
      BusinessUnit,
      Customer,
      CustomerSegmentMember,
      Wallet,
      WalletTransaction,
      WalletSettings,
      UserCoupon,
      WalletOrder,
    ]),
    OpenaiModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, TiersService, WalletService, OciService],
})
export class CampaignModule {}
