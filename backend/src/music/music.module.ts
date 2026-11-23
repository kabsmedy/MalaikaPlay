import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MusicController } from './music.controller';
import { MusicService } from './music.service';
import { AuthModule } from '../auth/auth.module';
@Module({ imports: [HttpModule, AuthModule], controllers: [MusicController], providers: [MusicService] })
export class MusicModule {}
