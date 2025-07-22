import { Customer } from 'src/customers/entities/customer.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('qr_codes')
export class QrCode {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Customer, { eager: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ unique: true })
  short_id: string;

  @Column({ type: 'text', nullable: true })
  qr_code_base64: string;

  @CreateDateColumn()
  created_at: Date;
}
