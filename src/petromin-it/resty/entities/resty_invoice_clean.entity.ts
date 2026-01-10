import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('resty_invoice_clean')
@Index('idx_invoice_number', ['invoice_number'])
@Index('idx_customer_mobile', ['customer_mobile'])
@Index('idx_invoice_date', ['invoice_date'])
export class RestyInvoiceCleanData {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  customer_id: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customer_name: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  customer_mobile: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  status_flag: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  nationality: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  birth_date: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location_name: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  make_name: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model_name: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  vehicle_year: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  vehicle_transmission_type_id: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  vin: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  plate_number: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  branch_code: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  branch_name: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  invoice_id: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  invoice_date: string | null;

  @Column({ type: 'varchar', length: 255 })
  invoice_number: string;

  @Column('decimal', { precision: 10, scale: 2, nullable: true, default: 0 })
  invoice_sub_total_amount: number | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true, default: 0 })
  invoice_total_amount: number | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true, default: 0 })
  invoice_total_discount_amount: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  latitude: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  longitude: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  mileage: string | null;

  @Column({ type: 'json', nullable: true })
  line_items: Array<{
    ItemBeforeTaxAmount: number;
    ItemGroup: string;
    ServiceBeforeTaxAmount: number;
    ServiceItem: string;
    ServiceName: string;
  }> | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({
    type: 'timestamp',
  })
  updated_at: Date;
}
