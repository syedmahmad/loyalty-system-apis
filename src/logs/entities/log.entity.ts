import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('logs')
export class Log {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('json')
  requestBody: string;

  @Column('longtext', { nullable: true })
  responseBody: string;

  @Column('text')
  url: string;

  @Column('text')
  method: string;

  @Column('int')
  statusCode: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
