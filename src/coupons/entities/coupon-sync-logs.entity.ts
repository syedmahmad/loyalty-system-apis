import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('coupon_sync_logs')
export class CouponSyncLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: string;

  @Column({ type: 'int', default: 0 })
  total_count: number;

  @Column({ type: 'int', default: 0 })
  success_count: number;

  @Column({ type: 'int', default: 0 })
  failed_count: number;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  // store list of coupon that succeeded
  @Column({ type: 'simple-json', nullable: true })
  success_coupons: string[];

  // store list of coupon that failed
  @Column({ type: 'simple-json', nullable: true })
  failed_coupons: string[];
}
