import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Campaign } from './campaign.entity';
import { Coupon } from 'src/coupons/entities/coupon.entity';

@Entity('campaign_coupons')
export class CampaignCoupons {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Campaign, (campaign) => campaign.coupons, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @ManyToOne(() => Coupon, { eager: true })
  @JoinColumn({ name: 'coupon_id' })
  coupon: Coupon;
  status: number;
}
