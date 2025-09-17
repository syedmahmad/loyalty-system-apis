import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Column,
} from 'typeorm';
import { Tier } from 'src/tiers/entities/tier.entity';
import { Rule } from './rules.entity';

@Entity('rule_tiers')
export class RuleTier {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Rule, (rule) => rule.tiers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'rule_id' })
  rule: Rule;

  @Column({ type: 'float', default: 1 })
  point_conversion_rate: number;

  @ManyToOne(() => Tier, { eager: true })
  @JoinColumn({ name: 'tier_id' })
  tier: Tier;
}
