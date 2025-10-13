// customer-segment.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CustomerSegmentMember } from './customer-segment-member.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { CampaignCustomerSegment } from 'src/campaigns/entities/campaign-customer-segments.entity';
import { CouponCustomerSegment } from 'src/coupons/entities/coupon-customer-segments.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { OfferCustomerSegment } from 'src/offers/entities/offer-customer-segments.entity';

@Entity('customer_segments')
export class CustomerSegment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column()
  name_ar: string;

  @Column()
  description_ar: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  tenant_id: number;

  @ManyToOne(() => BusinessUnit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_unit_id' })
  business_unit: BusinessUnit;

  @Column({ nullable: true })
  business_unit_id: number;

  @Column({ type: 'int', default: 1 })
  status: number;

  @OneToMany(() => CustomerSegmentMember, (m) => m.segment, {
    cascade: true,
  })
  members: CustomerSegmentMember[];

  @OneToMany(() => CampaignCustomerSegment, (cs) => cs.segment)
  campaigns: CampaignCustomerSegment[];

  @OneToMany(() => CouponCustomerSegment, (cs) => cs.segment)
  coupons: CouponCustomerSegment[];

  @OneToMany(() => OfferCustomerSegment, (cs) => cs.segment)
  offers: OfferCustomerSegment[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
