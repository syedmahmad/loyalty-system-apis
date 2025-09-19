import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MakeEntity } from 'src/make/entities/make.entity';
import { VariantEntity } from 'src/variant/entities/variant.entity';

@Entity('models', {
  orderBy: {
    name: 'ASC',
  },
})
export class ModelEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, type: 'int', name: 'model_id' })
  modelId: number;

  @Column({ default: '' })
  name: string;

  @Column({ nullable: true, name: 'name_ar' })
  nameAr: string;

  @Column({ type: 'int', nullable: true })
  year: number;

  @Column({ type: 'int', default: 1 })
  active: number;

  @ManyToOne(() => MakeEntity, (make) => make.models)
  @JoinColumn({ name: 'make_id' })
  make: MakeEntity;

  @OneToMany(() => VariantEntity, (variant) => variant.model)
  variants: VariantEntity[];
}
