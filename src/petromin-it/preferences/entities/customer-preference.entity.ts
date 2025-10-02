import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from 'src/customers/entities/customer.entity';

@Entity({ name: 'customer_preferences' })
@Unique(['customer'])
export class CustomerPreference {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ type: 'enum', enum: ['en', 'ar'], default: 'en' })
  preferred_lang: 'en' | 'ar';

  @Column({ type: 'tinyint', default: 1 })
  email_notification: number; // 1 active, 0 inactive

  @Column({ type: 'tinyint', default: 1 })
  whatsapp_notification: number;

  @Column({ type: 'tinyint', default: 1 })
  sms_notification: number;

  @Column({ type: 'tinyint', default: 1 })
  push_notification: number;

  @Column({ type: 'tinyint', default: 1 })
  location_access: number;

  @Column({ type: 'tinyint', default: 1 })
  biometric: number;

  @CreateDateColumn({ nullable: true })
  created_at: Date;

  @UpdateDateColumn({ nullable: true })
  updated_at: Date;
}
