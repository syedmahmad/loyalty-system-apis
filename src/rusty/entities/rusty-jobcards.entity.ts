import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

/**
 * Maps to table: rusty_jobcards
 */
@Entity({ name: 'rusty_jobcards' })
export class RustyJobcard {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 36 })
  id: string;

  @Index()
  @Column({ name: 'vehicle_id', type: 'varchar', length: 36, nullable: false })
  vehicle_id: string;

  @Column({
    name: 'dm_vehicle_id',
    type: 'varchar',
    length: 45,
    nullable: true,
  })
  dm_vehicle_id: string | null;

  @Column({ name: 'fuel_level', type: 'varchar', length: 15, nullable: true })
  fuel_level: string | null;

  @Column({ name: 'odometer', type: 'double', nullable: true })
  odometer: number | null;

  @Column({
    name: 'vehicle_inventories',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  vehicle_inventories: string | null;

  @Column({
    name: 'vehicle_inventory_others',
    type: 'varchar',
    length: 45,
    nullable: true,
  })
  vehicle_inventory_others: string | null;

  @Column({
    name: 'vehicle_complaints',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  vehicle_complaints: string | null;

  @Column({
    name: 'vehicle_complaint_others',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  vehicle_complaint_others: string | null;

  @Column({ name: 'delivery_date', type: 'datetime', nullable: true })
  delivery_date: Date | null;

  @Column({ name: 'estimate_amount', type: 'double', nullable: true })
  estimate_amount: number | null;

  @Index()
  @Column({ name: 'created_by', type: 'varchar', length: 36, nullable: true })
  created_by: string | null;

  @Column({ name: 'status', type: 'varchar', length: 50, nullable: true })
  status: string | null;

  @Index()
  @Column({ name: 'customer_id', type: 'varchar', length: 36, nullable: true })
  customer_id: string | null;

  @Index()
  @Column({ name: 'workshop_id', type: 'varchar', length: 36, nullable: true })
  workshop_id: string | null;

  @Index()
  @Column({ name: 'completed_date', type: 'datetime', nullable: true })
  completed_date: Date | null;

  @Column({ name: 'cancelled_date', type: 'datetime', nullable: true })
  cancelled_date: Date | null;

  @Column({
    name: 'payment_status',
    type: 'varchar',
    length: 15,
    nullable: true,
  })
  payment_status: string | null;

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  created_at: Date | null;

  @Index()
  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updated_at: Date | null;

  @Column({ name: 'service_packs', type: 'json', nullable: true })
  service_packs: any | null;

  @Column({
    name: 'follow_up_type',
    type: 'varchar',
    length: 45,
    nullable: true,
  })
  follow_up_type: string | null;

  @Column({ name: 'follow_up_date', type: 'datetime', nullable: true })
  follow_up_date: Date | null;

  @Column({
    name: 'follow_up_note',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  follow_up_note: string | null;

  @Column({
    name: 'follow_up_status',
    type: 'varchar',
    length: 45,
    nullable: true,
  })
  follow_up_status: string | null;

  @Column({ name: 'follow_up_comments', type: 'json', nullable: true })
  follow_up_comments: any | null;

  @Column({
    name: 'follow_up_new_comment',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  follow_up_new_comment: string | null;

  @Column({
    name: 'is_remainder_sent',
    type: 'varchar',
    length: 45,
    nullable: true,
  })
  is_remainder_sent: string | null;

  @Column({
    name: 'signature_path',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  signature_path: string | null;

  @Column({ name: 'signature', type: 'longtext', nullable: true })
  signature: string | null;

  @Column({ name: 'payment_info', type: 'json', nullable: true })
  payment_info: any | null;

  @Column({ name: 'advisor_ids', type: 'varchar', length: 255, nullable: true })
  advisor_ids: string | null;

  @Column({ name: 'jobcard_no', type: 'int', nullable: true })
  jobcard_no: number | null;

  @Column({
    name: 'source_of_customer',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  source_of_customer: string | null;
}
