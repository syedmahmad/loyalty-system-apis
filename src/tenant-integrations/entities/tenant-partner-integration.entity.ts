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
   * Contents differ per partner type — see interfaces/ for typed shapes.
   *
   * QITAF keys:
   *   secretToken        — X-Secret-Token header value (provided by STC)
   *   authUsername       — Basic Auth username (provided by STC)
   *   authPassword       — Basic Auth password (provided by STC)
   *   apiBaseUrl         — STC Qitaf web service base URL
   *   pointToAmountRatio — SAR-to-point ratio agreed with STC
   *   refundPeriodDays   — Days before points are posted (refund window)
   *
   * Note: SSL/mTLS certs live at the infrastructure level (env vars), not here.
   * Redemption timeout (60 s) and OTP validity (3 min) are STC-mandated constants
   * hardcoded in the Qitaf service — not stored here.
   *
   * AL_FURSAN keys: environment, apiBaseUrl, partnerId, apiKey,
   *                 pointToMileRatio, timeoutSeconds
   *
   * Future partner keys: add new schema on frontend without DB changes.
   * Branch/terminal mappings live in tenant_partner_terminals table.
   */
  @Column({ type: 'json', nullable: true })
  configuration: Record<string, any>;

  /**
   * Long-lived JWT issued to the POS system for calling /qitaf/* endpoints.
   * Generated from the admin panel. No expiry — can be regenerated any time.
   */
  @Column({ type: 'text', nullable: true, default: null })
  pos_api_token: string | null;

  @Column()
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @Column()
  updated_by: number;

  @UpdateDateColumn()
  updated_at: Date;
}
