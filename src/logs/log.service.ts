import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Log } from './entities/log.entity';

@Injectable()
export class LogService {
  constructor(
    @InjectRepository(Log)
    private readonly logRepository: Repository<Log>,
  ) {}

  async log(logData: Partial<Log>): Promise<void> {
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

  // Cron job to remove logs older than 30 days
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async removeOldLogs() {
    const date = new Date();
    date.setDate(date.getDate() - 30);

    try {
      const result = await this.logRepository.delete({
        createdAt: LessThan(date),
      });
      console.log(`Deleted ${result.affected} old logs.`);
    } catch (error) {
      console.error('Error deleting old logs:', error);
    }
  }
}
