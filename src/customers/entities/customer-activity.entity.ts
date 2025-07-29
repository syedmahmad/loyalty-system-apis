// customer.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class CustomerActivity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  customer_uuid: string;

  @Column()
  activity_type: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
