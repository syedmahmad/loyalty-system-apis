import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntityBeta } from 'src/core/entities/base-entity-beta';
import { LanguageEntity } from '../../master/language/entities/language.entity';
import { Rule } from './rules.entity';

@Entity('locale_rule')
export class RuleLocaleEntity extends BaseEntityBeta {
  @ManyToOne(() => Rule, (rule) => rule.locales, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'rule_id' })
  rule: Rule;

  @ManyToOne(() => LanguageEntity, { eager: true })
  @JoinColumn({ name: 'language_id' })
  language: LanguageEntity;

  @Column({ name: 'name', nullable: true })
  name: string;

  @Column({ type: 'text', name: 'description', nullable: true })
  description: string;
}
