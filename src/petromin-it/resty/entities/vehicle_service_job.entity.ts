import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Generated,
} from 'typeorm';

@Entity('vehicle_service_jobs')
export class VehicleServiceJob {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true, nullable: true })
  @Generated('uuid')
  uuid: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone_number: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  vehicle_platNo: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  delivery_date: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  status: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  workshop_code: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workshop_name: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workshop_address: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  workshop_phone: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  odometer_reading: string | null;

  @CreateDateColumn({ nullable: true })
  created_at: Date | null;

  @UpdateDateColumn({ nullable: true })
  updated_at: Date | null;
}
