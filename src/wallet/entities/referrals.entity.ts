import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity({ name: 'referrals' })
export class Referral {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  external_system_id: number;

  @Column({ type: 'int' })
  program_id: number;

  @Column({ type: 'int' })
  referrer_id: number;

  @Column({ type: 'int' })
  referee_id: number;

  @Column({ type: 'int', nullable: true })
  referrer_points: number;

  @Column({ type: 'int', nullable: true })
  referee_points: number;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @ManyToOne(() => BusinessUnit)
  @JoinColumn({ name: 'business_unit_id' })
  business_unit: BusinessUnit;
}
