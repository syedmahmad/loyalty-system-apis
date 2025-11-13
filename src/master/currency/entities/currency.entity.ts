import { BaseEntity } from 'src/core/entities/base.entity';
import { Column, Entity } from 'typeorm';

@Entity('currency')
export class CurrencyEntity extends BaseEntity {
  @Column()
  name: string;

  @Column({ unique: true })
  code: string;

  @Column({ nullable: true })
  symbol: string;

  @Column({ nullable: true })
  flag: string;
}
