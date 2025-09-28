// src/modules/resty/entities/resty_customer_profile_selection.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

export enum ProfileSelectionStatus {
  PENDING = 'pending',
  SELECTED = 'selected',
  EXPIRED = 'expired',
}

@Entity('resty_customer_profile_selection')
@Unique(['phone_number'])
export class RestyCustomerProfileSelection {
  @PrimaryGeneratedColumn()
  id: string;

  @Column({ type: 'varchar', length: 255 })
  phone_number: string;

  @Column({ type: 'json' })
  all_profiles: Record<string, any>;

  @Column({ type: 'json', nullable: true, default: null })
  selected_profile: Record<string, any>;

  @Column({
    type: 'enum',
    enum: ProfileSelectionStatus,
    default: ProfileSelectionStatus.PENDING,
  })
  status: ProfileSelectionStatus;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
