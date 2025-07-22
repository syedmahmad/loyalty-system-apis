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
      Tenant,
      BusinessUnit,
    ]),
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignModule {}
