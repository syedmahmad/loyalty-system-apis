import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { Log } from 'src/logs/entities/log.entity';
import { LogService } from 'src/logs/log.service';

@Injectable()
export class LogVaultMiddleware implements NestMiddleware {
  constructor(private readonly logService: LogService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    let responseBody: any;

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
      // const combinedPayload = {
      //   client_ip: req.ip,
      //   clearity_id: req?.user?.id,
      //   url: req.url,
      //   http_method: req.method,
      //   request_body: req.body,
      //   // response_body: responseBody,
      //   status_code: res.statusCode,
      //   headers: req.headers,
      // };

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

      // await this.sendToExternalServer(combinedPayload);
    });

    next();
  }
}
