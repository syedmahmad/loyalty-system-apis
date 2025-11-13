import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntityBeta } from 'src/core/entities/base-entity-beta';
import { LanguageEntity } from '../../master/language/entities/language.entity';
import { OffersEntity } from './offers.entity';

@Entity('locale_offer')
export class OfferLocalEntity extends BaseEntityBeta {
  @ManyToOne(() => OffersEntity, (offer) => offer.locales, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'offer_id' })
  offer: OffersEntity;

  @ManyToOne(() => LanguageEntity, { eager: true })
  @JoinColumn({ name: 'language_id' })
  language: LanguageEntity;

  @Column({ name: 'title' })
  title: string;

  @Column({ name: 'subtitle', nullable: true })
  subtitle: string;

  @Column({ name: 'desktop_image', nullable: true })
  desktop_image: string;

  @Column({ name: 'mobile_image', nullable: true })
  mobile_image: string;

  @Column({ type: 'text', name: 'description', nullable: true })
  description: string;

  @Column({ type: 'text', name: 'term_and_condition', nullable: true })
  term_and_condition: string;

  @Column({ type: 'simple-json', nullable: true })
  benefits: Record<string, string>;
}
