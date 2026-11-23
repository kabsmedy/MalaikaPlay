import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Album, AudioLines, Disc3, Heart, Home, Library, ListMusic, LoaderCircle, LogOut, Menu, Music2, Pause, Play, Plus, Radio, Search, SkipBack, SkipForward, SlidersHorizontal, Volume2, X, Shuffle, Repeat, FolderOpen, Headphones, Sparkles } from 'lucide-react';
import { getCurrentUser, getTrending, mediaUrl, searchOnline, signOut, uploadProfilePhoto, type AuthUser, type OnlineTrack } from './lib/api';
import { chooseMusicFolder, restoreHandle, scanFolder, type LocalTrack } from './lib/localMusic';
import AuthScreen from './components/AuthScreen';
import './music.css';

type Track = (LocalTrack | OnlineTrack) & { source?: 'local' | 'online' };
type SavedTrack = {
  id: string; title: string; artist: string; album?: string | null; duration: number;
  artwork?: string | null; source: 'local' | 'online'; provider?: 'audius' | 'jamendo' | 'spotify';
  providerId?: string; streamUrl?: string | null; permalink?: string | null;
  license?: string | null; downloadable?: boolean; downloadUrl?: string | null;
};
type Playlist = { id: string; name: string; tracks: SavedTrack[] };
type AlbumGroup = { key: string; name: string; artist: string; tracks: Track[] };
type Provider = 'all' | 'audius' | 'jamendo' | 'spotify';
const pageSizeFor = (provider: Provider) => provider === 'spotify' ? 10 : 30;
const pageHasMore = (count: number, provider: Provider, offset: number) =>
  count >= pageSizeFor(provider) && (provider !== 'spotify' || offset < 1000);

const fmt = (seconds: number) => !Number.isFinite(seconds) || seconds <= 0
  ? '0:00'
  : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const GENRES = [
  { label: 'Afrobeats', tag: 'afrobeat' }, { label: 'Amapiano', tag: 'amapiano' },
  { label: 'Blues', tag: 'blues' }, { label: 'Classical', tag: 'classical' },
  { label: 'Country', tag: 'country' }, { label: 'Dance', tag: 'dance' },
  { label: 'Electronic', tag: 'electronic' }, { label: 'Folk', tag: 'folk' },
  { label: 'Gospel', tag: 'gospel' }, { label: 'Hip-hop', tag: 'hiphop' },
  { label: 'Jazz', tag: 'jazz' }, { label: 'Lounge', tag: 'lounge' },
  { label: 'Metal', tag: 'metal' }, { label: 'Pop', tag: 'pop' },
  { label: 'Reggae', tag: 'reggae' }, { label: 'Relaxation', tag: 'relaxation' },
  { label: 'Rock', tag: 'rock' }, { label: 'R&B', tag: 'rnb' },
  { label: 'Singer-songwriter', tag: 'songwriter' }, { label: 'Soul', tag: 'soul' },
  { label: 'Soundtracks', tag: 'soundtrack' }, { label: 'World', tag: 'world' },
] as const;
const isLocal = (track: Track): track is LocalTrack => 'file' in track;
const loadPlaylists = (): Playlist[] => {
  try {
    const stored = localStorage.getItem('malaikaplay-playlists');
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed as Playlist[] : [];
  } catch (error) {
    console.warn('Could not load saved playlists', error);
    return [];
  }
};
const saveTrack = (track: Track): SavedTrack => isLocal(track)
  ? { id: track.id, title: track.title, artist: track.artist, album: track.album, duration: track.duration, artwork: track.artwork, source: 'local' }
  : { ...track, source: 'online' };

