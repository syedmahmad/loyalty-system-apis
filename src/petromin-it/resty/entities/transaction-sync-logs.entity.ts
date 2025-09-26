import { RestyInvoicesInfo } from 'src/petromin-it/resty/entities/resty_invoices_info.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';

@Entity('transactions_sync_logs')
export class TransactionSyncLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @CreateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @Column({ type: 'json', nullable: true })
  request_body: any;

  @Column({ type: 'json', nullable: true })
  response_body: any;

  @OneToMany(() => RestyInvoicesInfo, (invoice) => invoice.syncLog)
  invoices: RestyInvoicesInfo[];
}
