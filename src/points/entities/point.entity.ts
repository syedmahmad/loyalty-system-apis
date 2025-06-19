import { Tenant } from 'src/tenants/entities/tenant.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity()
export class Point {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  tenant_id: number; // For multi-tenancy

  @Column()
  user_id: number; // User to whom points belong

  @Column('int')
  points: number; // Number of points added or deducted

  @Column({ nullable: true })
  source: string; // Source or reason for points (optional)

  @Column({ default: true })
  is_active: boolean; // Is the points record active

  @Column()
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @Column()
  updated_by: number;

  @UpdateDateColumn()
  updated_at: Date;
}
