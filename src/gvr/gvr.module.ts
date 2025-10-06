import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GVRTransactionSyncLog } from './entities/gvr-transaction-sync-logs.entity';
import { GVRTransactionSyncLogsController } from './gvr/gvr-transaction-sync-logs.controller';
import { GVRTransactionSyncLogsService } from './gvr/gvr-transaction-sync-logs.service';

@Module({
  imports: [TypeOrmModule.forFeature([GVRTransactionSyncLog])],
  controllers: [GVRTransactionSyncLogsController],
  providers: [GVRTransactionSyncLogsService],
})
export class GvrTransactionModule {}
