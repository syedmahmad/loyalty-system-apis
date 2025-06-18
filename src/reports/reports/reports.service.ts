import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Point } from 'src/points/entities/point.entity';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { Reward } from 'src/rewards/entities/reward.entity';
import { Tier } from 'src/tiers/entities/tier.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Point)
    private pointsRepository: Repository<Point>,

    @InjectRepository(Campaign)
    private campaignsRepository: Repository<Campaign>,

    @InjectRepository(Reward)
    private rewardsRepository: Repository<Reward>,

    @InjectRepository(Tier)
    private tiersRepository: Repository<Tier>,
  ) {}

  async getPointsSummary(tenantId: number) {
    const totalPoints = await this.pointsRepository
      .createQueryBuilder('point')
      .select('SUM(point.points)', 'total')
      .where('point.tenantId = :tenantId', { tenantId })
      .getRawOne();

    return { totalPoints: Number(totalPoints.total) || 0 };
  }

  async getCampaignPerformance(tenantId: number) {
    const campaigns = await this.campaignsRepository.find({ where: { tenantId } });
    // Example: count of campaigns and dummy participation count (expand as per your schema)
    return {
      campaignCount: campaigns.length,
      // You can add more complex stats here if you have participation data
    };
  }

  async getTierDistribution(tenantId: number) {
    const tiers = await this.tiersRepository.find({ where: { tenantId } });

    // Example: return tiers with user counts (assuming you have user-tier mapping)
    // For demo, just return tiers as-is
    return tiers;
  }

  async getRewardRedemptions(tenantId: number) {
    const rewards = await this.rewardsRepository.find({ where: { tenantId } });
    // Extend with redemption stats if you track redemptions
    return rewards;
  }
}
