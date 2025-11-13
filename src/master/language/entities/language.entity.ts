import { BaseEntity } from 'src/core/entities/base.entity';
import { Column, Entity } from 'typeorm';

@Entity('language', {
  orderBy: {
    priority: 'DESC',
    name: 'ASC',
  },
})
export class LanguageEntity extends BaseEntity {
  @Column()
  name: string;

  @Column({ unique: true })
  code: string;

  @Column({ nullable: true })
  flag: string;

  @Column({ default: 0 })
  priority: number;
}
