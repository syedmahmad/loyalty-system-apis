import { v4 as uuidv4 } from 'uuid';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
  OneToMany,
} from 'typeorm';

@Entity('partners')
export class Partner {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36 })
  uuid: string = uuidv4();

  @BeforeInsert()
  assignUuid() {
    if (!this.uuid) {
      this.uuid = uuidv4();
    }
  }

  /** Display name, e.g. "Qitaf" or "Al Fursan" */
  @Column({ unique: true })
  name: string;

  /**
   * Machine-readable type key — drives config schema on the frontend.
   * e.g. 'QITAF' | 'AL_FURSAN'
   * Stored as varchar for easy extensibility without enum migrations.
   */
  @Column({ type: 'varchar', length: 50 })
  type: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', nullable: true })
  logo_url: string;

  /** 1 = active, 0 = inactive (soft delete) */
  @Column({ type: 'int', default: 1 })
  is_active: number;

  @Column()
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @Column()
  updated_by: number;

  @UpdateDateColumn()
  updated_at: Date;
}
