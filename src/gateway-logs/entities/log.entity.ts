import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('gateway-logs')
export class GateWayLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('longtext')
  requestBody: string;

  @Column('text', { nullable: true })
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
