import { TransactionSyncLog } from 'src/petromin-it/resty/entities/transaction-sync-logs.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Generated,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('resty_invoices_info')
export class RestyInvoicesInfo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true, nullable: true })
  @Generated('uuid')
  uuid: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  customer_id: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  invoice_no: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  invoice_id: string | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  invoice_amount: number | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  invoice_date: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  vehicle_plate_number: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  vehicle_vin: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  vehicle_info: string | null;

  @Column({ type: 'boolean', nullable: true, default: false })
  is_claimed: boolean | null;

  @Column('int', { nullable: true })
  clamined_points: number | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  claim_id: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  claim_date: string | null;

  @Column({ type: 'json', nullable: true })
  free_items: any | null;

  @CreateDateColumn({ nullable: true })
  created_at: Date | null;

  @UpdateDateColumn({ nullable: true })
  updated_at: Date | null;

  @ManyToOne(() => TransactionSyncLog, (log) => log.invoices)
  @JoinColumn({ name: 'sync_log_id' })
  syncLog: TransactionSyncLog;

  @Column({ type: 'int', nullable: true })
  sync_log_id: number | null;
}
