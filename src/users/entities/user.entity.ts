import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', nullable: false })
  first_name: string;

  @Column({ type: 'varchar', nullable: true })
  middle_name: string;

  @Column({ type: 'varchar', nullable: true })
  last_name: string;

  @Column({ type: 'varchar', nullable: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  mobile: string;

  @Column({ type: 'varchar', nullable: false })
  user_role: string;

  @Column({ type: 'simple-json', nullable: true })
  user_privileges: any; // use `Record<string, any>` or custom type if known

  @Column({ type: 'varchar', nullable: true })
  role_key: string;

  @Column({ type: 'varchar', nullable: true })
  created_date: string;

  @Column({ type: 'varchar', nullable: true })
  deactivate_date: string;

  @Column({ type: 'int', nullable: true })
  is_active: number;

  @Column({ type: 'varchar', length: 36 })
  uuid: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
