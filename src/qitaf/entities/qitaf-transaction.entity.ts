import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export type QitafTransactionType =
  | 'otp'
  | 'redeem'
  | 'reverse'
  | 'earn'
  | 'earn_incentive'
  | 'update'
  | 'status';

export type QitafTransactionStatus = 'success' | 'failed' | 'auto_reversed';

@Entity('qitaf_transactions')
@Index('idx_qt_msisdn_tenant', ['msisdn', 'tenant_id'])
@Index('idx_qt_global_id', ['global_id'])
@Index('idx_qt_tenant_partner', ['tenant_id', 'partner_id'])
export class QitafTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, default: () => `'${uuidv4()}'` })
  uuid: string;

  @Column()
  tenant_id: number;

  @Column()
  partner_id: number;

  /** Saudi mobile number as provided by POS (e.g. 544696960) — used to link to customer */
  @Column({ type: 'bigint' })
  msisdn: number;

  @Column({
    type: 'enum',
    enum: ['otp', 'redeem', 'reverse', 'earn', 'earn_incentive', 'update', 'status'],
  })
  transaction_type: QitafTransactionType;

  /** UUID sent to STC as the transaction identifier */
  @Column({ type: 'varchar', length: 36, nullable: true })
  global_id: string;

  /** Reference to original transaction (used by reverse / update / status) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  ref_request_id: string;

  /** RequestDate of the referenced original transaction */
  @Column({ type: 'varchar', length: 30, nullable: true })
  ref_request_date: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  branch_id: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  terminal_id: string;

  /** SAR amount (earn/redeem/update transactions) */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amount: number;

  /** ERP invoice / order reference — set when transaction originates from checkout flow */
  @Column({ type: 'varchar', length: 255, nullable: true })
  invoice_id: string;

  /** Cashier ID — only for earn_incentive transactions */
  @Column({ type: 'varchar', length: 100, nullable: true })
  cashier_id: string;

  /** SAR amount being reduced — only for update transactions */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  reduction_amount: number;

  /** Points awarded or deducted — extracted from STC response when available */
  @Column({ type: 'int', nullable: true })
  points: number;

  @Column({
    type: 'enum',
    enum: ['success', 'failed', 'auto_reversed'],
    default: 'success',
  })
  status: QitafTransactionStatus;

  /** Full STC response body on success */
  @Column({ type: 'json', nullable: true })
  stc_response: Record<string, any>;

  /** STC error body or internal error on failure */
  @Column({ type: 'json', nullable: true })
  stc_error: Record<string, any>;

  /** KSA timestamp sent to STC in the request */
  @Column({ type: 'varchar', length: 30, nullable: true })
  request_date: string;

  @CreateDateColumn()
  created_at: Date;
}
