import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { LanguageEntity } from 'src/master/language/entities/language.entity';
import { Tenant } from './tenant.entity';

@Entity('tenant_languages')
export class TenantLanguageEntity {
  @PrimaryColumn()
  tenant_id: number;

  @PrimaryColumn()
  language_id: number;

  @ManyToOne(() => Tenant, (tenant) => tenant.languages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => LanguageEntity, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'language_id' })
  language: LanguageEntity;
}
