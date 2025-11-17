import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntityBeta } from 'src/core/entities/base-entity-beta';
import { LanguageEntity } from '../../master/language/entities/language.entity';
import { CustomerSegment } from './customer-segment.entity';

@Entity('locale_customer_segment')
export class CustomerSegmentLocalEntity extends BaseEntityBeta {
  @ManyToOne(() => CustomerSegment, (segment) => segment.locales, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'customer_segment_id' })
  customerSegment: CustomerSegment;

  @ManyToOne(() => LanguageEntity, { eager: true })
  @JoinColumn({ name: 'language_id' })
  language: LanguageEntity;

  @Column({ name: 'name' })
  name: string;

  @Column({ type: 'text', name: 'description', nullable: true })
  description: string;
}
