import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum CronStatus {
  STARTED = 'started',
  SUCCESS = 'success',
  FAILED = 'failed',
  PARTIAL_SUCCESS = 'partial_success',
}

@Entity('resty_cron_logs')
export class RestyCronLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: CronStatus,
    default: CronStatus.STARTED,
  })
  status: CronStatus;

  @Column({ type: 'int', default: 0 })
  total_raw_records: number;

  @Column({ type: 'int', default: 0 })
  total_unique_invoices: number;

  @Column({ type: 'int', default: 0 })
  processed_invoices: number;

  @Column({ type: 'int', default: 0 })
  failed_invoices: number;

  @Column({ type: 'int', default: 0 })
  skipped_invoices: number;

  @Column({ type: 'int', default: 0 })
  new_customers_created: number;

  @Column({ type: 'int', default: 0 })
  existing_customers: number;

  @Column({ type: 'int', default: 0 })
  transactions_created: number;

  @Column({ type: 'int', default: 0 })
  notifications_sent: number;

  @Column({ type: 'int', default: 0 })
  notifications_failed: number;

  @Column({ type: 'datetime', nullable: true })
  started_at: Date;

  @Column({ type: 'datetime', nullable: true })
  completed_at: Date;

  @Column({ type: 'int', nullable: true })
  duration_seconds: number;

  @Column({ type: 'text', nullable: true })
  error_message: string;

  @Column({ type: 'json', nullable: true })
  error_details: any;

  @Column({ type: 'json', nullable: true })
  failed_invoice_ids: string[];

  @Column({ type: 'varchar', length: 50, nullable: true })
  last_synced_timestamp: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
