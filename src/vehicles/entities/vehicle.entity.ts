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

  @Column({ type: 'varchar', length: 255, nullable: true })
  make: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  make_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  model: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  model_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  year: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  category: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  category_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  registration_number: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @CreateDateColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updated_at: Date;

  @Column({ type: 'varchar', length: 32, nullable: true })
  fuel_type: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  vin_number: string;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason_for_deactivation: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  class: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  deactivation_reason_group_id: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  make_name_ar: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  model_name_ar: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  fuel_type_group_id: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  fuel_type_name_ar: string;

  @Column({ type: 'int', nullable: true })
  last_mileage: number;

  @Column({ type: 'datetime', nullable: true })
  last_service_date: Date;
}
