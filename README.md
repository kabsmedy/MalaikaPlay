# MalaikaPlay

A full-stack music player starter with local-folder playback, Audius and Jamendo discovery/streaming, optional Spotify catalog search/official embeds, a NestJS API, MySQL/TypeORM, and Docker deployment.

## Requirements
- Node.js 20+
- Docker + Docker Compose (recommended for deployment)
- A Jamendo developer `client_id` (read-only API access)
- Optional Audius API key for improved rate limits
- Optional Spotify developer app credentials for Spotify catalog search and embeds

## Quick start (Docker)
1. Copy `.env.example` to `.env`. Set unique `DB_PASSWORD`, `DB_ROOT_PASSWORD`, and `ADMIN_PASSWORD` values, then add `JAMENDO_CLIENT_ID` (and optionally `AUDIUS_API_KEY` and Spotify developer app credentials). The admin email is `kabsmedy14@gmail.com`.
2. Run `docker compose up --build -d`.
3. Open `http://localhost:8080`.

## Local development
- Backend: `cd backend && npm install && npm run start:dev` (port 4000)
- Frontend: `cd frontend && npm install && npm run dev` (port 5173)
- Set `VITE_API_URL=http://localhost:4000/api` in `frontend/.env.local`.

## Local music access
Choose **Add music folder** in the app and grant access. Browsers cannot silently scan the whole disk; MalaikaPlay only reads the folder the user explicitly selects. Folder access depends on browser support and secure context (HTTPS or localhost). Reopen/re-authorize the folder after a browser session if required by the browser.

## Online music and rights
- Audius read-only endpoints are used for search and streaming. Most read endpoints work without credentials; an API key improves rate limits. See https://docs.audius.co/api/.
- Jamendo uses its official v3 API and requires your own developer `client_id`. The API's `audiodownload_allowed` field is respected; MalaikaPlay only offers downloads when the provider says they are allowed. See https://developer.jamendo.com/v3.0/authentication and https://developer.jamendo.com/v3.0/tracks.
- Jamendo searches use the provider's full-text track, album, artist, and tag search. Vocal-only filtering is enabled by default for Jamendo and can be turned off in Discover. Jamendo requires your own developer `client_id`; the API's `audiodownload_allowed` field is respected. See https://developer.jamendo.com/v3.0/authentication and https://developer.jamendo.com/v3.0/tracks.
- Spotify catalog search is optional and requires server-side `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`, plus a two-letter `SPOTIFY_MARKET`. Spotify tracks play through Spotify's official embed, not as free audio streams in MalaikaPlay. Playback depends on Spotify's track, market, account, and embed rules; the Web Playback SDK requires Spotify Premium. See https://developer.spotify.com/documentation/web-api/reference/search, https://developer.spotify.com/documentation/embeds, and https://developer.spotify.com/documentation/web-playback-sdk.
- Discover supports genre-tag browsing, artist-name searches, and paged track results from these provider catalogs. Vocal filtering is available only where a provider supplies vocal metadata. It cannot guarantee coverage of every artist or song worldwide; playback availability and permissions remain controlled by each provider and track.
- Availability, stream URLs and playback rights are controlled by each provider and track's licence/terms. This app does not scrape or bypass other streaming services.

## Production checklist
- Use HTTPS (required for folder picker outside localhost).
- Set strong database credentials and a unique `ADMIN_PASSWORD`; do not commit `.env` or share the bootstrap password.
- Set `DB_SYNCHRONIZE=false`; run reviewed migrations before production. TypeORM synchronize is disabled by default.
- Configure CORS to the exact frontend origin.
- Back up MySQL and the `malaika_uploads` volume; profile images are stored there.
- Authentication uses HTTP-only, same-site session cookies and hashed passwords. Use HTTPS in production.
- Add your own privacy policy, terms and provider attribution requirements before public launch.

## Project structure
- `frontend/` React + TypeScript + Vite application
- `backend/` NestJS API and provider adapters
- `docker-compose.yml` production-style local stack

## Current implementation scope
The current starter implements responsive sign-in and signup, user/admin sessions, profile pictures, the music player with shuffle/repeat controls, folder-based local scanning and playback, paged Audius/Jamendo search/trending, optional Spotify catalog search with Spotify embeds, and provider/local album views. Playlists are saved in the current browser on the current device; local-file playlist entries become playable again when their music folder is connected. Playlists are not synced between devices. Synced favourites/history, automated test coverage, and production credentials/HTTPS still need to be added and verified before a public launch. The first run requires dependency installation and provider credentials.
