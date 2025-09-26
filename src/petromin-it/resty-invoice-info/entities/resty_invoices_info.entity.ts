import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Generated,
} from 'typeorm';

@Entity('resty_invoices_info')
export class RestyInvoicesInfo {
  @PrimaryGeneratedColumn()
  id: number; // Auto-increment numeric ID

  @Column({ type: 'char', length: 36, unique: true })
  @Generated('uuid')
  uuid: string; // UUID field stored as CHAR(36)

  @Column()
  invoice_number: string;

  @Column({ nullable: true })
  invoice_date?: string;

  @Column({ nullable: true })
  invoice_due_date?: string;

  @Column('decimal', { precision: 10, scale: 2 })
  invoice_amount: number;

  @Column({ nullable: true })
  invoice_currency?: string;

  @Column({ nullable: true })
  invoice_status?: string;

  @Column({ nullable: true })
  customer_name?: string;

  @Column({ nullable: true })
  customer_phone?: string;

  @Column({ nullable: true })
  customer_email?: string;

  @Column({ nullable: true })
  customer_address?: string;

  // Claim fields
  @Column({ nullable: true })
  claim_number?: string;

  @Column({ nullable: true })
  claim_status?: string;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  claim_amount?: number;

  @Column({ nullable: true })
  claim_date?: string;

  @Column({ nullable: true })
  claim_type?: string;

  @Column({ nullable: true })
  claim_description?: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
