import { Customer } from 'src/customers/entities/customer.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

export enum CouponStatus {
  ISSUED = 'issued',
  USED = 'used',
  EXPIRED = 'expired',
}

@Entity()
@Index('idx_user_coupon_coupon_id', ['coupon_id'])
@Index('idx_user_coupon_customer', ['customer'])
@Index('idx_user_coupon_business_unit', ['business_unit'])
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

  @Column({ type: 'datetime', nullable: true })
  redeemed_at: Date;

  @Column({ type: 'datetime', nullable: true })
  expires_at: Date;

  @Column({ type: 'int', nullable: true })
  external_system_id: number;

  @Column({ type: 'int', nullable: true })
  coupon_id: number;

  @CreateDateColumn()
  created_at: Date;
}
