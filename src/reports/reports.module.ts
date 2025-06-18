import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports/reports.service';
import { ReportsController } from './reports/reports.controller';
import { Point } from '../points/entities/point.entity';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { Reward } from '../rewards/entities/reward.entity';
import { Tier } from '../tiers/entities/tier.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Point, Campaign, Reward, Tier])],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
