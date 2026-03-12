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
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { Partner } from 'src/partners/entities/partner.entity';

@Entity('tenant_partner_integrations')
@Index('idx_tpi_tenant_partner', ['tenant_id', 'partner_id'], { unique: true })
export class TenantPartnerIntegration {
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
  tenant_id: number;

  @Column()
  partner_id: number;

  @ManyToOne(() => Tenant, { eager: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => Partner, { eager: true })
  @JoinColumn({ name: 'partner_id' })
  partner: Partner;

  /** Whether this integration is actively enabled for the tenant */
  @Column({ type: 'tinyint', default: 0 })
  is_enabled: number;

  /**
   * All partner-specific config stored as a JSON object.
   * Contents differ per partner type:
   *
   * QITAF keys: environment, apiBaseUrl, branchId, terminalId,
   *             timeoutSeconds, otpValidityMinutes, pointToAmountRatio,
   *             refundPeriodDays, certificateUrl, testMsisdn, simCardSerial
   *
   * AL_FURSAN keys: environment, apiBaseUrl, partnerId, apiKey,
   *                 pointToMileRatio, timeoutSeconds
   *
   * Future partner keys: add new schema on frontend without DB changes.
   * When branches/tellers table is added later, those specific fields
   * will move to the dedicated table; remaining config stays here.
   */
  @Column({ type: 'json', nullable: true })
  configuration: Record<string, any>;

  @Column()
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @Column()
  updated_by: number;

  @UpdateDateColumn()
  updated_at: Date;
}
