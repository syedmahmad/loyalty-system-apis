import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FuelType, Transmission } from './variant.enum';
import { ModelEntity } from 'src/model/entities/model.entity';

@Entity('variants', {
  orderBy: {
    name: 'ASC',
  },
})
export class VariantEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, type: 'int', name: 'variant_id' })
  variantId: number;

  @Column({ default: '' })
  name: string;

  @Column({ nullable: true, name: 'name_ar' })
  nameAr: string;

  @Column({ type: 'int', default: 1 })
  active: number;

  @Column({ type: 'int', nullable: true })
  transmission: Transmission;

  @Column({ type: 'int', nullable: true, name: 'fuel_type' })
  fuelType: FuelType;

  @ManyToOne(() => ModelEntity, (model) => model.variants)
  @JoinColumn({ name: 'model_id' })
  model: ModelEntity;
}
