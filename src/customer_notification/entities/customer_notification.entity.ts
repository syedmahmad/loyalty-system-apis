import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'customer_notifications' })
export class CustomerNotification {
  @PrimaryGeneratedColumn()
  id: number;

  // The user who receives the notification. Nullable for broadcast notifications.
  @Column({ type: 'int', nullable: true })
  user_id: number | null;

  @Column({ type: 'varchar', length: 50 })
  notification_type: string; // e.g., welcome, earn_points, burn_points

  // reference to related entity (service id, transaction id, etc)
  @Column({ type: 'int', nullable: true })
  reference_id: number | null;

  @Column({ type: 'tinyint', width: 1, default: () => '0' })
  is_read: boolean;

  @Column({ type: 'datetime', nullable: true })
  read_at: Date | null;

  // JSON for dynamic content (points, titles, extra metadata)
  @Column({ type: 'json', nullable: true })
  notification_details: Record<string, any> | null;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;

  @UpdateDateColumn({
    type: 'datetime',
    nullable: true,
  })
  updated_at: Date;

  // admin/system id that triggered it
  @Column({ type: 'int', nullable: true })
  send_by: number | null;

  // Scheduled send datetime (if scheduled in future)
  @Column({ type: 'datetime', nullable: true })
  scheduled_at: Date | null;

  // For broadcasts: array of user ids OR criteria stored as json
  @Column({ type: 'json', nullable: true })
  user_ids: number[] | null;
}
