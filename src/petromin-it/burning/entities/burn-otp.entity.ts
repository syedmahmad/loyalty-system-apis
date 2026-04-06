import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Customer } from 'src/customers/entities/customer.entity';

/**
 * burn_otps — short-lived OTP records for the burn OTP flow.
 *
 * Lifecycle:
 *   1. App calls POST /burning/otp/generate → row created (used = 0)
 *   2. Customer reads OTP on screen, gives it to the workshop cashier
 *   3. MAC calls POST /burning/otp/verify  → used = 1, used_at = now
 *      → returns wallet balance so MAC can proceed with point selection
 *   4. Expired rows (expires_at < now) are cleaned up by the scheduler
 */
@Entity('burn_otps')
export class BurnOtp {
  @PrimaryGeneratedColumn()
  id: number;

  // 6-digit numeric OTP shown to the customer on the app
  @Column({ type: 'char', length: 6 })
  otp: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column()
  customer_id: number;

  @Column()
  tenant_id: number;

  @Column()
  business_unit_id: number;

  // 0 = active (not yet used), 1 = consumed (one-time use)
  @Column({ type: 'tinyint', default: 0 })
  used: number;

  // When this OTP expires — set at generation time based on tenant's otp_burn_ttl_minutes
  @Column({ type: 'datetime' })
  expires_at: Date;

  @CreateDateColumn()
  created_at: Date;

  // Scopes this OTP to a specific pending transaction (wallet_transaction.uuid).
  // Prevents a valid OTP from being replayed on a different transaction.
  @Column({ type: 'char', length: 36, nullable: true, default: null })
  transaction_uuid: string | null;

  // Filled when MAC successfully verifies — audit trail
  @Column({ type: 'datetime', nullable: true })
  used_at: Date | null;
}
