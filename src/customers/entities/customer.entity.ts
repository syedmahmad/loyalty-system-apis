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

@Entity()
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  external_customer_id: string;

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

  @Column({ type: 'text', nullable: true })
  qr_code_base64: string;

  @OneToMany(() => CustomerSegmentMember, (m: any) => m.customer)
  memberships: CustomerSegmentMember[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
