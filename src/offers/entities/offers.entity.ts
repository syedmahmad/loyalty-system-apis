import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ActiveStatus } from '../type/types';
import { OfferCustomerSegment } from './offer-customer-segments.entity';
import { OfferLocalEntity } from './offer-locale.entity';

@Entity('offers')
@Index('idx_offers_uuid', ['uuid'])
@Index('idx_offers_tenant', ['tenant_id'])
@Index('idx_offers_business_unit', ['business_unit_id'])
@Index('idx_offers_tenant_bu_uuid', ['tenant_id', 'business_unit_id', 'uuid']) // composite index for fast multi-column lookups
export class OffersEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  tenant_id: number;

  @Column({ nullable: true })
  station_type: string;

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

  @ManyToOne(() => BusinessUnit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_unit_id' })
  business_unit: BusinessUnit;

  @Column()
  business_unit_id: number;

  @Column({ type: 'datetime', nullable: true })
  date_from: Date;

  @Column({ type: 'datetime', nullable: true })
  date_to: Date;

  @Column({ type: 'tinyint', default: ActiveStatus.ACTIVE })
  status: number; // 0 = inactive, 1 = active, 2 = deleted

  @OneToMany(() => OfferCustomerSegment, (cs) => cs.offer)
  customerSegments: OfferCustomerSegment[];

  @Column({ type: 'int', nullable: true })
  external_system_id: number;

  @Column({ type: 'tinyint', default: 1 })
  all_users: number; // 0 = false, 1 = true

  @Column('int')
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @Column('int')
  updated_by: number;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => OfferLocalEntity, (locale) => locale.offer, {
    cascade: true,
    eager: true,
  })
  locales: OfferLocalEntity[];

  @Column({ type: 'tinyint', default: 0 })
  show_in_app: number; // 0 = hide in app, 1 = show in app
}
