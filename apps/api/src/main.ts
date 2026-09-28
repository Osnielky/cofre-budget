import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser = require('cookie-parser');
import { AppModule } from './app/app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { configureTrustProxy } from './common/client-ip-throttler.guard';
import { configureBodyParsers } from './common/http/body-parsers';
import { configureSecurityHeaders } from './common/http/security-headers';
import { CloudLogger } from './common/logging/cloud-logger';
import { requestLoggingMiddleware } from './common/logging/request-logging.middleware';
import { log, errorFields, describeError } from './common/logging/log';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, bufferLogs: true });
  app.useLogger(new CloudLogger());
  // First, so every later middleware and handler runs inside the request's log context.
  app.use(requestLoggingMiddleware);
  configureTrustProxy(app);
  configureSecurityHeaders(app);
  configureBodyParsers(app);
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });
  const port = process.env.PORT || 3333;
  await app.listen(port);
  Logger.log(`🚀 API running on: http://localhost:${port}/api`);
}

process.on('unhandledRejection', (reason) =>
  log('ERROR', `Unhandled rejection: ${describeError(reason)}`, errorFields(reason)),
);
process.on('uncaughtException', (err) => {
  log('ERROR', `Uncaught exception: ${err.message}`, errorFields(err));
  process.exit(1);
});

bootstrap();
