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

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  tenant_id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ default: 0 })
  points_balance: number;

  @Column({ nullable: true })
  external_id: string; // optional field to store source CRM ID

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
