import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { WalletTransaction } from 'src/wallet/entities/wallet-transaction.entity';
import { WalletOrder } from 'src/wallet/entities/wallet-order.entity';
import { LoyaltyAnalyticsController } from './analytics/analytics.controller';
import { LoyaltyAnalyticsService } from './analytics/analytics.service';
import { Coupon } from 'src/coupons/entities/coupon.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, WalletTransaction, WalletOrder, Coupon]),
  ],
  controllers: [LoyaltyAnalyticsController],
  providers: [LoyaltyAnalyticsService],
})
export class LoyaltyAnalyticsModule {}
