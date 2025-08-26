import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
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
}
