import { BaseEntity } from 'src/core/entities/base.entity';
import { Column, Entity } from 'typeorm';

@Entity('country')
export class CountryEntity extends BaseEntity {
  @Column({ type: 'int', unique: true, name: 'country_id' })
  countryId: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  native: string;

  @Column()
  iso2: string;

  @Column()
  iso3: string;
}
