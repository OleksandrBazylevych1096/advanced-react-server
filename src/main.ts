import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import { join } from 'path';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  app.use(cookieParser());
  app.use('/static', express.static(join(__dirname, '..', 'static')));

  if ((configService.get<string>('TRUST_PROXY') || '').toLowerCase() === 'true') {
    (app as any).set('trust proxy', 1);
  }

  const corsOrigins = (
    configService.get<string>('CORS_ORIGINS') ||
    configService.get<string>('FRONTEND_URL') ||
    ''
  )
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins.length
      ? (origin, cb) => {
          if (!origin || corsOrigins.includes(origin)) return cb(null, true);
          return cb(new Error('Not allowed by CORS'), false);
        }
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
}

bootstrap();
