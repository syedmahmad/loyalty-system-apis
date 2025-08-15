import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { GateWayLog } from './entities/log.entity';

@Injectable()
export class LogService {
  constructor(
    @InjectRepository(GateWayLog)
    private readonly logRepository: Repository<GateWayLog>,
  ) {}

  async log(logData: Partial<GateWayLog>): Promise<void> {
    try {
      await this.logRepository.save(logData);
    } catch (error) {
      console.error('Error saving log:', error);
    }
  }

  // Manually triggerable log cleanup
  async removeInterceptorLog() {
    const date = new Date();
    date.setDate(date.getDate() - 30);

    await this.logRepository.delete({
      createdAt: LessThan(date),
    });
  }
}
