import { Module } from '@nestjs/common';
import { LogService } from './log.service';
import { LoggingInterceptor } from './logging.interceptor';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GateWayLog } from './entities/log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([GateWayLog])],
  providers: [LogService, LoggingInterceptor],
  controllers: [],
  exports: [LogService, LoggingInterceptor],
})
export class GateWayLogModule {}
