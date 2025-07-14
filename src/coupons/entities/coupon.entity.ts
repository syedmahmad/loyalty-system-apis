import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { CouponType } from 'src/coupon_type/entities/coupon_type.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ActiveStatus } from '../type/types';

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
  coupon_title: string;

  @Column()
  code: string;

  @Column({ type: 'decimal', nullable: true })
  discount_percentage: number;

  @Column({ type: 'decimal', nullable: false, default: 0 })
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

  // @Column({ default: false })
  // once_per_customer: boolean;

  @Column('int', { default: 0 })
  max_usage_per_user: number;

  @Column('int', { default: 0 })
  reuse_interval: number;

  @ManyToOne(() => CouponType, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'coupon_type_id' })
  coupon_type: CouponType;

  @Column({ nullable: true })
  coupon_type_id: number;

  @Column({ type: 'simple-json', nullable: true })
  conditions: {
    id: number;
    type: string;
    operator: string;
    value: string;
    tier?: number;
    make?: number;
    model?: number;
    variant?: number;
  }[];

  @Column({ type: 'simple-json', nullable: true })
  errors: {
    general_error_message_en?: string;
    general_error_message_ar?: string;
    exception_error_message_en?: string;
    exception_error_message_ar?: string;
  };

  @Column({ type: 'simple-json', nullable: true })
  complex_coupon: any;

  @Column({ nullable: true, type: 'text' })
  benefits: string;

  @Column({ type: 'tinyint', default: ActiveStatus.ACTIVE })
  status: number; // 0 = inactive, 1 = active, 2 = deleted

  @Column('int')
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @Column('int')
  updated_by: number;

  @UpdateDateColumn()
  updated_at: Date;
}
