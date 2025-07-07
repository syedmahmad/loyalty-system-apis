import { Module } from '@nestjs/common';
import { LogService } from './log.service';
import { LoggingInterceptor } from './logging.interceptor';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Log } from './entities/log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Log])],
  providers: [LogService, LoggingInterceptor],
  controllers: [],
  exports: [LogService, LoggingInterceptor],
})
export class LogModule {}
