import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RestyInvoicesInfo } from '../resty/entities/resty_invoices_info.entity';
import { RestyController } from 'src/petromin-it/resty/resty/resty.controller';
import { RestyService } from 'src/petromin-it/resty/resty/resty.service';
import { TransactionSyncLog } from './entities/transaction-sync-logs.entity';
// import { TransactionSyncLogsSubscriber } from './subscribers/transaction-sync-logs.subscriber';
import { VehicleServiceJob } from './entities/vehicle_service_job.entity';
import { Customer } from 'src/customers/entities/customer.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { Rule } from 'src/rules/entities/rules.entity';
import { VehicleModule } from 'src/vehicles/vehicles.module';
import { TiersModule } from 'src/tiers/tiers.module';
import { WalletModule } from 'src/wallet/wallet.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RestyInvoicesInfo,
      TransactionSyncLog,
      VehicleServiceJob,
      Customer,
      Wallet,
      Rule,
    ]),
    VehicleModule,
    TiersModule,
    NotificationModule,
    WalletModule,
  ],
  controllers: [RestyController],
  providers: [RestyService],
  // providers: [RestyService, TransactionSyncLogsSubscriber],
})
export class RestyInvoicesInfoModule {}
