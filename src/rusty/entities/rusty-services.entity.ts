import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Maps to the uploaded saudi_gms_stg_services schema.
 * Source: saudi_gms_stg_services.json
 */
@Entity({ name: 'rusty_services' })
export class Service {
  @PrimaryColumn({ name: 'id', type: 'char', length: 36 })
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 255, nullable: false })
  name: string;

  @Column({ name: 'name_alt', type: 'varchar', length: 45, nullable: true })
  name_alt: string | null;

  @Column({ name: 'type', type: 'varchar', length: 45, nullable: true })
  type: string | null;

  @Column({ name: 'status', type: 'int', nullable: false, default: 0 })
  status: number;

  @Column({ name: 'created_at', type: 'datetime', nullable: false })
  created_at: Date;

  @Column({ name: 'updated_at', type: 'datetime', nullable: false })
  updated_at: Date;
}
