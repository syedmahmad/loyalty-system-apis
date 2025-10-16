import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RestyInvoicesInfo } from '../resty/entities/resty_invoices_info.entity';
import { RestyController } from 'src/petromin-it/resty/resty/resty.controller';
import { RestyService } from 'src/petromin-it/resty/resty/resty.service';
import { TransactionSyncLog } from './entities/transaction-sync-logs.entity';
import { TransactionSyncLogsSubscriber } from './subscribers/transaction-sync-logs.subscriber';
import { VehicleServiceJob } from './entities/vehicle_service_job.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([RestyInvoicesInfo, TransactionSyncLog, VehicleServiceJob]),
  ],
  controllers: [RestyController],
  providers: [RestyService, TransactionSyncLogsSubscriber],
})
export class RestyInvoicesInfoModule {}
