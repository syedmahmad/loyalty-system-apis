// customer.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { CustomerSegmentMember } from 'src/customer-segment/entities/customer-segment-member.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { DeviceToken } from 'src/petromin-it/notification/entities/device-token.entity';

@Entity()
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  external_customer_id: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => BusinessUnit)
  @JoinColumn({ name: 'business_unit_id' })
  business_unit: BusinessUnit;

  // --- Personal Information ---
  @Column({ nullable: true })
  name: string; // combined display

  @Column({ nullable: true })
  first_name: string;

  @Column({ nullable: true })
  last_name: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  country_code: string;

  @Column({ nullable: true })
  gender: string;

  @Column({ nullable: true })
  DOB: Date;

  @Column({ default: 0 })
  status: 0 | 1 | 3;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  custom_city: string;

  @Column({ type: 'int', nullable: true })
  city_id: number;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  address: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  uuid: string;

  // --- OTP Authentication ---
  @Column({ type: 'varchar', length: 10, nullable: true })
  otp_code: string;

  @Column({ type: 'datetime', nullable: true })
  otp_expires_at: Date;

  // --- Auth / Type ---
  @Column({ length: 255, nullable: true, select: false })
  password: string;

  @Column({ length: 10, default: 'customer' })
  user_type: string;

  // --- Loyalty / Referral ---
  @Column({ nullable: true })
  referral_code: string;

  @Column({ type: 'int', nullable: true })
  referrer_id: number;

  // --- Profile / Preferences ---
  @Column({ nullable: true })
  image_url: string;

  @Column({ nullable: true })
  nationality: string;

  @Column({ nullable: true })
  notify_tier: string;

  // --- Account Deletion Tracking ---
  @Column({ type: 'datetime', nullable: true })
  delete_requested_at: Date;

  @Column({ type: 'int', default: 0 })
  is_delete_requested: number;

  @Column({ type: 'text', nullable: true })
  reason_for_deletion: string;

  @Column({ type: 'text', nullable: true })
  reason_for_deletion_other: string;

  @Column({ type: 'tinyint', default: 0 })
  deletion_status: number;

  @Column({ type: 'int', nullable: true })
  deleted_by: number;

  @Column({ type: 'datetime', nullable: true })
  deleted_at: Date;

  // --- Terms & Conditions ---
  @Column({ type: 'tinyint', default: 0 })
  is_terms_accepted: number;

  @Column({ type: 'datetime', nullable: true })
  terms_accepted_at: Date;

  // --- Source & Last Activity ---
  @Column({ nullable: true })
  source: string;

  @Column({ type: 'datetime', nullable: true })
  last_service_date: Date;

  // --- Relations ---
  @OneToMany(() => CustomerSegmentMember, (m: any) => m.customer)
  memberships: CustomerSegmentMember[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  hashed_number: string;

  // --- Audit ---
  @CreateDateColumn({ nullable: true })
  created_at: Date;

  @UpdateDateColumn({ nullable: true })
  updated_at: Date;

  @Column({ type: 'tinyint', default: 0 })
  is_new_user: number;

  @Column({ type: 'int', default: 0 })
  login_count: number;

  @OneToMany(() => DeviceToken, (DeviceToken) => DeviceToken.customer)
  firebaseTokens: DeviceToken[];
}
