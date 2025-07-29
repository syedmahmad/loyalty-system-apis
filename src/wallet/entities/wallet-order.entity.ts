import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Wallet } from './wallet.entity';

@Entity()
export class WalletOrder {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @ManyToOne(() => BusinessUnit)
  @JoinColumn({ name: 'business_unit_id' })
  business_unit: BusinessUnit;

  @Column({ nullable: true })
  order_id: string;

  @Column({ type: 'decimal' })
  amount: number;

  @Column({ type: 'decimal' })
  subtotal: number;

  @Column({ type: 'decimal' })
  discount: number;

  @Column({ nullable: true })
  items_count: number;

  @Column({ type: 'simple-json', nullable: true })
  items: string;

  @Column({ nullable: true })
  status: string;

  @Column({ nullable: true })
  customer_remarks: string;

  @Column({ nullable: true })
  payment_method: string;

  @Column({ nullable: true })
  category: string;

  @Column({ type: 'date', nullable: true })
  delivery_date: Date;

  @Column({ type: 'date', nullable: true })
  order_date: Date;
}
