import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { MusicService } from './music.service';
import { AuthGuard } from '../auth/auth.guard';

class SearchQuery {
  @IsString() @MaxLength(120) q!: string;
  @IsOptional() @IsIn(['audius', 'jamendo', 'spotify', 'all']) provider: 'audius'|'jamendo'|'spotify'|'all' = 'all';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) limit = 20;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) offset = 0;
  @IsOptional() @IsIn(['tracks', 'artists']) mode: 'tracks'|'artists' = 'tracks';
  @IsOptional() @IsString() @MaxLength(50) genre?: string;
  @IsOptional() @IsIn(['true', 'false']) vocalOnly?: string;
}
@Controller('music')
@UseGuards(AuthGuard)
export class MusicController {
  constructor(private readonly music: MusicService) {}
  @Get('search') async search(@Query() query: SearchQuery) {
    if (!query.q?.trim()) throw new BadRequestException('Search query q is required');
    return this.music.search(query.q.trim(), query.provider || 'all', Math.min(Math.max(Number(query.limit) || 20, 1), 30), query.offset || 0, query.mode || 'tracks', query.genre?.trim(), query.vocalOnly !== 'false');
  }
  @Get('trending') trending(@Query('offset') offset?: string) {
    const parsedOffset = Number(offset) || 0;
    return this.music.trending(Math.min(Math.max(parsedOffset, 0), 10000));
  }
}
