import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('logs')
@Index('idx_logs_url', ['url'])
export class Log {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('json')
  requestBody: string;

  @Column('longtext', { nullable: true })
  responseBody: string;

  @Column({ type: 'varchar', length: 512 })
  url: string;

  @Column({ type: 'varchar', length: 10 })
  method: string;

  @Column('int')
  statusCode: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
