import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { User } from 'src/users/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Unique,
  JoinColumn,
} from 'typeorm';

export enum PendingMethod {
  NONE = 'none',
  FIXED_DAYS = 'fixed_days',
}

export enum ExpirationMethod {
  NONE = 'none',
  FIXED_DAYS = 'fixed_days',
  END_OF_MONTH = 'end_of_month',
  END_OF_YEAR = 'end_of_year',
  ANNUAL_DATE = 'annual_date',
}

@Entity()
@Unique(['business_unit']) // Ensures one settings row per tenant
export class WalletSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => BusinessUnit, { nullable: true })
  @JoinColumn({ name: 'business_unit_id' })
  business_unit: BusinessUnit;

  @Column({ type: 'enum', enum: PendingMethod, default: PendingMethod.NONE })
  pending_method: PendingMethod;

  @Column({ type: 'int', nullable: true })
  pending_days: number;

  @Column({
    type: 'enum',
    enum: ExpirationMethod,
    default: ExpirationMethod.NONE,
  })
  expiration_method: ExpirationMethod;

  @Column({ type: 'varchar', nullable: true })
  expiration_value: string; // Can be number of days or 'MM-DD' (e.g. '12-31')

  @Column({ default: false })
  allow_negative_balance: boolean;

  @ManyToOne(() => User) // Replace with your admin entity
  created_by: User;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
