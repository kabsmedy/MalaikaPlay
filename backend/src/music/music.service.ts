import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);
  private readonly audiusBase = 'https://api.audius.co/v1';
  private spotifyAccessToken: string | null = null;
  private spotifyTokenExpiresAt = 0;
  constructor(private readonly http: HttpService) {}

  private async audius(path: string, params: Record<string, string|number> = {}) {
    const headers = process.env.AUDIUS_API_KEY ? { 'x-api-key': process.env.AUDIUS_API_KEY } : {};
    const { data } = await firstValueFrom(this.http.get(`${this.audiusBase}${path}`, { params, headers, timeout: 12000 }));
    return data?.data ?? [];
  }
  async search(q: string, provider: string, limit: number, offset = 0, mode: 'tracks'|'artists' = 'tracks', genre?: string, vocalOnly = true) {
    if (provider === 'spotify') {
      const results = await this.spotifySearch(q, Math.min(limit, 10), offset, mode, genre);
      return { results, providers: { spotify: true }, notice: 'Spotify playback uses its official embedded player and is subject to Spotify account, market, and track availability.' };
    }
    const jobs: Promise<any[]>[] = [];
    if (provider === 'all' || provider === 'audius') jobs.push(this.audius('/tracks/search', { query: q, limit, offset }).then((rows) => rows.map((t: any) => ({
      id: `audius:${t.id}`, provider: 'audius', providerId: String(t.id), title: t.title || 'Untitled', artist: t.user?.name || t.user?.handle || 'Unknown artist',
      album: t.release_title || t.album?.title || null, artwork: t.artwork?.['480x480'] || t.artwork?.['150x150'] || null, duration: t.duration || 0,
      streamUrl: `${this.audiusBase}/tracks/${encodeURIComponent(t.id)}/stream`, permalink: t.permalink || null,
      license: t.license || null, downloadable: Boolean(t.downloadable),
    }))));
    if (provider === 'all' || provider === 'jamendo') jobs.push(this.jamendoSearch(q, limit, offset, mode, genre, vocalOnly));
    const settled = await Promise.allSettled(jobs);
    const results = settled.flatMap((s) => s.status === 'fulfilled' ? s.value : []);
    if (!results.length && settled.every((s) => s.status === 'rejected')) throw new ServiceUnavailableException('Music providers are temporarily unavailable. Check API configuration and try again.');
    return { results, providers: { audius: provider !== 'jamendo', jamendo: provider !== 'audius' }, notice: 'Playback and download availability are subject to each provider and track licence.' };
  }
  private async spotifySearch(q: string, limit: number, offset: number, mode: 'tracks'|'artists', genre?: string) {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException('Spotify search is not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET on the server.');
    }
    try {
      if (!this.spotifyAccessToken || Date.now() >= this.spotifyTokenExpiresAt) {
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const { data: tokenData } = await firstValueFrom(this.http.post(
          'https://accounts.spotify.com/api/token',
          new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
          { headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 12000 },
        ));
        if (!tokenData?.access_token || !tokenData?.expires_in) {
          throw new ServiceUnavailableException('Spotify did not return an access token.');
        }
        this.spotifyAccessToken = tokenData.access_token;
        this.spotifyTokenExpiresAt = Date.now() + Math.max(tokenData.expires_in - 60, 0) * 1000;
      }
      const { data } = await firstValueFrom(this.http.get('https://api.spotify.com/v1/search', {
        headers: { Authorization: `Bearer ${this.spotifyAccessToken}` },
        params: {
          q: mode === 'artists' ? `artist:${q}` : genre ? `genre:${genre}` : q,
          type: 'track', market: process.env.SPOTIFY_MARKET || 'US', limit, offset: Math.min(offset, 1000),
        },
        timeout: 12000,
      }));
      return (data?.tracks?.items || []).filter((track: any) => track?.id).map((track: any) => ({
        id: `spotify:${track.id}`, provider: 'spotify', providerId: String(track.id),
        title: track.name || 'Untitled', artist: (track.artists || []).map((artist: any) => artist.name).filter(Boolean).join(', ') || 'Unknown artist',
        album: track.album?.name || null, artwork: track.album?.images?.[0]?.url || null,
        duration: Math.floor((track.duration_ms || 0) / 1000), streamUrl: null,
        permalink: track.external_urls?.spotify || null, downloadable: false,
      }));
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.warn('Spotify catalog search unavailable');
      throw new ServiceUnavailableException('Spotify catalog search is temporarily unavailable.');
    }
  }
  private async jamendoSearch(q: string, limit: number, offset: number, mode: 'tracks'|'artists', genre?: string, vocalOnly = true) {
    const clientId = process.env.JAMENDO_CLIENT_ID;
    if (!clientId) return [];
    const { data } = await firstValueFrom(this.http.get('https://api.jamendo.com/v3.0/tracks/', { params: {
      client_id: clientId, format: 'json', ...(genre ? { tags: genre } : mode === 'artists' ? { artist_name: q } : { search: q }),
      ...(vocalOnly ? { vocalinstrumental: 'vocal' } : {}),
      type: 'single albumtrack', limit, offset,
      include: 'musicinfo', audioformat: 'mp32',
    }, timeout: 12000 }));
    return (data?.results || []).map((t: any) => ({
      id: `jamendo:${t.id}`, provider: 'jamendo', providerId: String(t.id), title: t.name || 'Untitled', artist: t.artist_name || 'Unknown artist',
      album: t.album_name || null,
      artwork: t.album_image || t.image || null, duration: t.duration || 0, streamUrl: t.audio || null,
      permalink: t.shareurl || null, license: t.license_ccurl || null, downloadable: Boolean(t.audiodownload_allowed && t.audiodownload),
      downloadUrl: t.audiodownload_allowed ? t.audiodownload : null,
    }));
  }
  async trending(offset = 0) {
    try {
      const rows = await this.audius('/tracks/trending', { limit: 30, offset });
      return { results: rows.map((t: any) => ({ id: `audius:${t.id}`, provider: 'audius', providerId: String(t.id), title: t.title, artist: t.user?.name || 'Audius artist', album: t.release_title || t.album?.title || null, artwork: t.artwork?.['480x480'] || null, duration: t.duration || 0, streamUrl: `${this.audiusBase}/tracks/${encodeURIComponent(t.id)}/stream`, permalink: t.permalink || null, downloadable: Boolean(t.downloadable) })) };
    } catch (error) { this.logger.warn('Audius trending unavailable'); return { results: [] }; }
  }
}
