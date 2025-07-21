import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('qr_codes')
export class QrCode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  short_id: string;

  @Column({ type: 'text', nullable: true })
  qr_code_base64: string;

  @CreateDateColumn()
  created_at: Date;
}
