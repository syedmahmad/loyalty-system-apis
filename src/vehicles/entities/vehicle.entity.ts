import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Customer } from 'src/customers/entities/customer.entity';

@Entity({ name: 'vehicles' })
export class Vehicle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer', nullable: true })
  make_id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  make: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  make_ar: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  model_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  model: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  model_ar: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  variant_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  variant: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  variant_ar: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  year: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  color: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  engine: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  body_type: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  fuel_type: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  transmission: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  transmission_en: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  transmission_ar: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  plate_no: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  vin_number: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  image: string;

  @Column({ type: 'int', nullable: true })
  last_mileage: number;

  @Column({ type: 'datetime', nullable: true })
  last_service_date: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  category: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  category_id: string;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  // --- Account Deletion Tracking ---
  @Column({ type: 'datetime', nullable: true })
  delete_requested_at: Date;

  @Column({ type: 'text', nullable: true })
  reason_for_deletion: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ type: 'varchar', length: 255, nullable: true })
  owner_name: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  owner_id: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  user_id: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  registeration_type: string;

  @Column({ type: 'date', nullable: true })
  registeration_date: Date;

  @Column({ type: 'varchar', length: 128, nullable: true })
  registeration_no: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  sequence_no: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  national_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'varchar', length: 16, nullable: true })
  fuel_type_group_id: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  fuel_type_name_en: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  fuel_type_name_ar: string;

  // New fields for car condition and price range
  @Column({ type: 'varchar', length: 128, nullable: true })
  carCondition: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  minPrice: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  maxPrice: number;

  @Column({ type: 'json', nullable: true })
  images: { type: string; url: string }[];
}
