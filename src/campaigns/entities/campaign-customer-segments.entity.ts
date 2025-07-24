import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Campaign } from './campaign.entity';
import { CustomerSegment } from 'src/customer-segment/entities/customer-segment.entity';

// TypeORM example
@Entity('campaign_customer_segments')
export class CampaignCustomerSegment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Campaign, (campaign) => campaign.customerSegments)
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @ManyToOne(() => CustomerSegment, (segment) => segment.campaigns)
  @JoinColumn({ name: 'segment_id' })
  segment: CustomerSegment;
}
