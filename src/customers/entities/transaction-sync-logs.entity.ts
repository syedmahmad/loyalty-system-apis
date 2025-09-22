import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('transactions_sync_logs')
export class TransactionSyncLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: string;

  @Column({ type: 'int', default: 0 })
  total_customer_count: number;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  // store list of coupon that succeeded
  @Column({ type: 'simple-json', nullable: true })
  request_body: string[];
}
