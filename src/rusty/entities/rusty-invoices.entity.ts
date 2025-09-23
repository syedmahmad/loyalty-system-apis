import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  OneToMany,
} from 'typeorm';
import { RustyJobcard } from './rusty-jobcards.entity';
import { RustyService } from './rusty-services.entity';

@Entity('rusty_invoices')
export class RustyInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  invoice_no: string;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  total_amount: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  sub_total: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  total_tax_amount: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  total_discount_amount: number;

  @Column({ type: 'timestamp', nullable: true })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  updated_at: Date;

  @Column({ nullable: true })
  workshop_id: string;

  @OneToOne(() => RustyJobcard, (jobcard) => jobcard.invoice, {
    onDelete: 'CASCADE',
  })
  jobcard: RustyJobcard;

  @OneToMany(() => RustyService, (service) => service.invoice, {
    cascade: true,
  })
  services: RustyService[];
}
