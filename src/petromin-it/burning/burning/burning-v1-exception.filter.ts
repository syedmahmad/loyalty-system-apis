import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class BurningV1ExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const raw = exception.getResponse() as any;

    let message: string;
    let errors: string[];

    if (typeof raw === 'object' && raw !== null) {
      if (raw.success === false) {
        // Service catch-block error: { success, message, result, errors: string }
        message = raw.message ?? 'An error occurred';
        errors = Array.isArray(raw.errors)
          ? raw.errors
          : [String(raw.errors ?? message)];
      } else if (Array.isArray(raw.message)) {
        // ValidationPipe error: { statusCode, message: string[], error }
        message = 'Validation failed';
        errors = raw.message;
      } else {
        // Raw NestJS exception: { statusCode, message: string, error }
        message = String(raw.message ?? 'An error occurred');
        errors = [message];
      }
    } else {
      message = String(raw ?? 'An error occurred');
      errors = [message];
    }

    response.status(status).json({
      success: false,
      message,
      result: null,
      errors,
    });
  }
}
