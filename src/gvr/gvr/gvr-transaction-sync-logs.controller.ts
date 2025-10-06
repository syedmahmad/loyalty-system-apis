import { Controller, Post, Body } from '@nestjs/common';
import { GVRTransactionSyncLogsService } from './gvr-transaction-sync-logs.service';

@Controller('gvr-transaction-sync-logs')
export class GVRTransactionSyncLogsController {
  constructor(private readonly gvrService: GVRTransactionSyncLogsService) {}

  @Post()
  async create(@Body() dto: any) {
    return this.gvrService.create(dto);
  }
}
