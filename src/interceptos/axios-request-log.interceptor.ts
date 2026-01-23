import { Injectable, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { NewrelicLoggerService } from '../common/services/newrelic-logger.service';
import { AxiosError } from 'axios';

@Injectable()
export class AxiosLoggerInterceptor implements OnModuleInit {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly newrelicLogger: NewrelicLoggerService,
  ) {}

  onModuleInit() {
    const axios = this.httpService.axiosRef;

    // ✅ Set global Axios defaults here
    // axios.defaults.baseURL = this.configService.get<string>('API_BASE_URL');

    axios.interceptors.request.use((config) => {
      try {
        console.log('Outgoing request to:', config.url);

        // Store request start time
        config.metadata = { startTime: Date.now() };

        if (config.headers && typeof config.headers.set === 'function') {
          config.headers.set(
            'referer',
            this.configService.get('APPLICATION_REFERER_URL'),
          );
        }
      } catch (err) {
        console.error('Failed to create request log', err);
      }
      return config;
    });

    // Response interceptor to log external API calls
    axios.interceptors.response.use(
      (response) => {
        try {
          const duration =
            Date.now() - (response.config.metadata?.startTime || 0);

          this.newrelicLogger.recordLogEvent({
            method: response.config.method?.toUpperCase() || 'GET',
            url: response.config.url || '',
            query: response.config.params,
            requestHeader: response.config.headers,
            requestBody: response.config.data,
            responseHeader: response.headers,
            responseBody: response.data,
            duration,
            statusCode: response.status,
          });
        } catch (err) {
          console.error('Failed to log response to New Relic', err);
        }
        return response;
      },
      (error: AxiosError) => {
        try {
          const duration =
            Date.now() - (error.config?.metadata?.startTime || 0);

          this.newrelicLogger.recordLogEvent({
            method: error.config?.method?.toUpperCase() || 'GET',
            url: error.config?.url || '',
            query: error.config?.params,
            requestHeader: error.config?.headers,
            requestBody: error.config?.data,
            responseHeader: error.response?.headers,
            responseBody: error.response?.data || error.message,
            duration,
            statusCode: error.response?.status || 500,
          });
        } catch (err) {
          console.error('Failed to log error to New Relic', err);
        }
        return Promise.reject(error);
      },
    );
  }
}

// Extend AxiosRequestConfig to include metadata
declare module 'axios' {
  export interface AxiosRequestConfig {
    metadata?: {
      startTime: number;
    };
  }
}
