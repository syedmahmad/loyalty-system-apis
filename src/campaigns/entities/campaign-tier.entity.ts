import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Campaign } from './campaign.entity';
import { Tier } from 'src/tiers/entities/tier.entity';

@Entity('campaign_tiers')
export class CampaignTier {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Campaign, (campaign) => campaign.tiers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @ManyToOne(() => Tier, { eager: true })
  @JoinColumn({ name: 'tier_id' })
  tier: Tier;
}
