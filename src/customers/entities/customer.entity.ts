// customer.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { CustomerSegmentMember } from 'src/customer-segment/entities/customer-segment-member.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';

@Entity()
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  external_customer_id: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => BusinessUnit)
  @JoinColumn({ name: 'business_unit_id' })
  business_unit: BusinessUnit;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column()
  phone: string;

  @Column()
  gender: string;

  @Column()
  DOB: Date;

  @Column({ default: 0 })
  status: 0 | 1;

  @Column()
  city: string;

  @Column()
  address: string;

  @Column({ type: 'text', nullable: true })
  uuid: string;

  @OneToMany(() => CustomerSegmentMember, (m: any) => m.customer)
  memberships: CustomerSegmentMember[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
