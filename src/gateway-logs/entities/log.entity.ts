import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('gateway-logs')
@Index('idx_gateway-logs_url', ['url'])
@Index('idx_gateway-logs_created_at', ['createdAt'])
export class GateWayLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('longtext')
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
