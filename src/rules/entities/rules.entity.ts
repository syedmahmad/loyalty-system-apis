import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { RuleTarget } from './rule-target.entity';

@Entity({ name: 'rules' })
export class Rule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  rule_type: string; // 'event based earn' or 'spend and earn' or 'burn'

  @Column({ type: 'varchar', nullable: true })
  condition_type: string;

  @Column({ type: 'varchar', nullable: true })
  condition_operator: string;

  @Column({ type: 'varchar', nullable: true })
  condition_value: string;

  @Column({ type: 'float', nullable: true })
  min_amount_spent: number;

  @Column({ type: 'float', nullable: true })
  reward_points: number;

  @Column({ type: 'varchar', nullable: true })
  event_triggerer: string;

  @Column({ type: 'int', nullable: true })
  max_redeemption_points_limit: number;

  @Column({ type: 'float', nullable: true })
  points_conversion_factor: number; // for burn

  @Column({ type: 'float', nullable: true })
  max_burn_percent_on_invoice: number; // for burn

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: 0 })
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @Column({ default: 0 })
  updated_by: number;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => RuleTarget, (ruleTarget) => ruleTarget.rule, {
    cascade: true,
  })
  targets: RuleTarget[];
}
