import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OffersEntity } from './offers.entity';
import { Customer } from 'src/customers/entities/customer.entity';
import { CouponSource } from '../type/types';

@Entity('offer_coupon_assignments')
@Index('idx_offer_id', ['offer_id'])
@Index('idx_customer_id', ['customer_id'])
@Index('idx_coupon_code', ['coupon_code'])
@Index('idx_status', ['status'])
@Index('idx_offer_status', ['offer_id', 'status'])
@Index('idx_customer_status', ['customer_id', 'status'])
@Index('idx_offer_coupon', ['offer_id', 'coupon_code'])
export class OfferCouponAssignment {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @ManyToOne(() => OffersEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'offer_id' })
  offer: OffersEntity;

  @Column()
  offer_id: number;

  @Column({ type: 'varchar', nullable: true })
  coupon_code: string;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ nullable: true })
  customer_id: number;

  @Column({
    type: 'enum',
    enum: ['AVAILABLE', 'ASSIGNED', 'REDEEMED', 'EXPIRED', 'CANCELLED'],
    default: 'AVAILABLE',
  })
  status: string;

  @Column({
    type: 'enum',
    enum: [CouponSource.UPLOADED, CouponSource.AUTO_GENERATED],
    default: CouponSource.AUTO_GENERATED,
  })
  coupon_source: string;

  @Column({ type: 'boolean', default: false })
  is_used: boolean;

  @Column({ type: 'datetime', nullable: true })
  used_at: Date;

  @Column({ type: 'boolean', default: false })
  is_expired: boolean;

  @Column({ type: 'datetime', nullable: true })
  expired_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
