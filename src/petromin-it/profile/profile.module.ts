import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerProfileService } from './profile/profile.service';
import { CustomerProfileController } from './profile/profile.controller';
import { Customer } from 'src/customers/entities/customer.entity';
import { Log } from 'src/logs/entities/log.entity';
import { CustomerModule } from 'src/customers/customer.module';
import { OciModule } from 'src/oci/oci.module';
import { Referral } from 'src/wallet/entities/referrals.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { CouponsModule } from 'src/coupons/coupons.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, Log, Referral, Wallet]),
    CustomerModule,
    OciModule,
    CouponsModule,
  ],
  controllers: [CustomerProfileController],
  providers: [CustomerProfileService],
})
export class CustomerProfileModule {}
