import { ModelEntity } from 'src/model/entities/model.entity';
import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('makes', {
  orderBy: {
    name: 'ASC',
  },
})
@Index('idx_makes_name', ['name'])
@Index('idx_makes_nameAr', ['nameAr'])
@Index('idx_makes_makeId', ['makeId'])
export class MakeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, type: 'int', name: 'make_id' })
  makeId: number;

  @Column({ default: '' })
  name: string;

  @Column({ nullable: true, name: 'name_ar' })
  nameAr: string;

  @Column({ type: 'int', default: 1 })
  active: number;

  @Column({ type: 'text', nullable: true })
  logo: string;

  @OneToMany(() => ModelEntity, (model) => model.make)
  models: ModelEntity[];
}