function MusicApp({ user, onUserUpdate }: { user: AuthUser; onUserUpdate: (user: AuthUser | null) => void }) {
  const [section, setSection] = useState('Home');
  const [localTracks, setLocalTracks] = useState<LocalTrack[]>([]);
  const [onlineTracks, setOnlineTracks] = useState<OnlineTrack[]>([]);
  const [queue, setQueue] = useState<Track[]>([]);
  const [current, setCurrent] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState<Provider>('all');
  const [searchMode, setSearchMode] = useState<'tracks' | 'artists'>('tracks');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [vocalOnly, setVocalOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(30);
  const [error, setError] = useState('');
  const [folderName, setFolderName] = useState('No folder connected');
  const [favourites, setFavourites] = useState<string[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>(loadPlaylists);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [playlistDialog, setPlaylistDialog] = useState<'create' | 'add' | null>(null);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistTarget, setPlaylistTarget] = useState<Track | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState('');
  const audio = useRef<HTMLAudioElement>(null);
  const fileUrl = useRef<string | null>(null);
  const playRequest = useRef(0);
  const avatarInput = useRef<HTMLInputElement>(null);

  const playTrack = (track: Track) => {
    const spotifyTrack = !isLocal(track) && track.provider === 'spotify';
    if (!isLocal(track) && !spotifyTrack && !track.streamUrl) {
      setToast('This track has no playable stream. Try another track.');
      return;
    }
    playRequest.current += 1;
    if (fileUrl.current) {
      URL.revokeObjectURL(fileUrl.current);
      fileUrl.current = null;
    }
    if (spotifyTrack) {
      audio.current?.pause();
      setCurrent(track);
      setPlaying(false);
      setDuration(track.duration || 0);
      setProgress(0);
      return;
    }
    if (isLocal(track)) {
      fileUrl.current = URL.createObjectURL(track.file);
      if (audio.current) audio.current.src = fileUrl.current;
    } else if (audio.current) {
      audio.current.src = track.streamUrl || '';
    }
    setCurrent(track);
    setPlaying(true);
    setDuration(track.duration || 0);
    setProgress(0);
  };
  const playList = (list: Track[], track: Track) => {
    setQueue(list);
    playTrack(track);
  };
  const next = () => {
    if (!queue.length) return;
    const index = queue.findIndex(track => track.id === current?.id);
    const playable = (track: Track) => isLocal(track) || track.provider === 'spotify' || Boolean(track.streamUrl);
    const candidates = queue.filter(track => track.id !== current?.id && playable(track));
    const upcoming = shuffle
      ? candidates.length ? [candidates[Math.floor(Math.random() * candidates.length)]] : []
      : queue.slice(Math.max(index + 1, 0)).filter(playable);
    if (upcoming[0]) playTrack(upcoming[0]);
    else setPlaying(false);
  };
  const prev = () => {
    if (audio.current && audio.current.currentTime > 3) {
      audio.current.currentTime = 0;
      return;
    }
    const index = queue.findIndex(track => track.id === current?.id);
    if (queue[index - 1]) playTrack(queue[index - 1]);
  };
  const toggleFav = (id: string) => setFavourites(old => old.includes(id) ? old.filter(item => item !== id) : [...old, id]);
  const addFolder = async () => {
    setError('');
    try {
      const handle = await chooseMusicFolder();
      setFolderName(handle.name);
      const tracks = await scanFolder(handle);
      setLocalTracks(tracks);
      setSection('My Music');
      setToast(`${tracks.length} tracks added from ${handle.name}`);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : 'Could not read this folder');
    }
  };
  const search = async (event?: FormEvent) => {
    event?.preventDefault();
    const term = query.trim().replace(/\bburner\s+boy\b/gi, 'Burna Boy');
    if (!term) return;
    setQuery(term);
    setSelectedGenre(null);
    setLoading(true);
    setError('');
    try {
      const result = await searchOnline(term, provider, 0, searchMode, undefined, vocalOnly);
      setOnlineTracks(result.results);
      setOffset(pageSizeFor(provider));
      setHasMore(pageHasMore(result.results.length, provider, 0));
      setSection('Search');
      if (!result.results.length) setError('No tracks found. Try another search or provider.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };
  const changeProvider = async (nextProvider: Provider) => {
    setProvider(nextProvider);
    if (section !== 'Search' || !query.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await searchOnline(query.trim(), nextProvider, 0, searchMode, selectedGenre || undefined, vocalOnly);
      setOnlineTracks(result.results);
      setOffset(pageSizeFor(nextProvider));
      setHasMore(pageHasMore(result.results.length, nextProvider, 0));
      if (!result.results.length) setError('No tracks found for this provider.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Music search failed');
    } finally {
      setLoading(false);
    }
  };
  const changeSearchMode = async (nextMode: 'tracks' | 'artists') => {
    setSearchMode(nextMode);
    setSelectedGenre(null);
    if (section !== 'Search' || !query.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await searchOnline(query.trim(), provider, 0, nextMode, undefined, vocalOnly);
      setOnlineTracks(result.results);
      setOffset(pageSizeFor(provider));
      setHasMore(pageHasMore(result.results.length, provider, 0));
      if (!result.results.length) setError(`No ${nextMode} found for this search.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Music search failed');
    } finally {
      setLoading(false);
    }
  };
  const discoverTerm = async (term: string) => {
    setQuery(term);
    setSelectedGenre(null);
    setSearchMode('tracks');
    setSection('Search');
    setLoading(true);
    setError('');
    try {
      const result = await searchOnline(term, provider, 0, 'tracks', undefined, vocalOnly);
      setOnlineTracks(result.results);
      setOffset(pageSizeFor(provider));
      setHasMore(pageHasMore(result.results.length, provider, 0));
      if (!result.results.length) setError(`No tracks found for ${term}. Try another mood or provider.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Music discovery failed');
    } finally {
      setLoading(false);
    }
  };
  const discoverGenre = async (label: string, tag: string) => {
    setQuery(label);
    setSelectedGenre(tag);
    setSearchMode('tracks');
    setSection('Search');
    setLoading(true);
    setError('');
    try {
      const result = await searchOnline(label, provider, 0, 'tracks', tag, vocalOnly);
      setOnlineTracks(result.results);
      setOffset(pageSizeFor(provider));
      setHasMore(pageHasMore(result.results.length, provider, 0));
      if (!result.results.length) setError(`No ${label} tracks found in the selected catalogs. Try another category or provider.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this category');
    } finally {
      setLoading(false);
    }
  };
  const changeVocalOnly = async (enabled: boolean) => {
    setVocalOnly(enabled);
    if (section !== 'Search' || provider === 'spotify' || !query.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await searchOnline(query.trim(), provider, 0, searchMode, selectedGenre || undefined, enabled);
      setOnlineTracks(result.results);
      setOffset(pageSizeFor(provider));
      setHasMore(pageHasMore(result.results.length, provider, 0));
      if (!result.results.length) setError('No matching vocal tracks found. Try disabling the vocal filter or choosing another source.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the vocal filter');
    } finally {
      setLoading(false);
    }
  };
  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError('');
    try {
      const result = section === 'Search' ? await searchOnline(query, provider, offset, searchMode, selectedGenre || undefined, vocalOnly) : await getTrending(offset);
      setOnlineTracks(old => {
        const seen = new Set(old.map(track => track.id));
        return [...old, ...result.results.filter(track => !seen.has(track.id))];
      });
      const requestOffset = offset;
      const resultProvider = section === 'Search' ? provider : 'all';
      setOffset(value => value + pageSizeFor(resultProvider));
      setHasMore(pageHasMore(result.results.length, resultProvider, requestOffset));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load more music');
    } finally {
      setLoadingMore(false);
    }
  };
  const addPlaylist = () => {
    setPlaylistName('');
    setPlaylistTarget(null);
    setPlaylistDialog('create');
  };
  const createPlaylist = (event: FormEvent) => {
    event.preventDefault();
    const name = playlistName.trim();
    if (!name) return;
    const targetTrack = playlistTarget;
    const playlist = { id: `playlist:${Date.now()}`, name, tracks: targetTrack ? [saveTrack(targetTrack)] : [] };
    setPlaylists(old => [...old, playlist]);
    if (!targetTrack) {
      setSelectedPlaylist(playlist.id);
      setSection('Playlists');
    }
    setPlaylistDialog(null);
    setPlaylistTarget(null);
    setToast(`Created "${playlist.name}"`);
  };
  const addToPlaylist = (track: Track) => {
    setPlaylistTarget(track);
    setPlaylistName('');
    setPlaylistDialog(playlists.length ? 'add' : 'create');
  };
  const addTrackToPlaylist = (playlistId: string) => {
    if (!playlistTarget) return;
    const target = playlists.find(item => item.id === playlistId);
    if (!target) return;
    setPlaylists(old => old.map(item => item.id === playlistId && !item.tracks.some(saved => saved.id === playlistTarget.id)
      ? { ...item, tracks: [...item.tracks, saveTrack(playlistTarget)] }
      : item));
    setPlaylistDialog(null);
    setPlaylistTarget(null);
    setToast(target.tracks.some(saved => saved.id === playlistTarget.id) ? 'Track is already in this playlist' : `Added to "${target.name}"`);
  };
  const removeFromPlaylist = (track: Track) => {
    if (!activePlaylist) return;
    setPlaylists(old => old.map(item => item.id === activePlaylist.id
      ? { ...item, tracks: item.tracks.filter(saved => saved.id !== track.id) }
      : item));
  };
  const changePhoto = async (file?: File) => {
    if (!file) return;
    try {
      const result = await uploadProfilePhoto(file);
      onUserUpdate({ ...user, photoUrl: result.photoUrl });
      setToast('Profile photo updated');
    } catch (cause) {
      setToast(cause instanceof Error ? cause.message : 'Could not update profile photo');
    }
  };
  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      onUserUpdate(null);
    }
  };
  const handleEnded = () => {
    if (repeat && current && audio.current) {
      audio.current.currentTime = 0;
      setProgress(0);
      void audio.current.play().catch(cause => {
        setToast(cause instanceof Error ? `Could not replay this track: ${cause.message}` : 'Could not replay this track');
        setPlaying(false);
      });
      return;
    }
    next();
  };

  const allLocal = localTracks;
  const allTracks: Track[] = [...allLocal, ...onlineTracks];
  const albumGroups = Array.from(allTracks.reduce((groups, track) => {
    const albumName = isLocal(track) ? track.album : track.album || 'Singles';
    const key = `${track.artist}::${albumName}`;
    const group = groups.get(key) || { key, name: albumName, artist: track.artist, tracks: [] as Track[] };
    group.tracks.push(track);
    groups.set(key, group);
    return groups;
  }, new Map<string, AlbumGroup>()).values());
  const activePlaylist = playlists.find(item => item.id === selectedPlaylist);
  const playlistTracks: Track[] = activePlaylist?.tracks.flatMap<Track>(saved => {
    if (saved.source === 'local') {
      const local = allLocal.find(track => track.id === saved.id);
      return local ? [local] : [];
    }
    if (saved.provider === 'spotify' && saved.providerId) return [{ ...saved, streamUrl: null, artwork: saved.artwork || null, permalink: saved.permalink || null, downloadable: false } as OnlineTrack];
    if (!saved.streamUrl || !saved.provider) return [];
    return [{ ...saved, streamUrl: saved.streamUrl, artwork: saved.artwork || null, permalink: saved.permalink || null, downloadable: Boolean(saved.downloadable) } as OnlineTrack];
  }) || [];
  const viewTracks: Track[] = section === 'My Music' ? allLocal
    : section === 'Favourites' ? allTracks.filter(track => favourites.includes(track.id))
      : section === 'Search' ? onlineTracks
        : section === 'Playlists' ? playlistTracks
          : section === 'Albums' ? (selectedAlbum ? albumGroups.find(album => album.key === selectedAlbum)?.tracks || [] : [])
            : onlineTracks;
  const featured = onlineTracks[0];
  const heading = section === 'Home' ? 'Good music, good mood.'
    : section === 'My Music' ? 'Your music, your space.'
      : section === 'Search' ? 'Find your next favourite.'
        : section === 'Favourites' ? 'The ones you love.'
          : section === 'Playlists' ? 'Your mixes, your way.'
            : section === 'Albums' ? 'Listen by album.' : section;

  useEffect(() => {
    getTrending().then(result => {
      setOnlineTracks(result.results);
      setHasMore(result.results.length >= 30);
      setOffset(30);
    }).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load trending music'));
  }, []);
  useEffect(() => {
    localStorage.setItem('malaikaplay-playlists', JSON.stringify(playlists));
  }, [playlists]);
  useEffect(() => {
    const restore = async () => {
      const handle = await restoreHandle();
      if (!handle) return;
      setFolderName(handle.name);
      try {
        setLocalTracks(await scanFolder(handle));
      } catch {
        // Folder permissions may need to be granted again with an explicit user action.
      }
    };
    void restore();
  }, []);
  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    if (!playing || (current && !isLocal(current) && current.provider === 'spotify')) {
      playRequest.current += 1;
      element.pause();
      return;
    }
    const requestId = ++playRequest.current;
    void element.play().catch(cause => {
      if (requestId !== playRequest.current) return;
      setToast(cause instanceof Error ? `Playback could not continue: ${cause.message}` : 'Playback could not continue. Try another track.');
      setPlaying(false);
    });
  }, [playing, current]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  const TrackRow = ({ track, list }: { track: Track; list: Track[] }) => (
    <div className={`track-row ${current?.id === track.id ? 'active' : ''}`} key={track.id} onDoubleClick={() => playList(list, track)}>
      <button className="row-play" onClick={() => playList(list, track)} aria-label={`Play ${track.title}`}>
        {current?.id === track.id && playing ? <AudioLines size={16}/> : <Play size={15}/>}
      </button>
      <div className="track-cover">{track.artwork ? <img src={track.artwork} alt=""/> : <Disc3 size={20}/>}</div>
      <div className="track-info"><strong>{track.title}</strong><span>{track.artist}</span></div>
      <span className="track-album">{isLocal(track) ? track.album : track.album || track.provider}</span>
      <button className={`icon-button heart ${favourites.includes(track.id) ? 'liked' : ''}`} onClick={() => toggleFav(track.id)} aria-label="Toggle favourite">
        <Heart size={16} fill={favourites.includes(track.id) ? 'currentColor' : 'none'}/>
      </button>
      <span className="track-duration">{fmt(track.duration)}</span>
      <button className="icon-button more" title={section === 'Playlists' ? 'Remove from playlist' : 'Add to playlist'} onClick={() => section === 'Playlists' ? removeFromPlaylist(track) : addToPlaylist(track)}>
        {section === 'Playlists' ? <X size={16}/> : <Plus size={16}/>}
      </button>
    </div>
  );
  const showTracks = ['Home', 'Discover', 'My Music', 'Favourites', 'Search'].includes(section)
    || (section === 'Playlists' && !!activePlaylist) || (section === 'Albums' && !!selectedAlbum);

  return (
    <div className="app-shell">
      <audio ref={audio} onTimeUpdate={event => setProgress(event.currentTarget.currentTime)} onLoadedMetadata={event => setDuration(event.currentTarget.duration || 0)} onEnded={handleEnded} onError={() => {
        if (current && !isLocal(current) && current.provider !== 'spotify') setToast('This stream is unavailable. Try another track.');
      }}/>
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="brand"><div className="brand-mark"><AudioLines size={21}/></div><span>Malaika<span>Play</span></span><button className="mobile-close icon-button" onClick={() => setMobileNav(false)}><X/></button></div>
        <div className="side-label">MENU</div>
        <nav>
          {[{ name: 'Home', icon: Home }, { name: 'Discover', icon: Sparkles }, { name: 'My Music', icon: Library }, { name: 'Favourites', icon: Heart }].map(({ name, icon: Icon }) =>
            <button key={name} className={`nav-item ${section === name ? 'selected' : ''}`} onClick={() => { setSection(name); setMobileNav(false); }}>
              <Icon size={18}/>{name}{name === 'My Music' && localTracks.length > 0 && <small>{localTracks.length}</small>}
            </button>)}
        </nav>
        <div className="side-label library-label">YOUR COLLECTION</div>
        <nav>
          <button className={`nav-item ${section === 'Playlists' ? 'selected' : ''}`} onClick={() => { setSection('Playlists'); setSelectedPlaylist(null); setMobileNav(false); }}><ListMusic size={18}/>Playlists{playlists.length > 0 && <small>{playlists.length}</small>}</button>
          <button className={`nav-item ${section === 'Albums' ? 'selected' : ''}`} onClick={() => { setSection('Albums'); setSelectedAlbum(null); setMobileNav(false); }}><Album size={18}/>Albums</button>
        </nav>
        <div className="sidebar-bottom"><div className="folder-card"><div className="folder-icon"><FolderOpen size={18}/></div><div><strong>Local library</strong><span>{folderName}</span></div><button onClick={addFolder} title="Choose music folder"><Plus size={16}/></button></div></div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)}><Menu/></button>
          <div className="breadcrumb">MALAIKAPLAY <span>/</span> {section.toUpperCase()}</div>
          <form className="top-search" onSubmit={search}><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search songs, artists, albums..."/><kbd>ENTER</kbd></form>
          <div className="account-controls"><div className="account-meta"><strong>{user.name}</strong><span>{user.role === 'admin' ? 'Admin' : 'Member'}</span></div>
            <input ref={avatarInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={event => { void changePhoto(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }}/>
            <button className="avatar" title="Update profile photo" onClick={() => avatarInput.current?.click()}>{user.photoUrl ? <img src={mediaUrl(user.photoUrl)} alt=""/> : user.name.slice(0, 1).toUpperCase()}</button>
            <button className="icon-button signout-button" title="Sign out" aria-label="Sign out" onClick={() => void handleSignOut()}><LogOut size={17}/></button>
          </div>
        </header>
        <div className="content-scroll">
          <section className="welcome-hero"><div className="hero-image hero-one"/><div className="hero-image hero-two"/><div className="hero-shade"/>
            <div className="hero-content"><div className="eyebrow"><span/> YOUR SOUND. YOUR SPACE.</div><h1>{heading}</h1><p>Discover new sounds, revisit your favourites, and keep your own collection close.</p>
              <div className="hero-actions"><button className="primary-btn" onClick={() => {
                if (featured) playList(onlineTracks, featured);
                else if (localTracks[0]) playList(localTracks, localTracks[0]);
                else setSection('Discover');
              }}><Play size={16} fill="currentColor"/> Start listening</button><button className="glass-btn" onClick={addFolder}><FolderOpen size={16}/> Add music folder</button></div>
            </div><div className="hero-note"><Headphones size={15}/> MUSIC THAT MOVES WITH YOU</div>
          </section>
          {section === 'Home' && <>
            <div className="section-heading"><div><div className="eyebrow muted">CURATED FOR YOUR DAY</div><h2>Made for your mood</h2></div><button className="text-link" onClick={() => setSection('Discover')}>Explore music <SkipForward size={15}/></button></div>
            <div className="mood-grid">
              <button className="mood-card mood-violet" onClick={() => void discoverTerm('afrobeats')}><span>01 / FEEL THE RHYTHM</span><strong>Afrobeats<br/>energy</strong><AudioLines/></button>
              <button className="mood-card mood-amber" onClick={() => void discoverTerm('soul')}><span>02 / SLOW IT DOWN</span><strong>Soul &<br/>serenity</strong><Disc3/></button>
              <button className="mood-card mood-blue" onClick={() => void discoverTerm('hip hop')}><span>03 / FIND YOUR FLOW</span><strong>Hip-hop<br/>sessions</strong><Radio/></button>
            </div>
            <div className="section-heading tracks-heading"><div><div className="eyebrow muted">FROM THE COMMUNITY</div><h2>Trending right now</h2></div><button className="text-link" onClick={() => setSection('Discover')}>View all <SkipForward size={15}/></button></div>
          </>}
          {section === 'Discover' && <>
            <div className="section-heading discover-head"><div><div className="eyebrow muted">OPEN YOUR EARS</div><h2>Discover music</h2><p>Browse catalogs from Audius, Jamendo, and Spotify, or search for a track or artist.</p></div><div className="discovery-filters"><div className="provider-select"><SlidersHorizontal size={15}/><select aria-label="Search type" value={searchMode} onChange={event => void changeSearchMode(event.target.value as 'tracks' | 'artists')}><option value="tracks">Tracks</option><option value="artists">Artists</option></select></div><div className="provider-select"><SlidersHorizontal size={15}/><select aria-label="Music source" value={provider} onChange={event => void changeProvider(event.target.value as Provider)}><option value="all">Audius + Jamendo</option><option value="audius">Audius</option><option value="jamendo">Jamendo</option><option value="spotify">Spotify</option></select></div></div></div>
            {(provider === 'all' || provider === 'jamendo') && <label className="vocal-filter"><input type="checkbox" checked={vocalOnly} onChange={event => void changeVocalOnly(event.target.checked)}/><span>Vocal tracks only</span><small>Jamendo vocal classification</small></label>}
            <section className="genre-browser"><div className="eyebrow muted">BROWSE BY GENRE</div><div className="genre-grid">{GENRES.map(genre => <button key={genre.tag} className="genre-chip" onClick={() => void discoverGenre(genre.label, genre.tag)}>{genre.label}</button>)}</div></section>
          </>}
          {section === 'My Music' && <div className="section-heading discover-head"><div><div className="eyebrow muted">YOUR DEVICE</div><h2>My music library</h2><p>{folderName} · {localTracks.length} tracks found</p></div><button className="glass-light-btn" onClick={addFolder}><FolderOpen size={16}/> Choose folder</button></div>}
          {section === 'Favourites' && <div className="section-heading discover-head"><div><div className="eyebrow muted">SAVED BY YOU</div><h2>Your favourites</h2><p>Your most-loved tracks in one place.</p></div></div>}
          {section === 'Search' && <div className="section-heading discover-head"><div><div className="eyebrow muted">SEARCH RESULTS</div><h2>{selectedGenre ? `${query} music` : `${searchMode === 'artists' ? 'Tracks by artists matching' : 'Results for'} “${query}”`}</h2><p>Showing music from {provider === 'all' ? 'Audius and Jamendo' : provider}{selectedGenre ? ' · category browse' : ''}{provider === 'spotify' ? ' · listening opens in Spotify’s embedded player' : ''}.</p></div><div className="discovery-filters"><div className="provider-select"><SlidersHorizontal size={15}/><select aria-label="Search type" value={searchMode} onChange={event => void changeSearchMode(event.target.value as 'tracks' | 'artists')}><option value="tracks">Tracks</option><option value="artists">Artists</option></select></div><div className="provider-select"><SlidersHorizontal size={15}/><select aria-label="Music source" value={provider} onChange={event => void changeProvider(event.target.value as Provider)}><option value="all">Audius + Jamendo</option><option value="audius">Audius</option><option value="jamendo">Jamendo</option><option value="spotify">Spotify</option></select></div></div></div>}
          {section === 'Search' && (provider === 'all' || provider === 'jamendo') && <label className="vocal-filter"><input type="checkbox" checked={vocalOnly} onChange={event => void changeVocalOnly(event.target.checked)}/><span>Vocal tracks only</span><small>Jamendo vocal classification</small></label>}
          {section === 'Playlists' && <div className="section-heading discover-head"><div><div className="eyebrow muted">YOUR COLLECTION</div><h2>{activePlaylist?.name || 'Your playlists'}</h2><p>{activePlaylist ? `${activePlaylist.tracks.length} saved tracks · stored on this device` : 'Create playlists and add tracks from your library or online discovery.'}</p></div><div className="collection-actions">{activePlaylist && <button className="glass-light-btn" onClick={() => setSelectedPlaylist(null)}>All playlists</button>}<button className="primary-btn small" onClick={addPlaylist}><Plus size={15}/> New playlist</button></div></div>}
          {section === 'Albums' && <div className="section-heading discover-head"><div><div className="eyebrow muted">YOUR COLLECTION</div><h2>{selectedAlbum ? albumGroups.find(album => album.key === selectedAlbum)?.name : 'Albums'}</h2><p>{selectedAlbum ? albumGroups.find(album => album.key === selectedAlbum)?.artist : 'Browse albums from your local library and online results.'}</p></div>{selectedAlbum && <button className="glass-light-btn" onClick={() => setSelectedAlbum(null)}>All albums</button>}</div>}
          {error && <div className="notice error"><span>{error}</span><button onClick={() => setError('')}><X size={15}/></button></div>}
          {section === 'Playlists' && !activePlaylist && <div className="collection-grid">{playlists.length ? playlists.map(playlist =>
            <button className="collection-card" key={playlist.id} onClick={() => setSelectedPlaylist(playlist.id)}><div className="collection-art"><ListMusic size={25}/></div><strong>{playlist.name}</strong><span>{playlist.tracks.length} tracks</span></button>)
            : <div className="empty-state collection-empty"><div className="empty-icon"><ListMusic size={27}/></div><strong>No playlists yet</strong><p>Create a playlist, then add tracks with the plus button beside any song.</p><button className="primary-btn small" onClick={addPlaylist}><Plus size={14}/> Create playlist</button></div>}</div>}
          {section === 'Albums' && !selectedAlbum && <div className="collection-grid">{albumGroups.length ? albumGroups.map(album =>
            <button className="collection-card" key={album.key} onClick={() => setSelectedAlbum(album.key)}><div className="collection-art">{album.tracks[0]?.artwork ? <img src={album.tracks[0].artwork} alt=""/> : <Album size={25}/>}</div><strong>{album.name}</strong><span>{album.artist} · {album.tracks.length} tracks</span></button>)
            : <div className="empty-state collection-empty"><div className="empty-icon"><Album size={27}/></div><strong>No albums to show</strong><p>Load music in Discover or connect your local library to see albums here.</p><button className="primary-btn small" onClick={() => setSection('Discover')}>Discover music</button></div>}</div>}
          {showTracks && <><div className="track-table"><div className="table-head"><span>#</span><span>TITLE</span><span>ALBUM / SOURCE</span><span></span><span>TIME</span><span></span></div>
            {loading ? <div className="empty-state"><LoaderCircle className="spin"/><p>Finding your next favourite...</p></div>
              : viewTracks.length === 0 ? <div className="empty-state"><div className="empty-icon"><Music2 size={27}/></div><strong>{section === 'My Music' ? 'Your library is waiting' : section === 'Playlists' ? 'No available tracks in this playlist' : 'No tracks here yet'}</strong><p>{section === 'My Music' ? 'Choose a folder on your device to scan your music.' : section === 'Playlists' ? 'Local playlist tracks appear when their music folder is connected.' : 'Search online music or add your local music folder to get started.'}</p><button className="primary-btn small" onClick={section === 'My Music' ? addFolder : () => setSection('Discover')}>{section === 'My Music' ? 'Choose music folder' : 'Discover music'}</button></div>
                : viewTracks.map(track => <TrackRow key={track.id} track={track} list={viewTracks}/>)}
          </div>{['Home', 'Discover', 'Search'].includes(section) && hasMore && <div className="load-more-wrap"><button className="glass-light-btn" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? <LoaderCircle className="spin" size={15}/> : <Plus size={15}/>} {loadingMore ? 'Loading songs...' : 'Load more songs'}</button></div>}</>}
          {section === 'Home' && <div className="bottom-feature"><div className="feature-copy"><div className="eyebrow muted">YOUR COLLECTION, ALWAYS</div><h3>Music is better<br/>when it's yours.</h3><p>Bring your personal music library into MalaikaPlay. Your files stay on your device.</p><button className="text-link" onClick={addFolder}>Connect your library <SkipForward size={15}/></button></div><div className="feature-art"><img src="/images/malaika-portrait-casual.jpg" alt=""/><div className="feature-orb"/></div></div>}
          <footer className="footer"><span>© 2026 MalaikaPlay</span><span>Made for the love of music <span className="footer-heart">♥</span></span><span>Music catalogs: Audius, Jamendo & Spotify</span></footer>
        </div>
      </main>
      <div className="player-bar">
        <div className="now-playing">{current ? <><div className="now-art">{current.artwork ? <img src={current.artwork} alt=""/> : <Disc3/>}</div><div className="now-meta"><strong>{current.title}</strong><span>{current.artist}</span></div><button className={`icon-button heart ${favourites.includes(current.id) ? 'liked' : ''}`} onClick={() => toggleFav(current.id)}><Heart size={17} fill={favourites.includes(current.id) ? 'currentColor' : 'none'}/></button></> : <><div className="now-art empty-art"><Music2/></div><div className="now-meta"><strong>Nothing playing</strong><span>Choose a track to begin</span></div></>}</div>
        <div className={`player-center ${current && !isLocal(current) && current.provider === 'spotify' ? 'spotify-player-center' : ''}`}>
          {current && !isLocal(current) && current.provider === 'spotify'
            ? <iframe className="spotify-embed" title={`Spotify player for ${current.title}`} src={`https://open.spotify.com/embed/track/${encodeURIComponent(current.providerId)}?utm_source=generator&theme=0`} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"/>
            : <><div className="player-controls">
              <button className={`icon-button player-toggle ${shuffle ? 'enabled' : ''}`} onClick={() => setShuffle(value => !value)} title={shuffle ? 'Turn shuffle off' : 'Turn shuffle on'} aria-label="Shuffle" aria-pressed={shuffle}><Shuffle size={16}/></button>
              <button className="icon-button" onClick={prev} title="Previous"><SkipBack size={18} fill="currentColor"/></button>
              <button className="play-main" onClick={() => current && setPlaying(!playing)} title={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}</button>
              <button className="icon-button" onClick={next} title="Next"><SkipForward size={18} fill="currentColor"/></button>
              <button className={`icon-button player-toggle ${repeat ? 'enabled' : ''}`} onClick={() => setRepeat(value => !value)} title={repeat ? 'Turn repeat off' : 'Repeat current track'} aria-label="Repeat" aria-pressed={repeat}><Repeat size={16}/></button>
            </div><div className="timeline"><span>{fmt(progress)}</span><input aria-label="Track progress" type="range" min="0" max={duration || 100} value={Math.min(progress, duration || 100)} onChange={event => { if (audio.current) audio.current.currentTime = Number(event.target.value); setProgress(Number(event.target.value)); }}/><span>{fmt(duration)}</span></div></>}
        </div>
        <div className="player-right">{!(current && !isLocal(current) && current.provider === 'spotify') && <><Volume2 size={17}/><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={event => setVolume(Number(event.target.value))}/></>}</div>
      </div>
      {playlistDialog && <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) { setPlaylistDialog(null); setPlaylistTarget(null); } }}>
        <section className="playlist-dialog" role="dialog" aria-modal="true" aria-labelledby="playlist-dialog-title">
          <button className="icon-button dialog-close" aria-label="Close dialog" onClick={() => { setPlaylistDialog(null); setPlaylistTarget(null); }}><X size={18}/></button>
          <div className="eyebrow muted">YOUR COLLECTION</div>
          <h2 id="playlist-dialog-title">{playlistDialog === 'create' ? 'Create a playlist' : 'Add to playlist'}</h2>
          {playlistDialog === 'create'
            ? <form onSubmit={createPlaylist}><label htmlFor="playlist-name">Playlist name</label><input id="playlist-name" autoFocus maxLength={60} value={playlistName} onChange={event => setPlaylistName(event.target.value)} placeholder="e.g. Sunday morning" required/><div className="dialog-actions"><button type="button" className="glass-light-btn" onClick={() => { setPlaylistDialog(null); setPlaylistTarget(null); }}>Cancel</button><button type="submit" className="primary-btn small">Create playlist</button></div></form>
            : <div className="playlist-options">{playlists.map(playlist => <button key={playlist.id} onClick={() => addTrackToPlaylist(playlist.id)}><ListMusic size={17}/><span>{playlist.name}</span><small>{playlist.tracks.length} tracks</small></button>)}<button className="create-playlist-option" onClick={() => { setPlaylistName(''); setPlaylistDialog('create'); }}><Plus size={17}/><span>Create new playlist</span></button></div>}
        </section>
      </div>}
      {toast && <div className="toast"><span className="toast-dot"/>{toast}</div>}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    getCurrentUser().then(result => setUser(result.user)).catch(() => setUser(null)).finally(() => setChecking(false));
  }, []);
  if (checking) return <div className="auth-loading" aria-label="Checking your session"><span/></div>;
  if (!user) return <AuthScreen onAuthenticated={setUser}/>;
  return <MusicApp user={user} onUserUpdate={setUser}/>;
}
