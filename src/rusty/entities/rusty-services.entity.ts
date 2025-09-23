import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { RustyInvoice } from './rusty-invoices.entity';

@Entity('rusty_services')
export class RustyService {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => RustyInvoice, (invoice) => invoice.services, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'invoice_id' })
  invoice: RustyInvoice;

  @Column({ name: 'service_id', nullable: true })
  serviceId: string;

  @Column({ name: 'service_group_name', nullable: true })
  serviceGroupName: string;

  @Column({ name: 'service_name', nullable: true })
  serviceName: string;

  @Column({
    name: 'price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  price: number;

  @Column({
    name: 'before_discount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  beforeDiscount: number;

  @Column({
    name: 'total_discount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  totalDiscount: number;

  @Column({
    name: 'before_tax',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  beforeTax: number;

  @Column({
    name: 'tax_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  taxAmount: number;

  @Column({ nullable: true })
  invoice_service_id: string; // id(InvoiceServiceID)

  @Column({ nullable: true })
  invoice_service_package_id: string; // InvoiceServicePackageID

  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  totalAmount: number;
}
