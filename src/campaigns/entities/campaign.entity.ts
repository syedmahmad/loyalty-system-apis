import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { CampaignRule } from './campaign-rule.entity';
import { CampaignTier } from './campaign-tier.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { CampaignCoupons } from './campaign-coupon.entity';
import { CampaignCustomerSegment } from './campaign-customer-segments.entity';

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  tenant_id: number;

  @Column()
  name: string;

  @Column({ type: 'timestamp' })
  start_date: Date;

  @Column({ type: 'timestamp' })
  end_date: Date;

  @Column({ nullable: true })
  description?: string;

  @ManyToOne(() => BusinessUnit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_unit_id' })
  business_unit: BusinessUnit;

  @Column()
  business_unit_id: number;

  @OneToMany(() => CampaignRule, (cr) => cr.campaign, { cascade: true })
  rules: CampaignRule[];

  @OneToMany(() => CampaignTier, (ct) => ct.campaign, { cascade: true })
  tiers: CampaignTier[];

  @Column({ default: false })
  active: boolean;

  @Column({ type: 'int', default: 0 })
  status: number;

  @OneToMany(() => CampaignCoupons, (cr) => cr.campaign, { cascade: true })
  coupons: CampaignCoupons[];

  // In Campaign.ts
  @OneToMany(() => CampaignCustomerSegment, (cs) => cs.campaign, {
    cascade: true,
  })
  customerSegments: CampaignCustomerSegment[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
