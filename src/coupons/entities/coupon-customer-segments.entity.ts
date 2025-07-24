import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Coupon } from './coupon.entity';
import { CustomerSegment } from 'src/customer-segment/entities/customer-segment.entity';

@Entity('coupon_customer_segments')
export class CouponCustomerSegment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Coupon, (coupon) => coupon.customerSegments)
  @JoinColumn({ name: 'coupon_id' })
  coupon: Coupon;

  @ManyToOne(() => CustomerSegment, (segment) => segment.coupons)
  @JoinColumn({ name: 'segment_id' })
  segment: CustomerSegment;
}
