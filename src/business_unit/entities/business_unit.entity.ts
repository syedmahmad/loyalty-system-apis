import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { Tier } from 'src/tiers/entities/tier.entity';
import { v4 as uuidv4 } from 'uuid';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  BeforeInsert,
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

  @Column({
    type: 'char',
    length: 36,
  })
  uuid: string = uuidv4();

  @BeforeInsert()
  assignUuid() {
    if (!this.uuid) {
      this.uuid = uuidv4();
    }
  }

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  location: string;

  @Column({ type: 'varchar', length: 10, default: 'points', nullable: true })
  type: string; // 'points' | 'otp'

  @Column({ type: 'int', default: 1 })
  status: number; // 1 = active, 0 = inactive

  /** OCI URL of the program icon image. Uploaded via POST /business-units/file. */
  @Column({ type: 'varchar', length: 512, nullable: true, default: null })
  icon: string | null;

  /** Whether this program is available for redemption (burn). Default: enabled. */
  @Column({ type: 'tinyint', default: 1 })
  redemption_enabled: number; // 1 = yes, 0 = no

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => Tier, (tier) => tier.business_unit)
  tiers: Tier[];

  @OneToMany(() => Campaign, (campaign) => campaign.business_unit)
  campaigns: Campaign[];
}
