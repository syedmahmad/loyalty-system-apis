import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { WalletController } from './wallet/wallet.controller';
import { WalletService } from './wallet/wallet.service';
import { UserCoupon } from './entities/user-coupon.entity';
import { WalletSettings } from './entities/wallet-settings.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      WalletTransaction,
      UserCoupon,
      WalletSettings,
    ]),
  ],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService], // So other modules (e.g., Customer) can use it
})
export class WalletModule {}
