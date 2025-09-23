import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { RustyVehicle } from './rusty-vehicles.entity';
import { RustyJobcard } from './rusty-jobcards.entity';

@Entity('rusty_customers')
export class RustyCustomer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  type: string;

  @Column({ nullable: true })
  phone_number: string;

  @Column({ nullable: true })
  email: string;

  @Column({ default: true })
  status: boolean;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  dob: string;

  @Column({ nullable: true })
  address: string;

  @Column({ type: 'timestamp', nullable: true })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  updated_at: Date;

  @OneToMany(() => RustyVehicle, (vehicle) => vehicle.customer)
  vehicles: RustyVehicle[];

  @OneToMany(() => RustyJobcard, (jobcard) => jobcard.customer)
  jobcards: RustyJobcard[];
}
