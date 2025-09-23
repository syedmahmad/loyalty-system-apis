import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { RustyVehicle } from './rusty-vehicles.entity';
import { RustyCustomer } from './rusty-customers.entity';
import { RustyInvoice } from './rusty-invoices.entity';
import { RustyWorkshop } from './rusty-workshops.entity';

@Entity('rusty_jobcards')
export class RustyJobcard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  odometer_reading: string;

  @Column({ nullable: true })
  vehicle_complaints: string;

  @Column({ type: 'timestamp', nullable: true })
  delivery_date: Date;

  @Column({ nullable: true })
  status: string;

  @Column({ type: 'timestamp', nullable: true })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  updated_at: Date;

  @Column({ nullable: true })
  source_of_customer: string;

  @Column({ type: 'timestamp', nullable: true })
  completed_date: Date;

  @Column({ nullable: true })
  customer_id: string;

  @ManyToOne(() => RustyVehicle, (vehicle) => vehicle.jobcards, {
    onDelete: 'CASCADE',
  })
  vehicle: RustyVehicle;

  @ManyToOne(() => RustyCustomer, (customer) => customer.jobcards, {
    onDelete: 'CASCADE',
  })
  customer: RustyCustomer;

  @ManyToOne(() => RustyWorkshop, (workshop) => workshop.jobcards, {
    onDelete: 'CASCADE',
  })
  workshop: RustyWorkshop;

  @OneToOne(() => RustyInvoice, (invoice) => invoice.jobcard, {
    cascade: true,
  })
  @JoinColumn()
  invoice: RustyInvoice;
}
