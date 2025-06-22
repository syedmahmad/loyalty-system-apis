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
  type: 'earn' | 'redeem' | 'condition' | 'downgrade';

  @Column({ type: 'varchar' })
  condition_type: string; // e.g. total_spending, visit_count

  @Column({ type: 'varchar' })
  operator: string; // e.g. '=', '>=', '<='

  @Column({ type: 'float' })
  value: number;

  @Column({ type: 'float', nullable: true })
  reward_value: number;

  @Column({ type: 'varchar', nullable: true })
  unit_type: string; // points, cashback, coupon

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
