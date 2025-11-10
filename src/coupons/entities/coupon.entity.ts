import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { CouponType } from 'src/coupon_type/entities/coupon_type.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ActiveStatus } from '../type/types';
import { CouponCustomerSegment } from './coupon-customer-segments.entity';
import { CouponLocaleEntity } from './coupon-locale.entity';

class ImageLang {
  en?: string;
  ar?: string;
}

class Images {
  desktop?: ImageLang;
  mobile?: ImageLang;
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

  @Column({ nullable: true })
  coupon_title: string;

  @Column({ nullable: true })
  coupon_title_ar: string;

  @Column()
  code: string;

  @Column({
    type: 'char',
    length: 36,
  })
  uuid: string = uuidv4();

  @BeforeInsert()
  assignUuid() {
    if (!this.uuid) {
      this.uuid = uuidv4();
    }
  }

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

  @Column('int', { default: null, nullable: true })
  validity_after_assignment: number;

  // @Column({ default: false })
  // once_per_customer: boolean;

  @Column('int', { default: 0 })
  max_usage_per_user: number;

  @Column('int', { default: 0 })
  reuse_interval: number;

  @Column('int', { default: 0 })
  is_point_earning_disabled: number;

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

  // @Column({ nullable: true, type: 'text' })
  // benefits: string;

  @Column({ nullable: true, type: 'text' })
  private _benefits: string;

  get benefits(): string[] {
    if (!this._benefits) return [''];
    try {
      const parsed = JSON.parse(this._benefits);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [this._benefits];
    }
  }

  set benefits(value: string[] | string) {
    if (Array.isArray(value)) {
      this._benefits = JSON.stringify(value);
    } else {
      this._benefits = JSON.stringify([value]);
    }
  }

  @Column({ type: 'tinyint', default: ActiveStatus.ACTIVE })
  status: number; // 0 = inactive, 1 = active, 2 = deleted

  @Column({ nullable: true })
  discount_type: string;

  @Column({ nullable: true })
  description_en: string;

  @Column({ nullable: true })
  description_ar: string;

  @Column({
    nullable: true,
    type: 'text',
    transformer: {
      to: (value: string) => value, // when saving
      from: (value: string) => (value ? value.replace(/\r?\n|\r/g, '') : value), // when reading
    },
  })
  terms_and_conditions_en: string;

  @Column({
    nullable: true,
    type: 'text',
    transformer: {
      to: (value: string) => value, // when saving
      from: (value: string) => (value ? value.replace(/\r?\n|\r/g, '') : value), // when reading
    },
  })
  terms_and_conditions_ar: string;

  @OneToMany(() => CouponCustomerSegment, (cs) => cs.coupon)
  customerSegments: CouponCustomerSegment[];

  @Column({ type: 'int', nullable: true })
  external_system_id: number;

  @Column({ type: 'tinyint', default: 1 })
  all_users: number; // 0 = false, 1 = true

  @Column({ type: 'int', nullable: true })
  tier_id: number;

  @Column({ type: 'int', nullable: true })
  upto_amount: number;

  @Column({ type: 'tinyint', default: 0 })
  is_welcome_coupon: number; // 0 = false, 1 = true

  @Column({ type: 'int', nullable: true })
  min_transaction_amount: number;

  @Column({ type: 'time', nullable: true })
  lean_start_time: string;

  @Column({ type: 'time', nullable: true })
  lean_end_time: string;

  @Column('int')
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @Column('int')
  updated_by: number;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'simple-json', nullable: true })
  images?: Images;

  @OneToMany(() => CouponLocaleEntity, (locale) => locale.coupon, {
    cascade: true,
    eager: true,
  })
  locales: CouponLocaleEntity[];
}
