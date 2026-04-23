import { Injectable } from '@nestjs/common';
import * as newrelic from 'newrelic';

const KEYS_TO_BE_IGNORED = [
  'request.headers.client-secret',
  'request.headers.authorization',
  'request.body.binarySecurityToken',
  'request.body.privateKey',
  'request.body.token',
  'request.body.password',
  'response.body.token',
  'response.body.client.secret',
  'response.body.access_token',
];

@Injectable()
export class NewrelicLoggerService {
  recordLogEvent({
    method,
    url,
    query,
    requestHeader,
    requestBody,
    responseHeader,
    responseBody,
    duration,
    statusCode,
  }: {
    method: string;
    url: string;
    query?: any;
    requestHeader?: any;
    requestBody?: any;
    responseHeader?: any;
    responseBody?: any;
    duration: number;
    statusCode: number;
  }) {
    try {
      const isSuccess = statusCode >= 200 && statusCode < 300;
      const message = `${method} ${url} | ${statusCode} | ${duration}ms`;

      if (responseBody instanceof Buffer) {
        responseBody = {
          type: 'Buffer',
          length: responseBody.length,
        };
      } else if (responseBody instanceof FormData) {
        responseBody = {
          type: 'FormData',
        };
      }

      if (requestBody instanceof Buffer) {
        requestBody = {
          type: 'Buffer',
          length: requestBody.length,
        };
      } else if (requestBody instanceof FormData) {
        requestBody = {
          type: 'FormData',
        };
      }

      newrelic.recordLogEvent({
        level: isSuccess ? 'INFO' : statusCode ? 'ERROR' : 'WARN',
        message: this.sanitize({
          message,
          request: {
            headers: requestHeader,
            query: query,
            body: requestBody,
          },
          response: {
            statusCode: statusCode,
            body: responseBody,
            headers: responseHeader,
          },
        }),
      });

      // Debug log to confirm New Relic is receiving events
      console.log(`✅ New Relic log sent: ${method} ${url} | ${statusCode}`);
    } catch (error) {
      console.error('❌ Error recording New Relic log event:', error);
    }
  }

  private sanitize(
    message: Record<string, any>,
    keysToIgnore: string[] = KEYS_TO_BE_IGNORED,
  ): string {
    const safeMessage = this.deepClone(message);

    for (const path of keysToIgnore) {
      this.deleteByPath(safeMessage, path);
    }

    return JSON.stringify(safeMessage);
  }

  private deleteByPath(obj: any, path: string) {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!current) return;
      const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
      current = current[key];
    }

    if (!current) return;
    const lastKey = parts[parts.length - 1];
    delete current[/^\d+$/.test(lastKey) ? Number(lastKey) : lastKey];
  }

  private deepClone(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map((item) => this.deepClone(item));

    const clonedObj: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = this.deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
}
