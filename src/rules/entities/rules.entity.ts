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
  rule_type: string; // 'earn' or 'burn'

  @Column({ type: 'float', nullable: true })
  min_transaction_amount: number;

  @Column({ type: 'int', nullable: true })
  max_points_limit: number;

  @Column({ type: 'float', nullable: true })
  earn_conversion_factor: number; // for earn

  @Column({ type: 'float', nullable: true })
  burn_factor: number; // for burn

  @Column({ type: 'float', nullable: true })
  max_burn_percent: number; // for burn

  @Column({ type: 'int', nullable: true })
  min_points_to_burn: number; // for burn

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
