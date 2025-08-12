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
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

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

  @Column()
  name: string; // e.g., Bronze, Silver, Gold

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
  uuid: string = uuidv4();

  @BeforeInsert()
  assignUuid() {
    if (!this.uuid) {
      this.uuid = uuidv4();
    }
  }

  @Column({ nullable: true, type: 'text' })
  private _benefits: string;

  get benefits(): string[] {
    if (!this._benefits) return [''];
    try {
      const parsed = JSON.parse(this._benefits);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [this._benefits];
    }
  }

  set benefits(value: string[] | string) {
    if (Array.isArray(value)) {
      this._benefits = JSON.stringify(value);
    } else {
      this._benefits = JSON.stringify([value]);
    }
  }

  @Column({ nullable: true })
  description: string;

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
}
