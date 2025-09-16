import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Coupon } from './coupon.entity';
import { Customer } from 'src/customers/entities/customer.entity';

@Entity('coupon_usages')
export class CouponUsage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  invoice_no: string;

  @Column({ type: 'timestamp', nullable: true })
  used_at: Date;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @Column()
  coupon_id: number;

  @ManyToOne(() => Coupon, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'coupon_id' })
  coupon: Coupon;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;
}
