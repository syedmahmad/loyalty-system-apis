import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { Tier } from 'src/tiers/entities/tier.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';

@Entity('business_units')
export class BusinessUnit {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  tenant_id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  location: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => Tier, (tier) => tier.business_unit)
  tiers: Tier[];

  @OneToMany(() => Campaign, (campaign) => campaign.business_unit)
  campaigns: Campaign[];
}
