import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Reward {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenant_id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column('int')
  points_required: number;

  @Column({ default: true })
  isActive: boolean;

  @Column()
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @Column()
  updated_by: number;
  
  @UpdateDateColumn()
  updated_at: Date;
}
