import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { OffersEntity } from './offers.entity';
import { CustomerSegment } from 'src/customer-segment/entities/customer-segment.entity';

@Entity('offer_customer_segments')
export class OfferCustomerSegment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => OffersEntity, (offer) => offer.customerSegments)
  @JoinColumn({ name: 'offer_id' })
  offer: OffersEntity;

  @ManyToOne(() => CustomerSegment, (segment) => segment.offers)
  @JoinColumn({ name: 'segment_id' })
  segment: CustomerSegment;
}
