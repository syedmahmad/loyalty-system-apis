import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { Log } from 'src/logs/entities/log.entity';
import { LogService } from '../logs/log.service';
import { NewrelicLoggerService } from '../common/services/newrelic-logger.service';

@Injectable()
export class LogVaultMiddleware implements NestMiddleware {
  constructor(
    private readonly logService: LogService,
    private readonly newrelicLogger: NewrelicLoggerService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    let responseBody: any;
    const startTime = Date.now();

    const fullPath = req.originalUrl.split('?')[0]; // remove query string

    const skip = /^\/api\/v1\/oci\/[^/]+\/pixel\/?$/.test(fullPath);

    if (skip) {
      console.log('✅ Skipping logging for tracking pixel:', fullPath);
      return next();
    }

    const originalSend = res.send;
    res.send = function (body: any) {
      try {
        responseBody = {
          data: JSON.parse(body),
        };
      } catch (error) {
        console.log('error', error);

        if (body) responseBody = { data: body };
      }

      return originalSend.call(this, body);
    };

    res.on('finish', async () => {
      const duration = Date.now() - startTime;

      try {
        await this.logService.log({
          method: req.method,
          url: req.url,
          requestBody: JSON.stringify(req.body),
          responseBody: JSON.stringify(responseBody?.data),
          statusCode: res.statusCode,
        } as Log);
      } catch (error) {
        console.error(error);
      }

      try {
        this.newrelicLogger.recordLogEvent({
          method: req.method,
          url: req.url,
          query: req.query,
          requestHeader: req.headers,
          requestBody: req.body,
          responseBody: responseBody?.data,
          duration,
          statusCode: res.statusCode,
        });
      } catch (error) {
        console.error('[LogVaultMiddleware] New Relic logging error:', error);
      }
    });

    next();
  }
}
