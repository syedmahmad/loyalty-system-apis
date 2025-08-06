// customer.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class CustomerActivity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  customer_uuid: string;

  @Column({ nullable: true })
  campaign_uuid: string;

  @Column({ nullable: true })
  coupon_uuid: string;

  @Column({ nullable: true })
  rule_id: number;

  @Column({ nullable: true })
  rule_name: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  amount: number;

  @Column()
  activity_type: string; // e.g. 'rule', 'campaign', 'coupon'

  @Column({ type: 'json', nullable: true })
  meta: Record<string, any>;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
