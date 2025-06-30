import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Campaign } from './campaign.entity';
import { Rule } from 'src/rules/entities/rules.entity';

@Entity('campaign_rules')
export class CampaignRule {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Campaign, (campaign) => campaign.rules, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @ManyToOne(() => Rule, { eager: true })
  @JoinColumn({ name: 'rule_id' })
  rule: Rule;
}
