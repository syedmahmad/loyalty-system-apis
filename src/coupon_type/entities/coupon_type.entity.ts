import { Tenant } from 'src/tenants/entities/tenant.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ActiveStatus } from '../type/types';

@Entity('coupon_types')
export class CouponType {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  tenant_id: number;

  @Column()
  coupon_type: string;

  @Column({ type: 'simple-json', nullable: true }) // Stores list of condition keys
  conditions: { name: string }[];

  @Column({ type: 'tinyint', default: ActiveStatus.ACTIVE })
  is_active: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
