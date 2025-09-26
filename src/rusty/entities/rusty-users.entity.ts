import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Maps to table: rusty_users
 */
@Entity({ name: 'rusty_users' })
export class RustyUser {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ name: 'type', type: 'varchar', length: 45, nullable: true })
  type: string | null;

  @Column({ name: 'email', type: 'varchar', length: 45, nullable: true })
  email: string | null;

  @Column({
    name: 'phone_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  phone_number: string | null;

  @Column({ name: 'username', type: 'varchar', length: 45, nullable: true })
  username: string | null;

  @Column({ name: 'password', type: 'varchar', length: 255, nullable: true })
  password: string | null;

  @Column({ name: 'status', type: 'int', nullable: true, default: () => '0' })
  status: number | null;

  @Column({ name: 'role', type: 'varchar', length: 45, nullable: true })
  role: string | null;

  @Column({ name: 'country', type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({ name: 'dob', type: 'varchar', length: 50, nullable: true })
  dob: string | null;

  @Column({ name: 'address', type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  created_at: Date | null;

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updated_at: Date | null;

  @Column({
    name: 'country_code',
    type: 'varchar',
    length: 10,
    nullable: true,
    default: () => "'IN'",
  })
  country_code: string | null;

  @Column({
    name: 'country_prefix',
    type: 'varchar',
    length: 10,
    nullable: true,
    default: () => "'+91'",
  })
  country_prefix: string | null;

  @Column({
    name: 'organization_id',
    type: 'varchar',
    length: 45,
    nullable: true,
  })
  organization_id: string | null;

  @Column({ name: 'orgId', type: 'varchar', length: 36, nullable: true })
  orgId: string | null;

  @Column({ name: 'passcode', type: 'varchar', length: 6, nullable: true })
  passcode: string | null;

  @Column({ name: 'device_id', type: 'varchar', length: 45, nullable: true })
  device_id: string | null;

  @Column({ name: 'badge_id', type: 'varchar', length: 50, nullable: true })
  badge_id: string | null;
}
