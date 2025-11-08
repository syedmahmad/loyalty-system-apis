import { v4 as uuidv4 } from 'uuid';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
  ManyToOne,
  JoinColumn,
  // ManyToMany,
  // JoinTable,
  OneToMany,
} from 'typeorm';
import { CountryEntity } from 'src/master/country/entities/country.entity';
// import { LanguageEntity } from 'src/master/language/entities/language.entity';
// import { CurrencyEntity } from 'src/master/currency/entities/currency.entity';
import { TenantLanguageEntity } from './tenant-language.entity';
import { TenantCurrencyEntity } from './tenant-currency.entity';

@Entity()
export class Tenant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ unique: true })
  domain: string; // e.g. tenant1.yourapp.com

  @Column({ nullable: true })
  currency: string;

  @Column({
    type: 'char',
    length: 36,
    // unique: true,
  })
  uuid: string = uuidv4();

  @BeforeInsert()
  assignUuid() {
    if (!this.uuid) {
      this.uuid = uuidv4();
    }
  }

  @Column()
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @Column()
  updated_by: number;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'int', default: 1 })
  status: number; // 1 = active, 0 = inactive

  @ManyToOne(() => CountryEntity, { eager: true })
  @JoinColumn({ name: 'country_id' })
  country: CountryEntity;

  @OneToMany(() => TenantLanguageEntity, (tl) => tl.tenant, {
    cascade: true,
  })
  languages: TenantLanguageEntity[];

  @OneToMany(() => TenantCurrencyEntity, (tc) => tc.tenant, {
    cascade: true,
  })
  currencies: TenantCurrencyEntity[];
}
