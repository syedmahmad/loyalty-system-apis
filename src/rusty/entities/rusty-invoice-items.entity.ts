import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

/**
 * Maps to table: rusty_invoice_items
 */
@Entity({ name: 'rusty_invoice_items' })
export class RustyInvoiceItem {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 36 })
  id: string;

  @Index()
  @Column({
    name: 'jobcard_invoice_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  jobcard_invoice_id: string | null;

  @Column({ name: 'quantity', type: 'double', nullable: false })
  quantity: number;

  @Column({ name: 'volume', type: 'double', nullable: false, default: 0 })
  volume: number;

  @Column({
    name: 'gst_percent_per_item',
    type: 'double',
    nullable: true,
    default: 0,
  })
  gst_percent_per_item: number | null;

  @Column({
    name: 'discount_per_item',
    type: 'double',
    nullable: true,
    default: 0,
  })
  discount_per_item: number | null;

  @Column({ name: 'sub_total', type: 'double', nullable: true, default: 0 })
  sub_total: number | null;

  @Column({ name: 'total_amount', type: 'double', nullable: false, default: 0 })
  total_amount: number;

  @Index()
  @Column({ name: 'type', type: 'varchar', length: 255, nullable: true })
  type: string | null;

  @Column({ name: 'hsn', type: 'varchar', length: 200, nullable: true })
  hsn: string | null;

  @Column({ name: 'gst_type', type: 'varchar', length: 30, nullable: true })
  gst_type: string | null;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({
    name: 'discount_type',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  discount_type: string | null;

  @Column({ name: 'created_at', type: 'datetime', nullable: false })
  created_at: Date;

  @Index()
  @Column({
    name: 'updated_at',
    type: 'datetime',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date | null;

  @Column({ name: 'price', type: 'double', nullable: true })
  price: number | null;

  @Column({
    name: 'gst_amount_per_item',
    type: 'double',
    nullable: true,
    default: 0,
  })
  gst_amount_per_item: number | null;

  @Column({
    name: 'unique_key_spare',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  unique_key_spare: string | null;
}
