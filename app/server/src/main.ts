import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { parseCorsOrigins } from './common/cors-origins';
import { storageDriver } from './common/storage';
import { ensureStorageDir, fileUrlSecret } from './common/storage-local';

async function bootstrap() {
  // Storage is checked before anything listens: a mistyped STORAGE_DRIVER or
  // an unwritable STORAGE_DIR should stop the start, not the first upload.
  if (storageDriver() === 'local') {
    console.log(`[storage] local driver, files in ${ensureStorageDir()}`);
    fileUrlSecret();
  } else {
    console.log('[storage] supabase driver');
  }

  const app = await NestFactory.create(AppModule);

  // whitelist strips properties the DTO does not declare, so a request can
  // never smuggle extra columns into a Prisma `data` spread (several services
  // spread the DTO directly). transform runs the class-transformer decorators
  // on the DTOs, which is what turns query/body strings into numbers.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableShutdownHooks();

  app.enableCors({
    origin: parseCorsOrigins(process.env.CORS_ORIGINS),
    credentials: true,
    // Content-Disposition is not a CORS-safelisted response header, so without
    // this the evaluation PDF download can read the bytes but not the filename
    // the server chose, and falls back to rebuilding it client-side.
    exposedHeaders: ['Content-Disposition'],
  });

  // 0.0.0.0: reachable from the website's own proxy however the host computer
  // resolves "localhost". The firewall — not this — keeps port 3000 private.
  await app.listen(process.env.PORT ?? 3000, process.env.HOST ?? '0.0.0.0');
}
void bootstrap();
