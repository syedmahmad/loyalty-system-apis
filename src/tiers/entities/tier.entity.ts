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

@Entity('tiers')
export class Tier {
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
  name: string; // e.g., Bronze, Silver, Gold

  @Column('int', { default: 1 })
  level: number; // Order or rank

  @Column({ default: true })
  is_active: boolean;

  @Column({ nullable: true })
  color: string; // Optional UI field

  @Column('int')
  min_points: number;

  @Column('int')
  max_points: number;

  @Column({ nullable: true, type: 'text' })
  benefits: string;

  @Column('int')
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @Column('int')
  updated_by: number;

  @UpdateDateColumn()
  updated_at: Date;
}
