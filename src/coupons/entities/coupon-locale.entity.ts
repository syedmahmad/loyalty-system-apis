import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntityBeta } from 'src/core/entities/base-entity-beta';
import { LanguageEntity } from '../../master/language/entities/language.entity';
import { Coupon } from './coupon.entity';

@Entity('locale_coupon')
export class CouponLocaleEntity extends BaseEntityBeta {
  @ManyToOne(() => Coupon, (coupon) => coupon.locales, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'coupon_id' })
  coupon: Coupon;

  @ManyToOne(() => LanguageEntity, { eager: true })
  @JoinColumn({ name: 'language_id' })
  language: LanguageEntity;

  @Column({ name: 'title' })
  title: string;

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

  @Column({ name: 'general_error', nullable: true })
  general_error: string;

  @Column({ name: 'exception_error', nullable: true })
  exception_error: string;
}
