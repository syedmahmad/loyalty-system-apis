import { Injectable, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AxiosLoggerInterceptor implements OnModuleInit {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const axios = this.httpService.axiosRef;

    // ✅ Set global Axios defaults here
    // axios.defaults.baseURL = this.configService.get<string>('API_BASE_URL');

    axios.interceptors.request.use((config) => {
      try {
        console.log('Outgoing request to:', config.url);

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
  }
}
