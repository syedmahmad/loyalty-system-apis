import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { Customer } from 'src/customers/entities/customer.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OfferStatus } from '../type/types';

@Entity()
export class UserOffer {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Customer, { eager: true })
  customer: Customer;

  @ManyToOne(() => BusinessUnit, { eager: true })
  @JoinColumn({ name: 'business_unit_id' })
  business_unit: BusinessUnit;

  @Column({ type: 'enum', enum: OfferStatus })
  status: OfferStatus;

  @Column()
  issued_from_type: string;

  @Column({ nullable: true })
  issued_from_id: number;

  @Column({ type: 'datetime', nullable: true })
  redeemed_at: Date;

  @Column({ type: 'datetime', nullable: true })
  expires_at: Date;

  @Column({ type: 'int', nullable: true })
  external_system_id: number;

  @Column({ type: 'int', nullable: true })
  offer_id: number;

  @CreateDateColumn()
  created_at: Date;
}
