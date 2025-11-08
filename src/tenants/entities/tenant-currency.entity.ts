import { CurrencyEntity } from 'src/master/currency/entities/currency.entity';
import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity('tenant_currencies')
export class TenantCurrencyEntity {
  @PrimaryColumn()
  tenant_id: number;

  @PrimaryColumn()
  currency_id: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.currencies, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => CurrencyEntity, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'currency_id' })
  currency: CurrencyEntity;
}
