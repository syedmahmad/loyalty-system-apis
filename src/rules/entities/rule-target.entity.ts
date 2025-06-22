import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Rule } from './rules.entity';

@Entity({ name: 'rule_targets' })
export class RuleTarget {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Rule, (rule) => rule.targets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rule_id' })
  rule: Rule;

  @Column()
  rule_id: number;

  @Column({ type: 'varchar' })
  target_type: 'tier' | 'campaign'; // Type of target (for soft reference)

  @Column()
  target_id: number; // ID of the tier or campaign

  @Column({ default: 0 })
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @Column({ default: 0 })
  updated_by: number;

  @UpdateDateColumn()
  updated_at: Date;
}
