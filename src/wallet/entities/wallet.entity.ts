import { Customer } from 'src/customers/entities/customer.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from 'src/tenants/entities/tenant.entity';

@Entity('wallet')
@Index('idx_wallet_tenant_id', ['tenant'])
@Index('idx_wallet_business_unit_id', ['business_unit'])
@Index('idx_wallet_customer_id', ['customer'])
@Index('idx_wallet_tenant_bu_created', ['created_at'])
export class Wallet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  external_system_id: number;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => BusinessUnit)
  @JoinColumn({ name: 'business_unit_id' })
  business_unit: BusinessUnit;

  @Column({
    type: 'decimal',
    default: 0,
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  total_balance: number;

  @Column({
    type: 'decimal',
    default: 0,
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  available_balance: number;

  @Column({
    type: 'decimal',
    default: 0,
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  locked_balance: number;

  @Column({ default: false })
  allow_negative: boolean;

  @Column({ type: 'int', default: 0 })
  total_earned_points: number;

  @Column({ type: 'int', default: 0 })
  total_burned_points: number;

  @Column({ type: 'int', default: 0 })
  total_expired_points: number;

  @CreateDateColumn({ nullable: true })
  created_at: Date;

  @UpdateDateColumn({ nullable: true })
  updated_at: Date;
}
