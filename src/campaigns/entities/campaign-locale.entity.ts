import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntityBeta } from 'src/core/entities/base-entity-beta';
import { LanguageEntity } from '../../master/language/entities/language.entity';
import { Campaign } from './campaign.entity';

@Entity('locale_campaign')
export class CampaignLocalEntity extends BaseEntityBeta {
  @ManyToOne(() => Campaign, (campaign) => campaign.locales, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @ManyToOne(() => LanguageEntity, { eager: true })
  @JoinColumn({ name: 'language_id' })
  language: LanguageEntity;

  @Column({ name: 'name' })
  name: string;

  @Column({ type: 'text', name: 'description', nullable: true })
  description: string;
}
