import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GVRTransactionSyncLog } from '../entities/gvr-transaction-sync-logs.entity';

@Injectable()
export class GVRTransactionSyncLogsService {
  constructor(
    @InjectRepository(GVRTransactionSyncLog)
    private readonly gvrRepo: Repository<GVRTransactionSyncLog>,
  ) {}

  async create(dto): Promise<GVRTransactionSyncLog> {
    const gvrLog = this.gvrRepo.create({
      status: 'pending',
      request_body: dto,
      response_body: null,
    });

    return await this.gvrRepo.save(gvrLog);
  }
}
