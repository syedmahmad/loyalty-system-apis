import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Wallet } from './wallet.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';

export enum WalletTransactionType {
  EARN = 'earn',
  BURN = 'burn',
  EXPIRE = 'expire',
  ADJUSTMENT = 'adjustment',
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
  source_id: number;

  @Column({ nullable: true })
  transaction_reference: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  created_by: number;

  @CreateDateColumn()
  created_at: Date;
}
