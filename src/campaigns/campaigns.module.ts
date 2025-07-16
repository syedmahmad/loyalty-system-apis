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
    ]),
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignModule {}
