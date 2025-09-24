import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // // TODO: Increase HTTP server timeout
  // const server = app.getHttpServer();
  // server.setTimeout(30 * 60 * 1000); // 30 minutes in ms
  const allowedOrigins = process.env.ALLOWED_CORS_URLS?.split(',') || [];

  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  app.enableCors({
    // origin: process.env.ALLOWED_CORS_URL, // ✅ your frontend URL
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });
  await app.listen(3000);
}
bootstrap();
