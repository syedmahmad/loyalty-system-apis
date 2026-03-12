import { v4 as uuidv4 } from 'uuid';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { TenantPartnerIntegration } from 'src/tenant-integrations/entities/tenant-partner-integration.entity';

@Entity('tenant_partner_terminals')
@Index('idx_tpt_int_branch_terminal', ['tenant_partner_integration_id', 'branch_id', 'terminal_id'], { unique: true })
export class TenantPartnerTerminal {
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

  @Column()
  tenant_partner_integration_id: number;

  @ManyToOne(() => TenantPartnerIntegration, { eager: false })
  @JoinColumn({ name: 'tenant_partner_integration_id' })
  integration: TenantPartnerIntegration;

  /** BranchId provided by STC integration team for each store */
  @Column({ type: 'varchar', length: 100 })
  branch_id: string;

  /** TerminalId provided by STC integration team for each integrated end */
  @Column({ type: 'varchar', length: 100 })
  terminal_id: string;

  /** Admin-friendly label (e.g. branch name / location) */
  @Column({ type: 'varchar', length: 255, nullable: true })
  label: string;

  /** 1 = active, 0 = inactive */
  @Column({ type: 'tinyint', default: 1 })
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
