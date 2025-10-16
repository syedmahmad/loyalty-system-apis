import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionSyncLog } from '../../resty/entities/transaction-sync-logs.entity';
import { RestyService } from './resty.service';
import * as jwt from 'jsonwebtoken';

@Controller('resty-invoices')
export class RestyController {
  constructor(
    // optional invoices endpoint left
    private readonly restyService: RestyService,
    @InjectRepository(TransactionSyncLog)
    private readonly txLogRepo: Repository<TransactionSyncLog>,
  ) {}

  @Post('datamart/bulk-create')
  async bulkCreate(@Req() req: Request, @Body() payload: any) {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const token = authHeader.split(' ')[1];

    const decoded: any = jwt.decode(token);
    if (!decoded || !decoded.name || decoded.name !== 'Rusty') {
      throw new UnauthorizedException('Invalid token in payload');
    }

    const customers = Array.isArray(payload?.customers)
      ? payload.customers
      : [];

    if (customers.length > 200) {
      throw new BadRequestException(
        'Cannot processed more than 200 customers data in one time. Please send chunk by chunk',
      );
    }
    const log = this.txLogRepo.create({
      status: 'pending',
      request_body: payload,
    });

    await this.txLogRepo.save(log);

    const result = await this.restyService.processDatamart(payload);

    log.response_body = result;
    await this.txLogRepo.save(log);

    return result;
  }

  /**
   * ✅ API: Get latest invoice timestamp
   */
  @Get('latest-timestamp')
  async getLatestTimestamp() {
    const timestamp = await this.restyService.getLatestTimestamp();
    return {
      success: true,
      message: timestamp
        ? 'Latest invoice timestamp retrieved successfully'
        : 'No invoices found',
      data: { latest_timestamp: timestamp },
    };
  }

  @Post('mac-sync/service-job')
  async createServiceJob(@Req() req: any, @Body() payload: any) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const token = authHeader.split(' ')[1];
    const decoded: any = jwt.decode(token);
    if (!decoded || !decoded.name || decoded.name !== 'Rusty') {
      throw new UnauthorizedException('Invalid token in payload');
    }

    try {
      await this.restyService.createVehicleServiceJob(payload);
      return { success: true, data: 'successfully create service job' };
    } catch (error) {
      throw new BadRequestException('Failed to create service job');
    }
  }
}
