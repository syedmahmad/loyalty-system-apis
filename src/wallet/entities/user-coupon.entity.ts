import { Customer } from 'src/customers/entities/customer.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

export enum CouponStatus {
  ISSUED = 'issued',
  USED = 'used',
  EXPIRED = 'expired',
}

@Entity()
export class UserCoupon {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Customer, { eager: true })
  customer: Customer;

  @ManyToOne(() => BusinessUnit, { eager: true })
  @JoinColumn({ name: 'business_unit_id' })
  business_unit: BusinessUnit;

  @Column()
  coupon_code: string;

  @Column({ type: 'enum', enum: CouponStatus })
  status: CouponStatus;

  @Column()
  issued_from_type: string;

  @Column({ nullable: true })
  issued_from_id: number;

  @Column({ type: 'timestamp', nullable: true })
  redeemed_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  expires_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
