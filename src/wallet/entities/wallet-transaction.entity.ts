import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Wallet } from './wallet.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { WalletOrder } from './wallet-order.entity';
import { Customer } from 'src/customers/entities/customer.entity';

export enum WalletTransactionType {
  EARN = 'earn',
  BURN = 'burn',
  EXPIRE = 'expire',
  ADJUSTMENT = 'adjustment',
  ORDER = 'order',
}

export enum WalletTransactionStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  EXPIRED = 'expired',
}

@Entity()
export class WalletTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  external_system_id: number;

  @ManyToOne(() => WalletOrder)
  @JoinColumn({ name: 'wallet_order_id' })
  orders?: WalletOrder;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @ManyToOne(() => BusinessUnit)
  @JoinColumn({ name: 'business_unit_id' })
  business_unit: BusinessUnit;

  @Column({ type: 'enum', enum: WalletTransactionType })
  type: WalletTransactionType;

  @Column({ type: 'enum', enum: WalletTransactionStatus })
  status: WalletTransactionStatus;

  @Column({ type: 'decimal' })
  amount: number;

  @Column({ type: 'date', nullable: true })
  unlock_date: Date;

  @Column({ type: 'date', nullable: true })
  expiry_date: Date;

  @Column({ nullable: true })
  source_type: string;

  @Column({ nullable: true })
  point_balance: number;

  @Column({ nullable: true })
  source_id: number;

  @Column({ nullable: true })
  transaction_reference: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  created_by: number;

  @Column({ type: 'int', nullable: true })
  is_expired: number; // 0 means not expired 1 means expired

  @CreateDateColumn()
  expires_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  /** -------- Newly added fields for migration -------- */

  // Maps to third-party `uuid`
  @Column({ type: 'char', length: 36, nullable: true, unique: true })
  external_uuid: string;

  // To capture mapping with loyalty/transaction_program_id
  @Column({ type: 'varchar', nullable: true })
  external_program_type: string;

  // To capture mapping with loyalty/transaction_program_id
  @Column({ type: 'int', nullable: true })
  external_program_id: number;

  // For duplicate handling (maps to duplicate_sequence)
  @Column({ type: 'int', default: 0 })
  duplicate_sequence: number;

  // For invoice mapping (maps to invoice_id or invoice_no)
  @Column({ type: 'varchar', length: 255, nullable: true })
  invoice_id: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  invoice_no: string;

  // Optional: to map reference_id from loyalty records
  @Column({ type: 'int', nullable: true })
  reference_id: number;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;
}
