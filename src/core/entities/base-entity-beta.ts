import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export abstract class BaseEntityBeta {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'uuid', type: 'uuid', unique: true, generated: 'uuid' })
  uuid: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'created_by', nullable: true })
  createdBy: string;

  @ManyToOne('User', { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdByUser: any;

  @Column({ name: 'updated_by', nullable: true })
  updatedBy: string;

  @ManyToOne('User', { nullable: true })
  @JoinColumn({ name: 'updated_by' })
  updatedByUser: any;

  @DeleteDateColumn({ default: null, nullable: true, name: 'deleted_at' })
  deletedAt: Date;
}
