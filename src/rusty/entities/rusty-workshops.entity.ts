import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { RustyJobcard } from './rusty-jobcards.entity';

@Entity('rusty_workshops')
export class RustyWorkshop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  shop_type: string;

  @Column({ nullable: true })
  garage_code: string;

  @Column({ nullable: true })
  shop_name: string;

  @Column({ nullable: true })
  region: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  longitude: string;

  @Column({ nullable: true })
  latitude: string;

  @Column({ nullable: true })
  geo_coordinates: string;

  @OneToMany(() => RustyJobcard, (jobcard) => jobcard.workshop)
  jobcards: RustyJobcard[];
}
