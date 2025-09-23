import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { RustyCustomer } from './rusty-customers.entity';
import { RustyJobcard } from './rusty-jobcards.entity';

@Entity('rusty_vehicles')
export class RustyVehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  vehicle_number: string;

  @Column({ nullable: true })
  vehicle_category_id: string;

  @Column({ nullable: true })
  vehicle_brand_id: string;

  @Column({ nullable: true })
  vehicle_variant_id: string;

  @Column({ nullable: true })
  year_of_manufacture: string;

  @Column({ nullable: true })
  transmission: string;

  @Column({ nullable: true })
  vehicle_brand_name: string;

  @Column({ nullable: true })
  vehicle_variant_name: string;

  @Column({ nullable: true })
  vin_number: string;

  @Column({ type: 'timestamp', nullable: true })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  updated_at: Date;

  @ManyToOne(() => RustyCustomer, (customer) => customer.vehicles, {
    onDelete: 'CASCADE',
  })
  customer: RustyCustomer;

  @OneToMany(() => RustyJobcard, (jobcard) => jobcard.vehicle)
  jobcards: RustyJobcard[];
}
