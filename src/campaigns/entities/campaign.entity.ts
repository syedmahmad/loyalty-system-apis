import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
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

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  tenant_id: number;

  @ManyToOne(() => BusinessUnit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_unit_id' })
  business_unit: BusinessUnit;

  @Column()
  business_unit_id: number;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ type: 'datetime' })
  start_date: Date;

  @Column({ nullable: true })
  type: 'seasonal' | 'referral' | 'targeted';

  @Column({ type: 'float', nullable: true })
  budget: number;

  @Column({ nullable: true })
  color: string;

  @Column({ type: 'datetime' })
  end_date: Date;

  @Column({ default: true })
  is_active: boolean;

  @Column()
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @Column()
  updated_by: number;

  @UpdateDateColumn()
  updated_at: Date;
}
