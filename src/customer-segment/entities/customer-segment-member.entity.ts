// customer-segment-member.entity.ts
import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import { CustomerSegment } from './customer-segment.entity';
import { Customer } from 'src/customers/entities/customer.entity';

@Entity('customer_segment_members')
export class CustomerSegmentMember {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => CustomerSegment, (segment) => segment.members, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'segment_id' })
  segment: CustomerSegment;

  @Column()
  segment_id: number;

  @ManyToOne(() => Customer, (customer) => customer.memberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column()
  customer_id: number;

  @CreateDateColumn()
  created_at: Date;
}
