import { Module } from '@nestjs/common';
import { LogService } from './log.service';
import { LoggingInterceptor } from './logging.interceptor';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GateWayLog } from './entities/log.entity';
import { NewrelicLoggerService } from '../common/services/newrelic-logger.service';

@Module({
  imports: [TypeOrmModule.forFeature([GateWayLog])],
  providers: [LogService, LoggingInterceptor, NewrelicLoggerService],
  controllers: [],
  exports: [LogService, LoggingInterceptor, NewrelicLoggerService],
})
export class GateWayLogModule {}
