import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralController } from './referral/referral.controller';
import { ReferralService } from './referral/referral.service';
import { Customer } from 'src/customers/entities/customer.entity';
import { Referral } from 'src/wallet/entities/referrals.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Referral, Customer])],
  providers: [ReferralService],
  controllers: [ReferralController],
})
export class ReferralModule {}
