import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

/**
 * Maps to table: rusty_invoices
 */
@Entity({ name: 'rusty_invoices' })
export class JobcardsInvoice {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 36 })
  id: string;

  @Index()
  @Column({ name: 'jobcard_id', type: 'varchar', length: 36, nullable: true })
  jobcard_id: string | null;

  @Column({ name: 'invoice_no', type: 'varchar', length: 255, nullable: false })
  invoice_no: string;

  @Column({ name: 'total_amount', type: 'double', nullable: false, default: 0 })
  total_amount: number;

  @Column({ name: 'sub_total', type: 'double', nullable: true, default: 0 })
  sub_total: number | null;

  @Column({
    name: 'total_tax_amount',
    type: 'double',
    nullable: true,
    default: 0,
  })
  total_tax_amount: number | null;

  @Column({
    name: 'total_discount_amount',
    type: 'double',
    nullable: true,
    default: 0,
  })
  total_discount_amount: number | null;

  @Column({ name: 'workshop_id', type: 'varchar', length: 36, nullable: true })
  workshop_id: string | null;

  @Column({ name: 'services', type: 'json', nullable: true })
  services: any | null;

  @Column({ name: 'created_by', type: 'varchar', length: 36, nullable: true })
  created_by: string | null;

  @Column({ name: 'updated_by', type: 'varchar', length: 36, nullable: true })
  updated_by: string | null;

  @Column({ name: 'status', type: 'varchar', length: 15, nullable: true })
  status: string | null;

  @Index()
  @Column({ name: 'created_at', type: 'datetime', nullable: false })
  created_at: Date;

  @Column({ name: 'updated_at', type: 'datetime', nullable: false })
  updated_at: Date;

  @Column({ name: 'file_path', type: 'varchar', length: 255, nullable: true })
  file_path: string | null;

  @Column({ name: 'invoice_suffix_no', type: 'int', nullable: true })
  invoice_suffix_no: number | null;

  @Column({ name: 'is_from_inventory', type: 'int', nullable: true })
  is_from_inventory: number | null;
}
