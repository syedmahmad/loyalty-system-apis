import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

export enum CouponType {
  DISCOUNT = 'DISCOUNT',
  CASHBACK = 'CASHBACK',
  TIER_BASED = 'TIER_BASED',
  REFERRAL = 'REFERRAL',
  BIRTHDAY = 'BIRTHDAY',
  USAGE_BASED = 'USAGE_BASED',
  GEO_TARGETED = 'GEO_TARGETED',
  PRODUCT_SPECIFIC = 'PRODUCT_SPECIFIC',
  TIME_LIMITED = 'TIME_LIMITED',
}

@Entity('coupons')
export class Coupon {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  tenant_id: number;

  @Column()
  code: string; // Coupon code eg: OFF50

  @Column({ type: 'decimal', nullable: true })
  discount_percentage: number;

  @Column({ type: 'decimal', nullable: true })
  discount_price: number;

  @ManyToOne(() => BusinessUnit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_unit_id' })
  business_unit: BusinessUnit;

  @Column()
  business_unit_id: number;

  @Column('int')
  usage_limit: number;

  @Column('int', { default: 0 })
  number_of_times_used: number;

  @Column({ type: 'datetime', nullable: true })
  date_from: Date;

  @Column({ type: 'datetime', nullable: true })
  date_to: Date;

  @Column({ default: false })
  once_per_customer: boolean;

  @Column({
    type: 'enum',
    enum: CouponType,
  })
  coupon_type: CouponType;

  @Column({ type: 'json', nullable: true })
  conditions: any; // dynamic schema based on coupon type

  @Column({ nullable: true, type: 'text' })
  benefits: string;

  @Column({ default: true })
  is_active: boolean;

  @Column('int')
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @Column('int')
  updated_by: number;

  @UpdateDateColumn()
  updated_at: Date;
}
