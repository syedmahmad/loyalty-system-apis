import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CampaignsService } from './campaigns/campaigns.service';
import { CampaignsController } from './campaigns/campaigns.controller';
import { Campaign } from './entities/campaign.entity';
import { RuleTarget } from 'src/rules/entities/rule-target.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Campaign, RuleTarget])],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
