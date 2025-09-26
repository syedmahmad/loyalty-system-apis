import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

/**
 * Maps to the uploaded saudi_gms_stg_vehicles schema.
 * Extended with missing fields from API data
 */
@Entity({ name: 'rusty_vehicles' })
export class Vehicle {
  // original schema had id varchar(36) with uuid() default — use uuid primary
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Index({ unique: true })
  @Column({ name: 'dmid', type: 'varchar', length: 45, nullable: true })
  dmid: string | null;

  @Index()
  @Column({
    name: 'vehicle_number',
    type: 'varchar',
    length: 15,
    nullable: false,
  })
  vehicle_number: string;

  @Index()
  @Column({
    name: 'vehicle_category_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  vehicle_category_id: string;

  @Index()
  @Column({
    name: 'vehicle_brand_id',
    type: 'varchar',
    length: 36,
    nullable: false,
  })
  vehicle_brand_id: string;

  @Index()
  @Column({
    name: 'vehicle_variant_id',
    type: 'varchar',
    length: 36,
    nullable: false,
  })
  vehicle_variant_id: string;

  @Column({ name: 'fuel_type', type: 'varchar', length: 15, nullable: true })
  fuel_type: string | null;

  @Column({ name: 'year_of_manufacture', type: 'int', nullable: true })
  year_of_manufacture: number | null;

  @Column({ name: 'color', type: 'varchar', length: 15, nullable: true })
  color: string | null;

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  created_at: Date | null;

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updated_at: Date | null;

  @Index()
  @Column({ name: 'vin_number', type: 'varchar', length: 18, nullable: true })
  vin_number: string | null;

  /**
   * ✅ Newly added fields to align with API
   */
  @Index()
  @Column({ name: 'customer_id', type: 'varchar', length: 36, nullable: true })
  customer_id: string | null;

  @Column({
    name: 'vehicle_brand_name',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  vehicle_brand_name: string | null;

  @Column({
    name: 'vehicle_variant_name',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  vehicle_variant_name: string | null;

  @Column({ name: 'year', type: 'varchar', length: 10, nullable: true })
  year: string | null;

  @Column({ name: 'transmission', type: 'varchar', length: 45, nullable: true })
  transmission: string | null;
}
