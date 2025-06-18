import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('tiers')
export class Tier {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenant_id: number;  // Multi-tenant support

  @Column()
  name: string;      // Tier name (e.g., Bronze, Silver, Gold)

  @Column('int')
  min_points: number; // Minimum points required for this tier

  @Column('int')
  max_points: number; // Maximum points for this tier

  @Column({ nullable: true })
  benefits: string;  // Description of benefits (optional)

  @Column('int')
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @Column('int')
  updated_by: number;

  @UpdateDateColumn()
  updated_at: Date;
}
