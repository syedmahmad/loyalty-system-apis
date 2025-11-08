import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntityBeta } from 'src/core/entities/base-entity-beta';
import { LanguageEntity } from '../../master/language/entities/language.entity';
import { Tier } from './tier.entity';

@Entity('locale_tier')
export class TierLocalEntity extends BaseEntityBeta {
  @ManyToOne(() => Tier, (tier) => tier.locales, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tier_id' })
  tier: Tier;

  @ManyToOne(() => LanguageEntity, { eager: true })
  @JoinColumn({ name: 'language_id' })
  language: LanguageEntity;

  @Column({ name: 'name' })
  name: string;

  @Column({ type: 'text', name: 'description', nullable: true })
  description: string;

  @Column({ type: 'simple-json', nullable: true })
  benefits: Record<string, string>;
}
