import { Module } from '@nestjs/common';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { ScheduleService } from './schedule.service';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { Coupon } from 'src/coupons/entities/coupon.entity';
import { Log } from 'src/logs/entities/log.entity';
import { WalletTransaction } from 'src/wallet/entities/wallet-transaction.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { WalletSettings } from 'src/wallet/entities/wallet-settings.entity';
import { User } from 'src/users/entities/user.entity';
import { UserCoupon } from 'src/wallet/entities/user-coupon.entity';
import { WalletOrder } from 'src/wallet/entities/wallet-order.entity';

@Module({
  imports: [
    NestScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      Campaign,
      Coupon,
      Log,
      WalletTransaction,
      WalletSettings,
      Wallet,
      User,
      UserCoupon,
      WalletOrder,
    ]),
  ],
  providers: [ScheduleService, WalletService],
})
export class SchedulerModule {}
