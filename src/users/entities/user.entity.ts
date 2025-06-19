import { Tenant } from 'src/tenants/entities/tenant.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  tenant_id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ default: 'viewer' })
  role: 'admin' | 'manager' | 'viewer';

  @CreateDateColumn()
  createdAt: Date;
}
