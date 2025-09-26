import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

/**
 * Maps to table: rusty_workshop
 * Trimmed to core fields + minimal operational fields
 */
@Entity({ name: 'rusty_workshop' })
export class RustyWorkshop {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'shop_type', type: 'varchar', length: 45, nullable: true })
  shop_type: string | null;

  @Column({ name: 'shop_name', type: 'varchar', length: 255, nullable: true })
  shop_name: string | null;

  @Index({ unique: true })
  @Column({ name: 'garage_code', type: 'varchar', length: 20, nullable: true })
  garage_code: string | null;

  @Column({ name: 'region', type: 'varchar', length: 100, nullable: true })
  region: string | null;

  @Column({ name: 'city', type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ name: 'longitude', type: 'varchar', length: 50, nullable: true })
  longitude: string | null;

  @Column({ name: 'latitude', type: 'varchar', length: 50, nullable: true })
  latitude: string | null;

  @Column({
    name: 'geo_coordinates',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  geo_coordinates: string | null;

  @Column({
    name: 'status',
    type: 'tinyint',
    width: 1,
    nullable: false,
    default: () => '1',
  })
  status: number;

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  created_at: Date | null;

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updated_at: Date | null;
}
