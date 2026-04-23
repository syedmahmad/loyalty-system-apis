import {
  ExecutionContext,
  Injectable,
  NestInterceptor,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { LogService } from './log.service';
import { GateWayLog } from './entities/log.entity';
import { NewrelicLoggerService } from '../common/services/newrelic-logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly loggingService: LogService,
    private readonly newrelicLogger: NewrelicLoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request: Request = context.switchToHttp().getRequest();
    const response: Response = context.switchToHttp().getResponse();
    const { body, method, url, query, headers } = request;
    const startTime = Date.now();

    const statusCode = response.statusCode || 500; // Default to 500 if undefined

    // Proceed to the next handler and log the request
    return next.handle().pipe(
      tap(async (data) => {
        const duration = Date.now() - startTime;

        try {
          await this.loggingService.log({
            method,
            url,
            requestBody: JSON.stringify(body),
            responseBody: JSON.stringify(data),
            statusCode: statusCode,
          } as Partial<GateWayLog>);
        } catch (error) {
          console.error('Error saving log:', error);
        }

        // Log to New Relic
        try {
          this.newrelicLogger.recordLogEvent({
            method,
            url,
            query,
            requestHeader: headers,
            requestBody: body,
            responseHeader: response.getHeaders(),
            responseBody: data,
            duration,
            statusCode: response.statusCode,
          });
        } catch (error) {
          console.error('Error logging to New Relic:', error);
        }
      }),
    );
  }
}
