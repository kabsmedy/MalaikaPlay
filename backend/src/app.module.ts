
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MusicModule } from './music/music.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      username: process.env.DB_USERNAME || 'malaika',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'malaikaplay',
      autoLoadEntities: true,
      synchronize: process.env.DB_SYNCHRONIZE === 'true',
      migrationsRun: true,
      migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
      retryAttempts: 20,
      retryDelay: 3000,

      ssl: process.env.DB_SSL === 'true'
        ? {
            ca: readFileSync(
              process.env.DB_CA_CERT_PATH || '/etc/secrets/tidb-ca.pem',
              'utf8',
            ),
            rejectUnauthorized: true,
          }
        : undefined,
    }),
    AuthModule,
    MusicModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
