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
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ActiveStatus } from '../type/types';
import { OfferCustomerSegment } from './offer-customer-segments.entity';

class ImageLang {
  en?: string;
  ar?: string;
}

class Images {
  desktop?: ImageLang;
  mobile?: ImageLang;
}

@Entity('offers')
export class OffersEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  tenant_id: number;

  @Column()
  offer_title: string;

  @Column({ nullable: true })
  offer_title_ar: string;

  @Column({ nullable: true })
  offer_subtitle: string;

  @Column({ nullable: true })
  offer_subtitle_ar: string;

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

  @Column({ type: 'simple-json', nullable: true })
  benefits: { name_en: string; name_ar: string; icon: string }[];

  @Column({ type: 'tinyint', default: ActiveStatus.ACTIVE })
  status: number; // 0 = inactive, 1 = active, 2 = deleted

  @Column({ nullable: true })
  description_en: string;

  @Column({ nullable: true })
  description_ar: string;

  @Column({ nullable: true, type: 'text' })
  terms_and_conditions_en: string;

  @Column({ nullable: true, type: 'text' })
  terms_and_conditions_ar: string;

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

  @Column({ type: 'simple-json', nullable: true })
  images?: Images;
}
