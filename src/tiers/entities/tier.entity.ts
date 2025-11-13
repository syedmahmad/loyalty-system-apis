import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
  OneToMany,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TierLocalEntity } from './tier-local.entity';

@Entity('tiers')
export class Tier {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  tenant_id: number;

  @ManyToOne(() => BusinessUnit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_unit_id' })
  business_unit: BusinessUnit;

  @Column()
  business_unit_id: number;

  @Column('int', { default: 1 })
  level: number; // Order or rank

  @Column({ default: true })
  is_active: boolean;

  @Column({ nullable: true })
  color: string; // Optional UI field

  @Column('int')
  min_points: number;

  @Column({
    type: 'char',
    length: 36,
  })
  uuid: string;

  @BeforeInsert()
  assignUuid() {
    if (!this.uuid) {
      this.uuid = uuidv4();
    }
  }

  @Column('int')
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @Column('int')
  updated_by: number;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'int', default: 1 })
  status: number; // 1 = active, 0 = inactive

  @OneToMany(() => TierLocalEntity, (locale) => locale.tier, {
    cascade: true,
    eager: true,
  })
  locales: TierLocalEntity[];
}
