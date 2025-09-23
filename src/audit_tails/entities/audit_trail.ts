import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('audit_trail')
export class AuditTrail {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  table: string;

  @Column()
  rowId: string;

  @Column()
  action: string;

  @Column({ type: 'json', nullable: true })
  current_data: Record<string, any> | null;

  @Column({ type: 'json', nullable: true })
  previous_data: Record<string, any> | null;

  @Column({ nullable: true })
  user?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
