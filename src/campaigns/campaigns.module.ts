import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from './entities/campaign.entity';
import { CampaignRule } from './entities/campaign-rule.entity';
import { CampaignTier } from './entities/campaign-tier.entity';
import { Rule } from '../rules/entities/rules.entity';
import { Tier } from '../tiers/entities/tier.entity';
import { CampaignsController } from './campaigns/campaigns.controller';
import { CampaignsService } from './campaigns/campaigns.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Campaign,
      CampaignRule,
      CampaignTier,
      Rule,
      Tier,
    ]),
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignModule {}
