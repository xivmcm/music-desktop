const isElectron = Boolean(window.electronAPI);
const APP_VERSION = '1.19.0';
document.body.classList.toggle('electron-runtime', isElectron);
document.body.classList.toggle('web-runtime', !isElectron);

const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const tracksContainer = document.getElementById('tracks-container');
const welcomeScreen = document.getElementById('welcome-screen');
const loadingIndicator = document.getElementById('loading-indicator');
const favoritesButton = document.getElementById('favorites-button');
let activeSources = { soundcloud: true, spotify: false };
let activeHomeSource = 'soundcloud';
let activeSpotifyMood = null; // Currently active mood card in Spotify tab
const spotifyMoodCache = new Map();
let spotifyMoodLoadVersion = 0;
let cachedSoundCloudDynamicTracks = null; // Cached SoundCloud time-of-day tracks
let cachedSoundCloudDynamicAt = 0;
let soundCloudDynamicLoadVersion = 0;
let homeRecommendationRotation = 0;
let homeLoadVersion = 0;
let forYouLoadVersion = 0;
const HOME_RECOMMENDATION_TTL = 12 * 60 * 1000;

// Genre chip render version — prevents stale async responses from corrupting state
let genreRenderVersion = 0;

// Audio Element
const audioPlayer = document.getElementById('audio-player');
if (audioPlayer) {
  audioPlayer.crossOrigin = 'anonymous';
}

// Bottom Player Meta Elements
const currentCover = document.getElementById('current-cover');
const currentTitle = document.getElementById('current-title');
const currentArtist = document.getElementById('current-artist');

// Control Buttons
const playButton = document.getElementById('play-button');
const playIcon = document.getElementById('play-icon');
const pauseIcon = document.getElementById('pause-icon');
const prevButton = document.getElementById('prev-button');
const nextButton = document.getElementById('next-button');

// Sliders
const progressSlider = document.getElementById('progress-slider');
const volumeSlider = document.getElementById('volume-slider');
const currentTimeText = document.getElementById('current-time');
const totalTimeText = document.getElementById('total-time');

// Mini Player DOM Elements
const miniCurrentCover = document.getElementById('mini-current-cover');
const miniCurrentTitle = document.getElementById('mini-current-title');
const miniCurrentArtist = document.getElementById('mini-current-artist');
const miniPlayButton = document.getElementById('mini-play-button');
const miniPlayIcon = document.getElementById('mini-play-icon');
const miniPauseIcon = document.getElementById('mini-pause-icon');
const miniPrevButton = document.getElementById('mini-prev-button');
const miniNextButton = document.getElementById('mini-next-button');
const miniProgressBar = document.getElementById('mini-progress-bar');
const miniProgressSlider = document.getElementById('mini-progress-slider');
const miniLikeButton = document.getElementById('mini-like-button');
const miniShuffleButton = document.getElementById('mini-shuffle-button');
const miniRepeatButton = document.getElementById('mini-repeat-button');

// A single delegated listener prevents window commands from firing twice when
// the titlebar is re-rendered or new mini-player controls are introduced.
let isTogglingMiniPlayer = false;
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-electron-action]');
  if (!button) return;

  const action = button.dataset.electronAction;
  if (action === 'toggleMiniPlayer') {
    if (isTogglingMiniPlayer) return;
    isTogglingMiniPlayer = true;
    setTimeout(() => { isTogglingMiniPlayer = false; }, 300);
  }

  if (isElectron && typeof window.electronAPI?.[action] === 'function') {
    window.electronAPI[action]();
    return;
  }

  // Browser preview fallback used by visual QA and the PWA build.
  if (!isElectron && action === 'toggleMiniPlayer') {
    document.body.classList.toggle('mini-player-active');
  }
});

if ('serviceWorker' in navigator && !isElectron) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(() => console.log('[PWA] Service worker registered'))
      .catch((err) => console.warn('[PWA] Service worker registration failed:', err.message));
  });
}

// ── Cover Image Anti-Censorship & Zero-Cost CDN Engine ───────────
const DEFAULT_TRACK_COVER_SVG = 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'><rect width=\'100\' height=\'100\' fill=\'%23222\'/><path d=\'M30 30 L70 50 L30 70 Z\' fill=\'%23444\'/></svg>';

function getOptimalCoverUrl(rawUrl, source = 'soundcloud') {
  if (!rawUrl) return DEFAULT_TRACK_COVER_SVG;
  if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.startsWith('assets/')) return rawUrl;

  let directUrl = rawUrl;
  if (directUrl.includes('-large.')) {
    directUrl = directUrl.replace('-large.', '-t500x500.');
  }

  // Primary: DuckDuckGo Image Proxy (extremely fast, stable in RF without VPN, unblocked, 0 bytes on Render)
  return `https://external-content.duckduckgo.com/iu/?u=${encodeURIComponent(directUrl)}`;
}

function getFallbackCoverUrl(rawUrl) {
  if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
    return DEFAULT_TRACK_COVER_SVG;
  }
  return `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&w=300&output=webp`;
}

// App state variables
let likedTrackIds = new Set();
let activeView = 'home'; // 'home', 'search', 'library', 'history', 'playlists', 'playlist-tracks', 'settings', 'artist'
let activePlaylistId = null;
let selectedTrackForPlaylist = null;
let activeGenreChip = null;
let originalHomeData = null;
let currentSearchPage = 1;
const maxTracksLimit = 80;

let cachedForYouData = null;

// Base Server API URL Configuration
const DEFAULT_MIRRORS = [
  'https://music-backend-iyni.onrender.com' // Primary Render backend
];
let savedBackend = localStorage.getItem('gp_backend_url');
if (savedBackend && savedBackend.includes('gwga')) {
  localStorage.removeItem('gp_backend_url');
  savedBackend = null;
}
let API_URL = savedBackend || DEFAULT_MIRRORS[0];
let BACKEND_URL = `${API_URL}/api`;

async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const upstreamSignal = options.signal;
  const abortFromUpstream = () => controller.abort();
  upstreamSignal?.addEventListener('abort', abortFromUpstream, { once: true });
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    upstreamSignal?.removeEventListener('abort', abortFromUpstream);
  }
}

async function initApiFailover() {
  const savedUrl = localStorage.getItem('gp_backend_url');
  if (savedUrl && !DEFAULT_MIRRORS.includes(savedUrl)) {
    console.log('[API Failover] Using custom user-defined API URL:', savedUrl);
    return;
  }
  console.log('[API Failover] Verifying backend mirrors...');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1500);
  const checkMirror = async (url) => {
    try {
      const response = await fetch(`${url}/api/health`, { 
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ok') return url;
      }
    } catch (e) {}
    throw new Error('Mirror offline');
  };
  try {
    const fastestMirror = await Promise.any(DEFAULT_MIRRORS.map(url => checkMirror(url)));
    clearTimeout(timeoutId);
    console.log('[API Failover] Auto-selected active mirror:', fastestMirror);
    if (fastestMirror !== API_URL) {
      API_URL = fastestMirror;
      BACKEND_URL = `${API_URL}/api`;
      localStorage.setItem('gp_backend_url', fastestMirror);
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[API Failover] Backend mirror offline/sleeping. DirectSoundCloudEngine will handle search & streams.');
  }
}

// ── Direct SoundCloud Client Engine (Zero-Cost & Anti-Block Fallback) ──────
const SC_CLIENT_IDS = [
  'UMY1dzQ68n2QbCuypNe8JOivmV2FO2Ep',
  '4tU5e13d0lE3H19F7tK3uX6xLzK8qN5P',
  'a3e059563d7fd3372b49b37f00a00bcf',
  '2t9loNfhTwxOgahBDWmll2wHtgSljiq2'
];

const DirectSoundCloudEngine = {
  clientIndex: 0,
  clientId: SC_CLIENT_IDS[0],

  getClientId() {
    return SC_CLIENT_IDS[this.clientIndex % SC_CLIENT_IDS.length];
  },

  rotateClientId() {
    this.clientIndex = (this.clientIndex + 1) % SC_CLIENT_IDS.length;
    this.clientId = SC_CLIENT_IDS[this.clientIndex];
    console.log('[Direct SC Engine] Rotated to client_id:', this.clientId);
    return this.clientId;
  },

  async search(query, limit = 20, offset = 0) {
    let attempts = 0;
    while (attempts < SC_CLIENT_IDS.length) {
      const clientId = this.getClientId();
      const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=${limit}&offset=${offset}`;
      try {
        const res = await fetchWithTimeout(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        }, 5000);
        if (res.status === 401) {
          this.rotateClientId();
          attempts++;
          continue;
        }
        if (!res.ok) throw new Error(`SC Search status: ${res.status}`);
        const data = await res.json();
        if (!data || !data.collection) return [];
        return data.collection.map(track => {
          const durSec = Math.floor((track.duration || 0) / 1000);
          const min = Math.floor(durSec / 60);
          const sec = durSec % 60;
          return {
            id: String(track.id),
            title: track.title || track.display_title || 'Unknown Track',
            artist: track.user?.username || track.user?.name || track.label_name || 'Unknown Artist',
            artistId: String(track.user?.id || ''),
            duration: `${min}:${String(sec).padStart(2, '0')}`,
            source: 'soundcloud',
            thumbnail: track.artwork_url || track.user?.avatar_url || '',
            playbackCount: track.playback_count,
            playback_count: track.playback_count,
            media: track.media
          };
        });
      } catch (err) {
        attempts++;
        if (attempts >= SC_CLIENT_IDS.length) {
          console.warn('[Direct SC Engine] Search failed for query:', query, err.message);
          return [];
        }
        this.rotateClientId();
      }
    }
    return [];
  },

  async resolveStreamUrl(track) {
    let attempts = 0;
    while (attempts < SC_CLIENT_IDS.length) {
      try {
        const clientId = this.getClientId();
        let transcodings = track.media?.transcodings;
        if (!transcodings) {
          const detailsRes = await fetchWithTimeout(`https://api-v2.soundcloud.com/tracks/${track.id}?client_id=${clientId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          }, 4000);
          if (detailsRes.ok) {
            const details = await detailsRes.json();
            transcodings = details.media?.transcodings;
          }
        }
        if (transcodings && transcodings.length > 0) {
          const chosen = transcodings.find(t => t.format?.protocol === 'progressive') || transcodings[0];
          if (chosen?.url) {
            const streamRes = await fetchWithTimeout(`${chosen.url}?client_id=${clientId}`, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            }, 4000);
            if (streamRes.status === 401) {
              this.rotateClientId();
              attempts++;
              continue;
            }
            if (streamRes.ok) {
              const streamData = await streamRes.json();
              if (streamData?.url) return streamData.url;
            }
          }
        }
      } catch (err) {
        console.warn('[Direct SC Engine] Direct stream resolution failed:', err.message);
      }
      attempts++;
      this.rotateClientId();
    }
    return null;
  },

  async getHomeSections() {
    const categories = [
      { key: 'trending', q: 'top tracks chart hits' },
      { key: 'top', q: 'popular hits soundcloud' },
      { key: 'electronic', q: 'phonk wave electronic dance' },
      { key: 'rock', q: 'rock indie alternative' },
      { key: 'pop', q: 'pop r&b acoustic chill' }
    ];
    const sections = { trending: [], top: [], electronic: [], rock: [], pop: [] };
    await Promise.allSettled(categories.map(async (cat) => {
      try {
        const tracks = await this.search(cat.q, 14, 0);
        sections[cat.key] = tracks;
      } catch (e) {}
    }));
    return sections;
  }
};


// ── Keep-Alive ping ──────────────────────────────────────────────────────────
// Pings the backend every 10 minutes so Render Free Tier never sleeps.
// Eliminates 30-90 second cold-start 502 errors after periods of inactivity.
(function startKeepAlivePing() {
  const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
  const ping = () => {
    fetch(`${BACKEND_URL}/health`)
      .then(r => r.json())
      .then(d => console.log(`[Keep-Alive] Server awake. Uptime: ${d.uptime}s`))
      .catch(e => console.warn('[Keep-Alive] Ping failed:', e.message));
  };
  ping(); // immediate ping on app launch
  setInterval(ping, PING_INTERVAL_MS);
})();

// Default Base64-encoded SVG avatars to prevent HTML template quote clash
const DEFAULT_AVATAR_54 = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="54" height="54" viewBox="0 0 54 54"><circle cx="27" cy="27" r="25" fill="#333"/><path d="M27 24a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0 4c-8 0-11 5-11 9v2h22v-2c0-4-3-9-11-9z" fill="#666"/></svg>');
const DEFAULT_AVATAR_90 = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="90" height="90" viewBox="0 0 90 90"><circle cx="45" cy="45" r="43" fill="#333"/><path d="M45 40a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0 8c-14 0-20 8-20 16v3h40v-3c0-8-6-16-20-16z" fill="#666"/></svg>');
const DEFAULT_AVATAR_100 = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#333"/><path d="M50 44a12 12 0 1 0 0-24 12 12 0 0 0 0 24zm0 8c-16 0-22 10-22 18v4h44v-4c0-8-6-18-22-18z" fill="#666"/></svg>');

// DOM Elements
const homeButton = document.getElementById('home-button');
const historyButton = document.getElementById('history-button');
const playlistsButton = document.getElementById('playlists-button');
const studioButton = document.getElementById('studio-button');
const statsButton = document.getElementById('stats-button');
const settingsButton = document.getElementById('settings-button');
const profileButton = document.getElementById('profile-button');
const profileDropdown = document.getElementById('profile-dropdown');
const profilesList = document.getElementById('profiles-list');
const createProfileBtn = document.getElementById('create-profile-btn');
const activeProfileName = document.getElementById('active-profile-name');
const shuffleButton = document.getElementById('shuffle-button');
const repeatButton = document.getElementById('repeat-button');
const playerLikeBtn = document.getElementById('player-like-btn');

const profileModal = document.getElementById('profile-modal');
const newProfileInput = document.getElementById('new-profile-input');
const cancelProfileBtn = document.getElementById('cancel-profile-btn');
const saveProfileBtn = document.getElementById('save-profile-btn');

const playlistModal = document.getElementById('playlist-modal');
const newPlaylistInput = document.getElementById('new-playlist-input');
const cancelPlaylistBtn = document.getElementById('cancel-playlist-btn');
const savePlaylistBtn = document.getElementById('save-playlist-btn');

const playlistMenu = document.getElementById('playlist-menu');
const playlistMenuList = document.getElementById('playlist-menu-list');
const searchHistoryDropdown = document.getElementById('search-history-dropdown');

// 1. Search Functionality
async function performSearch() {
  const query = searchInput.value.trim();
  if (!query) return;

  activeView = 'search';
  currentSearchPage = 1; // Reset search page
  addToSearchHistory(query);
  searchHistoryDropdown.classList.add('hidden');

  // Toggle Loading State
  welcomeScreen.classList.add('hidden');
  tracksContainer.classList.add('hidden');
  loadingIndicator.classList.remove('hidden');

  // Remove existing Load More elements
  const existingBtn = document.getElementById('load-more-btn');
  if (existingBtn) existingBtn.remove();
  const existingMsg = document.getElementById('load-more-limit-msg');
  if (existingMsg) existingMsg.remove();

  // Determine active sources
  const sources = [];
  if (activeSources.soundcloud) sources.push('soundcloud');
  if (activeSources.spotify) sources.push('spotify');
  const sourcesStr = sources.join(',');

  try {
    // Refresh likes list first so search displays correct states
    await loadLikedTracks();

    let results = [];
    let users = [];

    // Try backend search with timeout
    try {
      const response = await fetchWithTimeout(`${BACKEND_URL}/search?q=${encodeURIComponent(query)}&sources=${sourcesStr}&page=1&limit=20`, {}, 1800);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          results = data.results || [];
          users = data.users || [];
        }
      }
    } catch (e) {
      console.warn('[Search] Backend search failed or timed out. Falling back to DirectSoundCloudEngine:', e.message);
    }

    // Direct Client SoundCloud fallback if backend returned nothing or failed
    if (results.length === 0 && activeSources.soundcloud) {
      try {
        console.log('[Search] Querying DirectSoundCloudEngine for:', query);
        results = await DirectSoundCloudEngine.search(query, 20, 0);
      } catch (scErr) {
        console.error('[Search] DirectSoundCloudEngine search failed:', scErr.message);
      }
    }

    loadingIndicator.classList.add('hidden');

    // Handle user search results (only page 1)
    const usersContainer = document.getElementById('users-search-results');
    const usersRow = usersContainer ? usersContainer.querySelector('.users-search-row') : null;

    if (usersContainer && usersRow) {
      if (users && users.length > 0) {
        usersRow.innerHTML = '';
        users.forEach(user => {
          const userCard = document.createElement('div');
          userCard.className = 'user-search-card';
          userCard.dataset.userId = user._id || user.id;

          const avatarSrc = user.avatarBase64 || DEFAULT_AVATAR_54;

          userCard.innerHTML = `
            <img class="user-search-avatar" src="${avatarSrc}" alt="Avatar">
            <div class="user-search-name">${escapeHTML(user.displayName)}</div>
            <div class="user-search-username">@${escapeHTML(user.username)}</div>
          `;

          userCard.addEventListener('click', () => {
            loadFriendProfile(user._id || user.id);
          });

          usersRow.appendChild(userCard);
        });
        usersContainer.classList.remove('hidden');
      } else {
        usersContainer.classList.add('hidden');
      }
    } else if (usersContainer) {
      usersContainer.classList.add('hidden');
    }

    if (results && results.length > 0) {
      playlist = results;
      renderTracks(playlist);
      tracksContainer.classList.remove('hidden');
      updateLoadMoreButton(playlist.length); // Update pagination buttons
    } else {
      playlist = [];
      tracksContainer.innerHTML = '<div class="welcome-state"><h2>Ничего не найдено</h2><p>Попробуйте изменить поисковый запрос</p></div>';
      tracksContainer.classList.remove('hidden');
    }
    updateActiveTab('search');
  } catch (error) {
    console.error('Search error:', error);
    loadingIndicator.classList.add('hidden');
    tracksContainer.innerHTML = '<div class="welcome-state"><h2>Ошибка поиска</h2><p>Не удалось получить результаты. Проверьте подключение.</p></div>';
    tracksContainer.classList.remove('hidden');
    updateActiveTab('search');
  }
}

function updateLoadMoreButton(resultsCount) {
  const existingBtn = document.getElementById('load-more-btn');
  if (existingBtn) existingBtn.remove();
  const existingMsg = document.getElementById('load-more-limit-msg');
  if (existingMsg) existingMsg.remove();

  if (playlist.length >= maxTracksLimit) {
    const msg = document.createElement('div');
    msg.id = 'load-more-limit-msg';
    msg.className = 'load-more-limit-msg';
    msg.textContent = 'Достигнут предел результатов';
    tracksContainer.appendChild(msg);
    return;
  }

  if (activeSources.soundcloud && resultsCount >= 20) {
    const btn = document.createElement('button');
    btn.id = 'load-more-btn';
    btn.className = 'load-more-btn';
    btn.textContent = 'Показать еще';
    btn.addEventListener('click', loadMoreTracks);
    tracksContainer.appendChild(btn);
  }
}

async function loadMoreTracks() {
  const query = searchInput.value.trim();
  if (!query) return;

  const btn = document.getElementById('load-more-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner banner-spinner" style="width:12px; height:12px; border-width:1.5px; display:inline-block; vertical-align:middle; margin-right:8px;"></span>Загрузка...';
  }

  currentSearchPage += 1;

  const sources = [];
  if (activeSources.soundcloud) sources.push('soundcloud');
  if (activeSources.spotify) sources.push('spotify');
  const sourcesStr = sources.join(',');

  let newTracks = [];
  try {
    const response = await fetchWithTimeout(`${BACKEND_URL}/search?q=${encodeURIComponent(query)}&sources=${sourcesStr}&page=${currentSearchPage}&limit=20`, {}, 4500);
    if (response.ok) {
      const data = await response.json();
      if (data.status === 'success' && data.results && data.results.length > 0) {
        newTracks = data.results;
      }
    }
  } catch (e) {
    console.warn('[Search] Backend load more failed, falling back to DirectSoundCloudEngine:', e.message);
  }

  if (newTracks.length === 0 && activeSources.soundcloud) {
    try {
      newTracks = await DirectSoundCloudEngine.search(query, 20, playlist.length);
    } catch (err) {}
  }

  if (btn) btn.remove();

  if (newTracks && newTracks.length > 0) {
    playlist = playlist.concat(newTracks);
    renderTracks(newTracks, null, true);
    updateLoadMoreButton(newTracks.length);
  } else {
    updateLoadMoreButton(0);
  }
}


// 2. Render Results
function renderTracks(tracks, container = null, append = false) {
  const targetContainer = container || tracksContainer;

  let gridContainer;
  if (targetContainer === tracksContainer) {
    gridContainer = targetContainer.querySelector('.tracks-layout-grid');
    if (!gridContainer || !append) {
      targetContainer.innerHTML = '';
      gridContainer = document.createElement('div');
      gridContainer.className = 'tracks-layout-grid';
      targetContainer.appendChild(gridContainer);
    }
  } else {
    gridContainer = targetContainer;
    if (!append) {
      gridContainer.innerHTML = '';
    }
  }

  // Sync currentTrackIndex with activePlayingTrack in the current playlist
  if (activePlayingTrack) {
    currentTrackIndex = playlist.findIndex(t => t.id === activePlayingTrack.id);
  } else {
    currentTrackIndex = -1;
  }

  tracks.forEach((track, index) => {
    const card = document.createElement('div');
    const isActive = activePlayingTrack && track.id === activePlayingTrack.id;
    card.className = `track-card ${isActive ? 'active' : ''}`;
    card.setAttribute('role', 'article');

    // Correct playlist index so click events play the correct track!
    const overallIndex = append ? playlist.length - tracks.length + index : index;
    card.dataset.index = overallIndex;
    card.dataset.trackId = track.id;

    // Strict validation and fallbacks
    const trackTitle = track.title ? track.title.trim() : "Unknown Track";
    const trackArtist = track.artist ? track.artist.trim() : "Unknown Artist";
    card.setAttribute('aria-label', `${trackTitle} — ${trackArtist}`);
    const defaultSvgCover = track.source === 'local'
      ? 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'><defs><linearGradient id=\'g\' x1=\'0\' y1=\'0\' x2=\'1\' y2=\'1\'><stop stop-color=\'%23333a4a\'/><stop offset=\'1\' stop-color=\'%23181b24\'/></linearGradient></defs><rect width=\'100\' height=\'100\' rx=\'18\' fill=\'url(%23g)\'/><path d=\'M46 63V35l26-5v27\' fill=\'none\' stroke=\'%23d9dce7\' stroke-width=\'5\' stroke-linecap=\'round\'/><circle cx=\'37\' cy=\'65\' r=\'9\' fill=\'%23d9dce7\'/><circle cx=\'63\' cy=\'58\' r=\'9\' fill=\'%23d9dce7\'/></svg>'
      : DEFAULT_TRACK_COVER_SVG;
    const coverUrl = getOptimalCoverUrl(track.thumbnail, track.source);
    const fallbackCoverUrl = getFallbackCoverUrl(track.thumbnail);

    const isLiked = likedTrackIds.has(track.id);
    const heartIcon = isLiked
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;

    let actionsHTML = '';
    if (track.source === 'local' && activeView === 'library' && currentLibrarySubTab === 'local') {
      actionsHTML = `
        <button class="local-track-delete-btn" title="Удалить с устройства" aria-label="Удалить ${escapeHTML(trackTitle)} с устройства" data-id="${track.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
        </button>
      `;
    } else if (activeView === 'playlist-tracks' && activePlaylistId) {
      actionsHTML = `
        <button class="playlist-remove-track-btn" title="Удалить из плейлиста" aria-label="Удалить ${escapeHTML(trackTitle)} из плейлиста" style="background:transparent; border:none; color:var(--text-dim); cursor:pointer; padding:8px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:all 0.2s ease; z-index:20;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;
    } else {
      actionsHTML = `
        <button class="playlist-add-btn" title="Добавить в плейлист" aria-label="Добавить ${escapeHTML(trackTitle)} в плейлист">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      `;
    }

    const artistHTML = `<button class="artist-link" type="button" aria-label="Открыть исполнителя ${escapeHTML(trackArtist)}">${escapeHTML(trackArtist)}</button>`;

    const isCurrentPlaying = isActive && !audioPlayer.paused;
    const coverPlayIcon = isCurrentPlaying
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 2px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;

    const playsHTML = track.source === 'soundcloud' && (track.playbackCount !== undefined || track.playback_count !== undefined)
      ? `<span class="card-plays" title="Прослушивания"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>${formatPlaybackCount(track.playbackCount || track.playback_count)}</span>`
      : '';

    card.innerHTML = `
      <div class="track-cover-container">
        <img src="${coverUrl}" class="card-cover" alt="" loading="lazy" decoding="async" onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='${fallbackCoverUrl}';}">
        <div class="cover-overlay">
          <button class="cover-play-btn" title="Воспроизведение/Пауза" aria-label="Воспроизвести или приостановить ${escapeHTML(trackTitle)}">
            ${coverPlayIcon}
          </button>
        </div>
      </div>
      <div class="card-details">
        <div class="card-title">${escapeHTML(trackTitle)}</div>
        <div class="card-artist">${artistHTML}</div>
        <div class="card-meta">
          <span class="badge ${track.source}">
            ${track.source === 'soundcloud'
              ? `<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style="margin-right:3px"><path d="M23.95 14.47c0-2.45-1.92-4.44-4.29-4.44h-.35c-.48-2.61-2.73-4.6-5.46-4.6-2.58 0-4.73 1.83-5.32 4.26-.26-.06-.53-.09-.81-.09-2.58 0-4.67 2.09-4.67 4.67 0 .16.01.32.02.48C1.29 14.53 0 16.03 0 17.84c0 2.08 1.68 3.76 3.76 3.76h16.5c1.96 0 3.69-1.55 3.69-3.51 0-1.74-1.28-3.18-2.97-3.52z"/></svg>SC`
              : track.source === 'spotify'
              ? `<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style="margin-right:3px"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.377-1.454-5.37-1.783-8.894-.978-.335.077-.67-.134-.746-.47-.077-.335.134-.67.47-.746 3.847-.88 7.143-.51 9.814 1.127.294.18.387.563.207.857zm1.225-2.72c-.227.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.082-1.182-.413.125-.847-.107-.972-.52-.125-.413.107-.847.52-.972 3.676-1.116 8.243-.57 11.348 1.337.367.227.487.707.26 1.074zm.107-2.834C14.484 8.7 8.012 8.483 4.262 9.622c-.573.173-1.182-.154-1.355-.727-.173-.573.154-1.182.727-1.355 4.3-1.305 11.442-1.055 15.534 1.373.515.305.683.97.378 1.485-.305.515-.97.683-1.485.378z"/></svg>SP`
              : track.source === 'local'
              ? `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:3px"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>На устройстве`
              : `<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style="margin-right:3px"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>YT`}
          </span>
          <span class="card-meta-right" style="display: flex; align-items: center; gap: 8px;">
            ${playsHTML}
            <span class="card-duration">${track.duration}</span>
          </span>
        </div>
      </div>
      ${actionsHTML}
      ${track.source === 'local' ? '' : `<button class="like-btn ${isLiked ? 'liked' : ''}" aria-label="${isLiked ? 'Убрать из избранного' : 'Добавить в избранное'}" aria-pressed="${isLiked}">${heartIcon}</button>`}
    `;

    card.addEventListener('click', (e) => {
      // Don't play if clicking the like, playlist or artist link button itself
      if (e.target.closest('.like-btn') || e.target.closest('.playlist-add-btn') || e.target.closest('.playlist-remove-track-btn') || e.target.closest('.local-track-delete-btn') || e.target.closest('.artist-link')) return;

      const isCurrent = activePlayingTrack && track.id === activePlayingTrack.id;
      if (isCurrent) {
        togglePlay();
      } else {
        playTrack(overallIndex);
      }
    });

    const likeBtn = card.querySelector('.like-btn');
    if (likeBtn) {
      likeBtn.addEventListener('click', (e) => toggleLike(e, track));
    }

    const artistLink = card.querySelector('.artist-link');
    if (artistLink) {
      artistLink.addEventListener('click', (e) => {
        e.stopPropagation();
        if (track.source === 'soundcloud' && track.artistId) {
          loadArtistView(track.artistId);
        } else {
          if (searchInput) {
            searchInput.value = trackArtist;
            performSearch();
          }
        }
      });
    }

    if (track.source === 'local' && activeView === 'library' && currentLibrarySubTab === 'local') {
      const deleteBtn = card.querySelector('.local-track-delete-btn');
      deleteBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const shouldDelete = await showConfirmDialog({
          title: 'Удалить локальный трек?',
          message: `«${trackTitle}» будет удалён только из медиатеки этого устройства.`,
          confirmLabel: 'Удалить',
          danger: true
        });
        if (!shouldDelete) return;
        await deleteLocalTrack(track.id);
        showToastNotification(`«${trackTitle}» удалён с устройства`, 'success', 'Медиатека');
        loadFavorites('local');
      });
    } else if (activeView === 'playlist-tracks' && activePlaylistId) {
      const removeBtn = card.querySelector('.playlist-remove-track-btn');
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeTrackFromPlaylist(track.id);
      });
    } else {
      const addBtn = card.querySelector('.playlist-add-btn');
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showPlaylistMenu(e, track);
      });
    }

    gridContainer.appendChild(card);
  });
}

function getProfilePlayStats() {
  const scoped = localStorage.getItem(getStorageKey('stats_counts'));
  const legacy = !currentUser && currentProfile === 'Default' ? localStorage.getItem('gp_stats_counts') : null;
  try {
    return JSON.parse(scoped || legacy || '{}');
  } catch (err) {
    console.warn('[Stats] Ignoring invalid local play statistics:', err.message);
    return {};
  }
}

let splashSafetyTimer = null;

function updateSplashStatus(statusText, progressPct = 50) {
  const statusEl = document.getElementById('splash-status');
  const progressEl = document.getElementById('splash-progress');
  if (statusEl) statusEl.textContent = statusText;
  if (progressEl) progressEl.style.width = `${progressPct}%`;
}

function hideSplashScreen() {
  if (splashSafetyTimer) {
    clearTimeout(splashSafetyTimer);
    splashSafetyTimer = null;
  }
  const splashEl = document.getElementById('app-splash-screen');
  if (splashEl && !splashEl.classList.contains('fade-out')) {
    updateSplashStatus('Готово!', 100);
    setTimeout(() => {
      splashEl.classList.add('fade-out');
      setTimeout(() => {
        splashEl.style.display = 'none';
      }, 600);
    }, 300);
  }
}

function initSplashScreen() {
  const splashEl = document.getElementById('app-splash-screen');
  if (!splashEl) return;

  // Emergency Safety Timeout (10 seconds max)
  splashSafetyTimer = setTimeout(() => {
    if (splashEl && !splashEl.classList.contains('fade-out')) {
      console.warn('[Splash Screen] Emergency safety timeout (10s). Forcing app entry.');
      splashEl.classList.add('fade-out');
      setTimeout(() => splashEl.style.display = 'none', 600);
      showToastNotification('Автономный режим активен', 'info', 'Плеер');
    }
  }, 10000);
}

function showToastNotification(message, type = 'info', title = null) {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  toastContainer.removeAttribute('aria-live');
  toastContainer.removeAttribute('aria-atomic');
  toastContainer.setAttribute('role', 'region');
  toastContainer.setAttribute('aria-label', 'Уведомления');

  const typeConfigs = {
    error: {
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>',
      defaultTitle: 'Не получилось',
      class: 'toast-error',
      duration: 7000
    },
    success: {
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
      defaultTitle: 'Готово',
      class: 'toast-success',
      duration: 4000
    },
    info: {
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>',
      defaultTitle: 'GlassPlayer',
      class: 'toast-info',
      duration: 4000
    },
    warning: {
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 3.5 19h17L12 4Z"/><path d="M12 9v4M12 16h.01"/></svg>',
      defaultTitle: 'Обратите внимание',
      class: 'toast-warning',
      duration: 5500
    }
  };

  const config = typeConfigs[type] || typeConfigs.info;
  const displayTitle = title || config.defaultTitle;
  const toastKey = `${config.class}:${displayTitle}:${String(message)}`;

  const duplicate = Array.from(toastContainer.children)
    .find((item) => item.dataset.toastKey === toastKey);
  if (duplicate) duplicate.remove();
  while (toastContainer.children.length >= 4) {
    toastContainer.firstElementChild?.remove();
  }

  const toast = document.createElement('div');
  toast.className = `toast-notification ${config.class}`;
  toast.dataset.toastKey = toastKey;
  toast.style.setProperty('--toast-duration', `${config.duration}ms`);

  const iconBadge = document.createElement('div');
  iconBadge.className = 'toast-icon-badge';
  iconBadge.innerHTML = config.icon;

  const content = document.createElement('div');
  content.className = 'toast-content-body';
  content.setAttribute('role', type === 'error' ? 'alert' : 'status');
  content.setAttribute('aria-atomic', 'true');
  const titleElement = document.createElement('div');
  titleElement.className = 'toast-title';
  titleElement.textContent = String(displayTitle);
  const messageElement = document.createElement('div');
  messageElement.className = 'toast-message';
  messageElement.textContent = String(message);
  content.append(titleElement, messageElement);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'toast-close-btn';
  closeButton.setAttribute('aria-label', 'Закрыть уведомление');
  closeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';

  const progress = document.createElement('div');
  progress.className = 'toast-progress-bar';
  toast.append(iconBadge, content, closeButton, progress);

  toastContainer.appendChild(toast);
  let revealApplied = false;
  const revealToast = () => {
    if (revealApplied || !toast.isConnected) return;
    revealApplied = true;
    toast.classList.add('is-visible');
  };
  requestAnimationFrame(revealToast);
  setTimeout(revealToast, 40);

  let remaining = config.duration;
  let startedAt = Date.now();
  let hideTimeout = null;
  let dismissed = false;
  const pauseReasons = new Set();

  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(hideTimeout);
    toast.classList.remove('is-visible');
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 280);
  };
  const scheduleDismiss = () => {
    clearTimeout(hideTimeout);
    startedAt = Date.now();
    hideTimeout = setTimeout(dismiss, remaining);
  };
  const pauseDismiss = (reason) => {
    if (dismissed || pauseReasons.has(reason)) return;
    if (pauseReasons.size === 0) {
      clearTimeout(hideTimeout);
      remaining = Math.max(300, remaining - (Date.now() - startedAt));
    }
    pauseReasons.add(reason);
    toast.classList.add('is-paused');
  };
  const resumeDismiss = (reason) => {
    if (dismissed || !pauseReasons.has(reason)) return;
    pauseReasons.delete(reason);
    if (pauseReasons.size > 0) return;
    toast.classList.remove('is-paused');
    scheduleDismiss();
  };

  closeButton.addEventListener('click', dismiss);
  toast.addEventListener('mouseenter', () => pauseDismiss('hover'));
  toast.addEventListener('mouseleave', () => resumeDismiss('hover'));
  toast.addEventListener('focusin', () => pauseDismiss('focus'));
  toast.addEventListener('focusout', (event) => {
    if (!toast.contains(event.relatedTarget)) resumeDismiss('focus');
  });
  scheduleDismiss();
}

function showConfirmDialog({ title, message, confirmLabel = 'Подтвердить', cancelLabel = 'Отмена', danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'gp-confirm-overlay';
    overlay.innerHTML = `
      <div class="gp-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="gp-confirm-title" aria-describedby="gp-confirm-message">
        <div class="gp-confirm-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 4 3.5 19h17L12 4Z"/><path d="M12 9v4M12 16h.01"/></svg></div>
        <div class="gp-confirm-copy"><h2 id="gp-confirm-title"></h2><p id="gp-confirm-message"></p></div>
        <div class="gp-confirm-actions">
          <button type="button" class="gp-confirm-button cancel"></button>
          <button type="button" class="gp-confirm-button confirm ${danger ? 'danger' : 'primary'}"></button>
        </div>
      </div>
    `;
    overlay.querySelector('#gp-confirm-title').textContent = title;
    overlay.querySelector('#gp-confirm-message').textContent = message;
    const cancelButton = overlay.querySelector('.gp-confirm-button.cancel');
    const confirmButton = overlay.querySelector('.gp-confirm-button.confirm');
    cancelButton.textContent = cancelLabel;
    confirmButton.textContent = confirmLabel;

    const finish = (confirmed) => {
      document.removeEventListener('keydown', handleKeydown);
      overlay.classList.remove('is-visible');
      setTimeout(() => overlay.remove(), 180);
      resolve(confirmed);
    };
    const handleKeydown = (event) => {
      if (event.key === 'Escape') finish(false);
    };
    cancelButton.addEventListener('click', () => finish(false));
    confirmButton.addEventListener('click', () => finish(true));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(false);
    });
    document.addEventListener('keydown', handleKeydown);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-visible'));
    confirmButton.focus();
  });
}

// 4. Listeners
searchButton.addEventListener('click', performSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') performSearch();
});

// Search source states are managed dynamically inside showSearchHistory dropdown

// Local Storage Manager Helper functions
function getStorageOwnerSuffix() {
  if (currentUser) {
    const accountId = currentUser.id || currentUser._id || currentUser.username;
    return `account_${String(accountId || 'unknown').replace(/[^a-z0-9_-]/gi, '_')}`;
  }
  return currentProfile || 'Default';
}

function getStorageKey(key) {
  return `gp_${key}_${getStorageOwnerSuffix()}`;
}

// Subscriptions & Recommendations Helpers
function getFollowedArtists() {
  const scopedKey = getStorageKey('followed_artists');
  const scoped = localStorage.getItem(scopedKey);
  const legacy = !currentUser && currentProfile === 'Default' ? localStorage.getItem('gp_followed_artists') : null;
  try {
    const artists = JSON.parse(scoped || legacy || '[]');
    if (!scoped && legacy) localStorage.setItem(scopedKey, JSON.stringify(artists));
    return Array.isArray(artists) ? artists : [];
  } catch (err) {
    return [];
  }
}

function isArtistFollowed(artistId) {
  const list = getFollowedArtists();
  return list.some(a => String(a.id) === String(artistId));
}

function toggleFollowArtist(artistData) {
  let list = getFollowedArtists();
  const followed = isArtistFollowed(artistData.id);
  if (followed) {
    list = list.filter(a => String(a.id) !== String(artistData.id));
  } else {
    list.push({
      id: String(artistData.id),
      name: artistData.name,
      avatar: artistData.avatar
    });
  }
  localStorage.setItem(getStorageKey('followed_artists'), JSON.stringify(list));
  invalidateHomeRecommendations();
  return !followed;
}

function getHomeRecommendationCacheKey() {
  return `gp_home_feed_v2_${getStorageOwnerSuffix()}_${activeHomeSource}`;
}

function invalidateHomeRecommendations({ preserveCache = false } = {}) {
  cachedForYouData = null;
  forYouLoadVersion += 1;
  spotifyMoodCache.clear();
  spotifyMoodLoadVersion += 1;
  cachedSoundCloudDynamicTracks = null;
  cachedSoundCloudDynamicAt = 0;
  soundCloudDynamicLoadVersion += 1;
  if (!preserveCache) {
    const owner = getStorageOwnerSuffix();
    ['soundcloud', 'spotify'].forEach((source) => localStorage.removeItem(`gp_home_feed_v2_${owner}_${source}`));
  }
}

function buildRecommendationSeeds() {
  const candidates = [];
  const addSeed = (seed) => {
    if (!seed?.label || (!seed.query && !seed.artistId && !seed.trackId)) return;
    candidates.push(seed);
  };

  Object.values(getProfilePlayStats())
    .map((track) => {
      const ageDays = track.lastPlayedAt ? (Date.now() - track.lastPlayedAt) / 86400000 : 90;
      const recency = 0.45 + 0.55 * Math.exp(-ageDays / 28);
      return { ...track, recommendationScore: (track.count || 0) * recency };
    })
    .sort((a, b) => b.recommendationScore - a.recommendationScore)
    .slice(0, 5)
    .forEach((track, index) => addSeed({
      key: `play:${track.id}`,
      trackId: track.source === 'soundcloud' ? track.id : null,
      query: `${track.artist || ''} ${track.title || ''}`.trim(),
      label: `вы часто слушаете ${track.artist || track.title}`,
      weight: 100 - index * 4
    }));

  getLikedTracks().slice(0, 8).forEach((track, index) => addSeed({
    key: `like:${track.id}`,
    trackId: track.source === 'soundcloud' ? track.id : null,
    query: `${track.artist || ''} ${track.title || ''}`.trim(),
    label: `вам понравился ${track.artist || track.title}`,
    weight: 82 - index
  }));

  getPlayHistory().slice(0, 10).forEach((track, index) => addSeed({
    key: `history:${track.id}`,
    trackId: track.source === 'soundcloud' ? track.id : null,
    query: `${track.artist || ''} ${track.title || ''}`.trim(),
    label: `вы слушали ${track.artist || track.title}`,
    weight: 68 - index
  }));

  getFollowedArtists().slice(0, 6).forEach((artist, index) => addSeed({
    key: `follow:${artist.id}`,
    artistId: artist.id,
    label: `вы подписаны на ${artist.name}`,
    weight: 74 - index
  }));

  getSearchHistory().slice(0, 5).forEach((query, index) => addSeed({
    key: `search:${query.toLocaleLowerCase('ru')}`,
    query,
    label: `вы искали «${query}»`,
    weight: 50 - index
  }));

  const unique = new Map();
  candidates.forEach((seed) => {
    const normalized = seed.trackId
      ? `track:${seed.trackId}`
      : seed.artistId
      ? `artist:${seed.artistId}`
      : `query:${seed.query.toLocaleLowerCase('ru').replace(/\s+/g, ' ').trim()}`;
    const previous = unique.get(normalized);
    if (!previous || previous.weight < seed.weight) unique.set(normalized, seed);
  });
  return Array.from(unique.values()).sort((a, b) => b.weight - a.weight);
}

async function loadForYouTracks({ forceRefresh = false } = {}) {
  const requestVersion = ++forYouLoadVersion;
  const ownerAtRequest = getStorageOwnerSuffix();
  const sourceAtRequest = activeHomeSource;
  const seeds = buildRecommendationSeeds();
  if (!seeds.length) {
    return {
      source: 'Лайкайте и слушайте треки — подборка начнёт меняться под ваш вкус',
      tracks: [],
      personalized: false,
      signals: []
    };
  }

  const cacheKey = getHomeRecommendationCacheKey();
  let cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
  } catch (err) {}
  if (!forceRefresh && cached?.createdAt && Date.now() - cached.createdAt < HOME_RECOMMENDATION_TTL) {
    const recentIds = new Set(getPlayHistory().slice(0, 8).map((track) => String(track.id)));
    const freshTracks = (cached.data?.tracks || []).filter((track) => !recentIds.has(String(track.id)));
    if (freshTracks.length >= 6) return { ...cached.data, tracks: freshTracks };
  }

  if (forceRefresh) homeRecommendationRotation += 1;
  const offset = homeRecommendationRotation % seeds.length;
  const rotatedSeeds = seeds.slice(offset).concat(seeds.slice(0, offset));
  const selectedSeeds = rotatedSeeds.slice(0, Math.min(3, rotatedSeeds.length));

  const requests = selectedSeeds.map(async (seed) => {
    try {
      const params = seed.trackId
        ? `trackId=${encodeURIComponent(seed.trackId)}`
        : seed.artistId
          ? `artistId=${encodeURIComponent(seed.artistId)}`
          : `q=${encodeURIComponent(seed.query)}`;
      const response = await fetchWithTimeout(`${BACKEND_URL}/search/related?${params}`, {}, 1500);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && Array.isArray(data.results) && data.results.length > 0) {
          return data.results;
        }
      }
    } catch (e) {}

    // Fallback to direct SoundCloud search
    try {
      const searchQuery = seed.query || seed.title || seed.artist || 'trending music';
      return await DirectSoundCloudEngine.search(searchQuery, 8);
    } catch (err) {
      return [];
    }
  });

  const settled = await Promise.allSettled(requests);
  const recentIds = new Set(getPlayHistory().slice(0, 8).map((track) => String(track.id)));
  const resultLists = settled.map((result) => result.status === 'fulfilled' ? result.value : []);
  const allTracks = [];
  const longestList = Math.max(0, ...resultLists.map((list) => list.length));
  for (let index = 0; index < longestList; index += 1) {
    resultLists.forEach((list) => {
      if (list[index]) allTracks.push(list[index]);
    });
  }
  const deduped = [];
  const seen = new Set();
  allTracks.forEach((track) => {
    const key = `${track.source || 'unknown'}:${track.id}`;
    if (!track?.id || seen.has(key) || recentIds.has(String(track.id))) return;
    seen.add(key);
    deduped.push(track);
  });

  const fallbackTracks = deduped.length ? deduped : allTracks.filter((track, index, list) =>
    track?.id && list.findIndex((item) => String(item.id) === String(track.id)) === index
  );
  if (!fallbackTracks.length && cached?.data) return { ...cached.data, stale: true };

  const rotationOffset = forceRefresh && fallbackTracks.length
    ? homeRecommendationRotation % fallbackTracks.length
    : 0;
  const tracks = fallbackTracks.slice(rotationOffset).concat(fallbackTracks.slice(0, rotationOffset)).slice(0, 30);
  const payload = {
    source: `Потому что ${selectedSeeds[0].label}`,
    tracks,
    personalized: true,
    signals: selectedSeeds.map((seed) => seed.label)
  };
  if (requestVersion === forYouLoadVersion && ownerAtRequest === getStorageOwnerSuffix() && sourceAtRequest === activeHomeSource) {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ createdAt: Date.now(), data: payload }));
    } catch (err) {}
  }
  return payload;
}

function getLikedTracks() {
  const data = localStorage.getItem(getStorageKey('likes'));
  return data ? JSON.parse(data) : [];
}

function saveLikedTracks(tracks) {
  localStorage.setItem(getStorageKey('likes'), JSON.stringify(tracks));
}

function getPlayHistory() {
  const data = localStorage.getItem(getStorageKey('history'));
  return data ? JSON.parse(data) : [];
}

function savePlayHistory(tracks) {
  localStorage.setItem(getStorageKey('history'), JSON.stringify(tracks));
}

function getPlaylists() {
  const data = localStorage.getItem(getStorageKey('playlists'));
  return data ? JSON.parse(data) : [];
}

function savePlaylists(playlists, sync = true) {
  localStorage.setItem(getStorageKey('playlists'), JSON.stringify(playlists));
  if (sync && currentUser && token) {
    syncPlaylistsWithBackend(playlists);
  }
}

// Get Greeting based on local time
function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return 'Доброе утро';
  } else if (hour >= 12 && hour < 18) {
    return 'Добрый день';
  } else if (hour >= 18 && hour < 22) {
    return 'Добрый вечер';
  } else {
    return 'Доброй ночи';
  }
}


// Liked tracks services logic (using client-side localStorage and backend synchronization)
async function loadLikedTracks() {
  if (currentUser) {
    const cloudLikes = Array.isArray(currentUser.likedTracks) ? currentUser.likedTracks : [];
    saveLikedTracks(cloudLikes);
    likedTrackIds = new Set(cloudLikes.map(t => t.id));
  } else {
    const likes = getLikedTracks();
    likedTrackIds = new Set(likes.map(t => t.id));
  }
}

function updateLikeUI(trackId) {
  const isLiked = likedTrackIds.has(trackId);
  const heartSvgEmpty = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
  const heartSvgFilled = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>`;

  // 1. Update all track card like buttons
  const cards = document.querySelectorAll(`.track-card[data-track-id="${trackId}"], .track-card-horizontal[data-track-id="${trackId}"]`);
  cards.forEach(card => {
    const cardLikeBtn = card.querySelector('.like-btn, .card-like-btn-horizontal');
    if (cardLikeBtn) {
      cardLikeBtn.setAttribute('aria-pressed', String(isLiked));
      cardLikeBtn.setAttribute('aria-label', isLiked ? 'Убрать из избранного' : 'Добавить в избранное');
      if (isLiked) {
        cardLikeBtn.classList.add('liked');
        cardLikeBtn.innerHTML = heartSvgFilled;
      } else {
        cardLikeBtn.classList.remove('liked');
        cardLikeBtn.innerHTML = heartSvgEmpty;
      }
    }
  });

  // 2. Update player bar like button
  const playerLikeBtn = document.getElementById('player-like-btn');
  if (playerLikeBtn) {
    const playingTrack = playlist[currentTrackIndex];
    if (playingTrack && playingTrack.id === trackId) {
      if (isLiked) {
        playerLikeBtn.classList.add('liked');
        playerLikeBtn.innerHTML = heartSvgFilled;
      } else {
        playerLikeBtn.classList.remove('liked');
        playerLikeBtn.innerHTML = heartSvgEmpty;
      }
    }
  }

  if (miniLikeButton) {
    const playingTrack = playlist[currentTrackIndex];
    if (playingTrack && playingTrack.id === trackId) {
      miniLikeButton.classList.toggle('liked', isLiked);
      miniLikeButton.setAttribute('aria-pressed', String(isLiked));
      miniLikeButton.setAttribute('aria-label', isLiked ? 'Убрать из избранного' : 'Добавить в избранное');
      miniLikeButton.innerHTML = isLiked ? heartSvgFilled : heartSvgEmpty;
    }
  }
}

function toggleLike(e, track) {
  if (e) e.stopPropagation();
  const isLiked = likedTrackIds.has(track.id);

  let likes = getLikedTracks();
  if (isLiked) {
    likes = likes.filter(t => t.id !== track.id);
    likedTrackIds.delete(track.id);
  } else {
    likes.unshift({
      id: track.id,
      title: track.title,
      artist: track.artist,
      source: track.source,
      thumbnail: track.thumbnail,
      duration: track.duration
    });
    likedTrackIds.add(track.id);
  }
  saveLikedTracks(likes);
  invalidateHomeRecommendations();

  // Sync with cloud backend database if user is logged in
  if (currentUser && token) {
    currentUser.likedTracks = likes;
    localStorage.setItem('auth_user', JSON.stringify(currentUser));
    syncLikesWithBackend(likes);
  }

  // Sync like UI everywhere
  updateLikeUI(track.id);

  // If we are currently viewing the Library, re-render
  if (activeView === 'library') {
    loadFavorites();
  }
}

let currentLibrarySubTab = 'favorites';


async function loadFavorites(subTab = 'favorites') {
  currentLibrarySubTab = subTab;
  activeView = 'library';
  searchInput.value = '';
  welcomeScreen.classList.add('hidden');
  tracksContainer.classList.add('hidden');
  loadingIndicator.classList.remove('hidden');

  const subTabsHeader = `
    <div class="view-header library-view-header">
      <div class="view-header-title">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4" width="7" height="7" rx="2"/><rect x="14" y="4" width="7" height="7" rx="2"/><rect x="3" y="15" width="7" height="6" rx="2"/><path d="M15 16h6M15 20h6"/></svg>
        <div><span>Медиатека</span><small>Избранное и музыка на этом устройстве</small></div>
      </div>
    </div>
    <div class="library-subtabs" role="navigation" aria-label="Разделы медиатеки">
      <button class="library-tab-btn ${subTab === 'favorites' ? 'active' : ''}" id="lib-subtab-favs" ${subTab === 'favorites' ? 'aria-current="page"' : ''}>Избранное</button>
      <button class="library-tab-btn ${subTab === 'local' ? 'active' : ''}" id="lib-subtab-local" ${subTab === 'local' ? 'aria-current="page"' : ''}>На устройстве</button>
    </div>
  `;

  if (subTab === 'favorites') {
    await loadLikedTracks();
    const likes = getLikedTracks();
    loadingIndicator.classList.add('hidden');

    tracksContainer.innerHTML = subTabsHeader;
    bindLibrarySubTabEvents();

    const favsGrid = document.createElement('div');
    favsGrid.className = 'tracks-layout-grid';
    tracksContainer.appendChild(favsGrid);

    if (likes && likes.length > 0) {
      playlist = likes;
      renderTracks(playlist, favsGrid);
    } else {
      playlist = [];
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'welcome-state';
      emptyDiv.innerHTML = '<h2>Избранное пусто</h2><p>Нажмите сердечко на любом треке, чтобы добавить его сюда</p>';
      tracksContainer.appendChild(emptyDiv);
    }
    tracksContainer.classList.remove('hidden');
  } else {
    const localTracks = await getLocalTracks();
    loadingIndicator.classList.add('hidden');

    tracksContainer.innerHTML = subTabsHeader;
    bindLibrarySubTabEvents();

    const localHeader = document.createElement('div');
    localHeader.className = 'local-library-header';
    localHeader.innerHTML = `
      <div class="local-library-summary">
        <strong id="local-track-count">${formatTrackCount(localTracks.length)}</strong>
        <span>Скачанные и добавленные файлы доступны без сети</span>
      </div>
      <div class="local-library-tools">
        <label class="local-search-field">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <span class="sr-only">Поиск по музыке на устройстве</span>
          <input id="local-library-search" type="search" placeholder="Найти трек или исполнителя">
        </label>
        <select id="local-library-sort" class="local-sort-select" aria-label="Сортировка музыки на устройстве">
          <option value="recent">Сначала новые</option>
          <option value="title">По названию</option>
          <option value="artist">По исполнителю</option>
        </select>
        <button id="upload-mp3-btn" class="local-action-btn" aria-label="Добавить аудиофайлы с устройства">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          Добавить музыку
        </button>
        <input type="file" id="local-file-picker" accept=".mp3,audio/*" multiple style="display: none;">
      </div>
    `;
    tracksContainer.appendChild(localHeader);

    const filePicker = localHeader.querySelector('#local-file-picker');
    const uploadBtn = localHeader.querySelector('#upload-mp3-btn');
    const localSearch = localHeader.querySelector('#local-library-search');
    const localSort = localHeader.querySelector('#local-library-sort');
    const localCount = localHeader.querySelector('#local-track-count');

    const renderLocalCollection = () => {
      const query = localSearch.value.trim().toLocaleLowerCase('ru');
      const sortMode = localSort.value;
      const filtered = localTracks.filter((track) => {
        const searchable = `${track.title || ''} ${track.artist || ''}`.toLocaleLowerCase('ru');
        return !query || searchable.includes(query);
      });
      filtered.sort((a, b) => {
        if (sortMode === 'title') return (a.title || '').localeCompare(b.title || '', 'ru');
        if (sortMode === 'artist') return (a.artist || '').localeCompare(b.artist || '', 'ru');
        return (b.addedAt || 0) - (a.addedAt || 0);
      });
      localCount.textContent = formatTrackCount(filtered.length);
      playlist = filtered;
      renderLocalTracks(filtered, query ? 'По вашему запросу ничего не найдено' : 'На устройстве пока нет музыки');
    };

    uploadBtn.addEventListener('click', () => filePicker.click());
    localSearch.addEventListener('input', renderLocalCollection);
    localSort.addEventListener('change', renderLocalCollection);
    filePicker.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        uploadBtn.disabled = true;
        showToastNotification(`Обрабатываем файлов: ${files.length}`, 'info', 'Медиатека');
        try {
          await importLocalAudioFiles(files);
          await loadFavorites('local');
        } finally {
          uploadBtn.disabled = false;
          filePicker.value = '';
        }
      }
    });

    renderLocalCollection();
    tracksContainer.classList.remove('hidden');
  }
  updateActiveTab('library');
}

function bindLibrarySubTabEvents() {
  const btnFavs = document.getElementById('lib-subtab-favs');
  const btnLocal = document.getElementById('lib-subtab-local');
  if (btnFavs) btnFavs.addEventListener('click', () => loadFavorites('favorites'));
  if (btnLocal) btnLocal.addEventListener('click', () => loadFavorites('local'));
}

function renderLocalTracks(tracks, emptyMessage = 'На устройстве пока нет музыки') {
  tracksContainer.querySelector('.local-tracks-grid')?.remove();
  tracksContainer.querySelector('.local-library-empty')?.remove();

  if (!tracks.length) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'welcome-state local-library-empty';
    emptyDiv.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg><h2>${escapeHTML(emptyMessage)}</h2><p>Добавьте файлы кнопкой выше или перетащите их в окно GlassPlayer.</p>`;
    tracksContainer.appendChild(emptyDiv);
    return;
  }

  const gridContainer = document.createElement('div');
  gridContainer.className = 'tracks-layout-grid local-tracks-grid';
  renderTracks(tracks, gridContainer);
  tracksContainer.appendChild(gridContainer);
}

// Playback History logic
function addToHistory(track) {
  let history = getPlayHistory();
  // Remove duplicates
  history = history.filter(t => t.id !== track.id);
  // Add to start
  history.unshift({
    id: track.id,
    title: track.title,
    artist: track.artist,
    source: track.source,
    thumbnail: track.thumbnail,
    duration: track.duration
  });
  // Limit to 50 items
  if (history.length > 50) {
    history = history.slice(0, 50);
  }
  savePlayHistory(history);
  invalidateHomeRecommendations();

  // Refresh if viewing history — but never reorder the queue that is currently
  // being played from History (that caused next() to bounce between two tracks).
  if (activeView === 'history') {
    const isPlayingFromHistoryQueue = playlist.some(t => t && t.id === track.id);
    if (!isPlayingFromHistoryQueue) {
      renderHistory();
    }
  }
}

function loadHistoryView() {
  activeView = 'history';
  searchInput.value = '';
  welcomeScreen.classList.add('hidden');
  tracksContainer.classList.add('hidden');
  loadingIndicator.classList.remove('hidden');

  setTimeout(() => {
    renderHistory();
  }, 200);
}

function renderHistory() {
  loadingIndicator.classList.add('hidden');
  const history = getPlayHistory();

  if (history && history.length > 0) {
    playlist = history;
    renderTracks(playlist);
    tracksContainer.classList.remove('hidden');
  } else {
    playlist = [];
    tracksContainer.innerHTML = '<div class="welcome-state"><h2>No Playback History</h2><p>Play some tracks to build up your history</p></div>';
    tracksContainer.classList.remove('hidden');
  }
  updateActiveTab('history');
}

// Playlists logic
function loadPlaylistsView() {
  activeView = 'playlists';
  searchInput.value = '';
  welcomeScreen.classList.add('hidden');
  tracksContainer.classList.add('hidden');
  loadingIndicator.classList.remove('hidden');

  setTimeout(() => {
    renderPlaylists();
  }, 200);
}

function renderPlaylists() {
  loadingIndicator.classList.add('hidden');
  const playlists = getPlaylists();

  tracksContainer.innerHTML = '';

  const viewHeader = document.createElement('div');
  viewHeader.className = 'view-header';
  viewHeader.innerHTML = `
    <div class="view-header-title">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
      <span>Your Playlists</span>
    </div>
    <div class="view-header-actions">
      <button id="add-playlist-btn-view" class="view-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        <span>New Playlist</span>
      </button>
    </div>
  `;
  tracksContainer.appendChild(viewHeader);

  document.getElementById('add-playlist-btn-view').addEventListener('click', () => {
    playlistModal.classList.remove('hidden');
    newPlaylistInput.focus();
  });

  if (playlists && playlists.length > 0) {
    const grid = document.createElement('div');
    grid.className = 'tracks-layout-grid';

    playlists.forEach(pl => {
      const isCollab = pl.isCollaborative || false;
      let isFriendListening = false;
      if (isCollab) {
        for (const [friendId, status] of friendStatuses.entries()) {
          if (status && status.isOnline && status.isPlaying && status.trackName) {
            const trackExists = pl.tracks && pl.tracks.some(t => 
              t.title.toLowerCase() === status.trackName.toLowerCase() &&
              t.artist.toLowerCase() === status.artist.toLowerCase()
            );
            if (trackExists) {
              isFriendListening = true;
              break;
            }
          }
        }
      }

      const card = document.createElement('div');
      card.className = `playlist-card ${isCollab ? 'collaborative' : ''} ${isFriendListening ? 'friend-listening' : ''}`;

      const iconHtml = isCollab 
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;

      card.innerHTML = `
        <div class="playlist-card-icon">
          ${iconHtml}
        </div>
        <div class="playlist-card-title">${pl.name}</div>
        <div class="playlist-card-count">${pl.tracks.length} tracks</div>
        <button class="playlist-delete-btn" title="Delete Playlist">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.playlist-delete-btn')) return;
        openPlaylist(pl.id);
      });

      card.querySelector('.playlist-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deletePlaylist(pl.id);
      });

      grid.appendChild(card);
    });

    tracksContainer.appendChild(grid);
  } else {
    const emptyState = document.createElement('div');
    emptyState.className = 'welcome-state';
    emptyState.innerHTML = '<h2>No playlists created</h2><p>Click "New Playlist" to create your first music compilation</p>';
    tracksContainer.appendChild(emptyState);
  }
  tracksContainer.classList.remove('hidden');
  updateActiveTab('playlists');
}

function openPlaylist(playlistId) {
  activeView = 'playlist-tracks';
  activePlaylistId = playlistId;

  const playlists = getPlaylists();
  const pl = playlists.find(p => p.id === playlistId);
  if (!pl) return;

  tracksContainer.innerHTML = '';

  const isOwner = currentUser && (!pl.userId || pl.userId === currentUser.id);
  const isCollab = pl.isCollaborative || false;

  let collabBtnHtml = '';
  if (isOwner) {
    collabBtnHtml = `
      <button id="make-collab-btn" class="card-more-btn-horizontal" style="margin-left: 12px; font-size: 11px; padding: 6px 12px; border-radius: 12px; display: inline-flex; align-items: center; gap: 6px;" title="Настройки совместного доступа">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        <span>${isCollab ? 'Совместный (Настройки)' : 'Сделать совместным'}</span>
      </button>
    `;
  }

  let avatarsStackHtml = '';
  if (isCollab && pl.collaborators && pl.collaborators.length > 0) {
    const ownerInitial = currentUser ? currentUser.displayName[0].toUpperCase() : 'O';
    avatarsStackHtml = `
      <div class="collab-avatars-stack" style="margin-top: 8px; display: flex; align-items: center; gap: 4px;">
        <span style="font-size: 11px; color: var(--text-dim); margin-right: 6px;">Участники:</span>
        <div class="collab-avatar-item" style="display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; color: #fff; background: var(--accent-color); border: 2px solid var(--player-bg); border-radius: 50%; width: 26px; height: 26px;" title="Владелец (${currentUser ? currentUser.displayName : 'Вы'})">
          ${ownerInitial}
        </div>
    `;
    pl.collaborators.forEach(colId => {
      const friendObj = mutualFriends.find(f => f.id === colId);
      const initial = friendObj ? friendObj.displayName[0].toUpperCase() : 'U';
      const name = friendObj ? friendObj.displayName : 'Пользователь';
      avatarsStackHtml += `
        <div class="collab-avatar-item" style="display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; color: #fff; background: #3a3f50; border: 2px solid var(--player-bg); border-radius: 50%; width: 26px; height: 26px;" title="${name}">
          ${initial}
        </div>
      `;
    });
    avatarsStackHtml += `</div>`;
  }

  const viewHeader = document.createElement('div');
  viewHeader.className = 'view-header';
  viewHeader.style.flexDirection = 'column';
  viewHeader.style.alignItems = 'flex-start';
  viewHeader.style.gap = '8px';
  viewHeader.innerHTML = `
    <div style="display: flex; align-items: center; width: 100%; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
      <div class="view-header-title" style="display: flex; align-items: center; gap: 8px;">
        <button id="back-to-playlists" class="view-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          <span>Back</span>
        </button>
        <span style="font-size: 20px; font-weight: 600;">${pl.name}</span>
        <span class="view-header-subtitle" style="margin-left: 6px;">(${pl.tracks.length} tracks)</span>
      </div>
      ${collabBtnHtml}
    </div>
    ${avatarsStackHtml}
  `;
  tracksContainer.appendChild(viewHeader);

  document.getElementById('back-to-playlists').addEventListener('click', () => {
    loadPlaylistsView();
  });

  if (isOwner) {
    const makeCollabBtn = document.getElementById('make-collab-btn');
    if (makeCollabBtn) {
      makeCollabBtn.addEventListener('click', () => {
        openCollabModal(playlistId);
      });
    }
  }

  if (pl.tracks && pl.tracks.length > 0) {
    playlist = pl.tracks;

    const listGrid = document.createElement('div');
    listGrid.className = 'tracks-layout-grid';
    tracksContainer.appendChild(listGrid);

    renderTracks(playlist, listGrid);
  } else {
    playlist = [];
    const emptyState = document.createElement('div');
    emptyState.className = 'welcome-state';
    emptyState.innerHTML = '<h2>This playlist is empty</h2><p>Add tracks here using the "+" button on search results</p>';
    tracksContainer.appendChild(emptyState);
  }
  tracksContainer.classList.remove('hidden');
  updateActiveTab('playlists');
}

function addTrackToPlaylistId(playlistId, track) {
  let playlists = getPlaylists();
  const pl = playlists.find(p => p.id === playlistId);
  if (!pl) return;

  if (!pl.tracks.some(t => t.id === track.id)) {
    pl.tracks.push({
      id: track.id,
      title: track.title,
      artist: track.artist,
      source: track.source,
      thumbnail: track.thumbnail,
      duration: track.duration
    });
    savePlaylists(playlists);
  }
}

function removeTrackFromPlaylistId(playlistId, trackId) {
  let playlists = getPlaylists();
  const pl = playlists.find(p => p.id === playlistId);
  if (!pl) return;

  pl.tracks = pl.tracks.filter(t => t.id !== trackId);
  savePlaylists(playlists);
}

function removeTrackFromPlaylist(trackId) {
  if (activeView !== 'playlist-tracks' || !activePlaylistId) return;
  removeTrackFromPlaylistId(activePlaylistId, trackId);
  openPlaylist(activePlaylistId);
}

function deletePlaylist(playlistId) {
  let playlists = getPlaylists();
  playlists = playlists.filter(p => p.id !== playlistId);
  savePlaylists(playlists);
  renderPlaylists();
}

function createPlaylist(name) {
  const cleanedName = name.trim();
  if (!cleanedName) return;

  let playlists = getPlaylists();

  if (playlists.some(p => p.name.toLowerCase() === cleanedName.toLowerCase())) {
    showToastNotification('Плейлист с таким именем уже существует.', 'warning', 'Плейлисты');
    return;
  }

  const newPl = {
    id: 'pl_' + Date.now(),
    name: cleanedName,
    tracks: []
  };

  playlists.push(newPl);
  savePlaylists(playlists);

  if (selectedTrackForPlaylist) {
    addTrackToPlaylistId(newPl.id, selectedTrackForPlaylist);
    selectedTrackForPlaylist = null;
  }

  if (activeView === 'playlists') {
    renderPlaylists();
  }
}

function showPlaylistMenu(e, track) {
  selectedTrackForPlaylist = track;
  const rect = e.currentTarget.getBoundingClientRect();
  const playlists = getPlaylists();

  playlistMenuList.innerHTML = '<div class="playlist-menu-title">Add to Playlist</div>';

  if (playlists && playlists.length > 0) {
    playlists.forEach(pl => {
      const item = document.createElement('button');
      item.className = 'playlist-menu-item';

      const containsTrack = pl.tracks.some(t => t.id === track.id);

      item.innerHTML = `
        <span>${pl.name}</span>
        <span class="playlist-menu-item-count">${containsTrack ? '✓' : ''}</span>
      `;

      item.addEventListener('click', () => {
        if (containsTrack) {
          removeTrackFromPlaylistId(pl.id, track.id);
        } else {
          addTrackToPlaylistId(pl.id, track);
        }
        playlistMenu.classList.add('hidden');
      });

      playlistMenuList.appendChild(item);
    });
  } else {
    const noPlaylists = document.createElement('div');
    noPlaylists.className = 'playlist-menu-item playlist-menu-empty';
    noPlaylists.innerHTML = '<span>No Playlists</span>';
    playlistMenuList.appendChild(noPlaylists);
  }

  const createNewItem = document.createElement('button');
  createNewItem.className = 'playlist-menu-item playlist-menu-create';
  createNewItem.innerHTML = '<span>+ New Playlist</span>';
  createNewItem.addEventListener('click', () => {
    playlistMenu.classList.add('hidden');
    playlistModal.classList.remove('hidden');
    newPlaylistInput.focus();
  });
  playlistMenuList.appendChild(createNewItem);
  appendShareItemToTrackMenu(track);

  playlistMenu.style.top = `${rect.bottom + window.scrollY + 6}px`;
  playlistMenu.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - 200)}px`;
  playlistMenu.classList.remove('hidden');
}

profileButton.addEventListener('click', () => {
  renderProfilesDropdown();
  profileDropdown.classList.toggle('hidden');
});

createProfileBtn.addEventListener('click', () => {
  profileDropdown.classList.add('hidden');
  if (currentUser) {
    handleLogout();
  } else {
    openAuthModal();
  }
});

// Profile Modal Actions
cancelProfileBtn.addEventListener('click', () => {
  profileModal.classList.add('hidden');
  newProfileInput.value = '';
});

saveProfileBtn.addEventListener('click', () => {
  createUserProfile(newProfileInput.value);
  profileModal.classList.add('hidden');
  newProfileInput.value = '';
});

newProfileInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    createUserProfile(newProfileInput.value);
    profileModal.classList.add('hidden');
    newProfileInput.value = '';
  }
});

// Playlist Modal Actions
cancelPlaylistBtn.addEventListener('click', () => {
  playlistModal.classList.add('hidden');
  newPlaylistInput.value = '';
});

savePlaylistBtn.addEventListener('click', () => {
  createPlaylist(newPlaylistInput.value);
  playlistModal.classList.add('hidden');
  newPlaylistInput.value = '';
});

newPlaylistInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    createPlaylist(newPlaylistInput.value);
    playlistModal.classList.add('hidden');
    newPlaylistInput.value = '';
  }
});

// Document outside clicks to close dropdowns, search history, and profile dropdowns
document.addEventListener('click', (e) => {
  if (!e.target.closest('.playlist-add-btn') && !e.target.closest('#playlist-menu')) {
    playlistMenu.classList.add('hidden');
  }
  if (!e.target.closest('#profile-button') && !e.target.closest('#profile-dropdown')) {
    profileDropdown.classList.add('hidden');
  }
  if (!e.target.closest('#search-input') && !e.target.closest('#search-history-dropdown')) {
    searchHistoryDropdown.classList.add('hidden');
  }
});

// Navigation Click Event Listeners
homeButton.addEventListener('click', () => loadHomeView());
favoritesButton.addEventListener('click', () => loadFavorites(currentLibrarySubTab));
historyButton.addEventListener('click', loadHistoryView);
playlistsButton.addEventListener('click', loadPlaylistsView);
settingsButton.addEventListener('click', loadSettingsView);
if (studioButton) {
  studioButton.addEventListener('click', () => loadStudioView('visual'));
}
if (statsButton) {
  statsButton.addEventListener('click', loadStatsView);
}

document.querySelectorAll('.mobile-tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.mobileView;
    if (view === 'home') loadHomeView();
    if (view === 'library') loadFavorites(currentLibrarySubTab);
    if (view === 'playlists') loadPlaylistsView();
    if (view === 'studio') loadStudioView('visual');
    if (view === 'stats') loadStatsView();
  });
});

// Search input focus/input listeners for autocomplete dropdown
searchInput.addEventListener('focus', showSearchHistory);
searchInput.addEventListener('input', () => {
  if (searchInput.value.trim() === '') {
    showSearchHistory();
  } else {
    searchHistoryDropdown.classList.add('hidden');
  }
});

// --- Step 3 Main View Loading & Recommendation Logic ---

async function loadHomeView({ forceRefresh = false } = {}) {
  const requestVersion = ++homeLoadVersion;
  activeView = 'home';
  searchInput.value = '';
  welcomeScreen.classList.add('hidden');
  tracksContainer.classList.add('hidden');
  tracksContainer.setAttribute('aria-busy', 'true');
  loadingIndicator.classList.remove('hidden');

  try {
    const homeUrl = `${BACKEND_URL}/search/home${forceRefresh ? `?refresh=${Date.now()}` : ''}`;
    let homeRes = null;
    let forYouData = null;

    try {
      const [homeResult, forYouResult] = await Promise.allSettled([
        fetchWithTimeout(homeUrl, {}, 1500).then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
        loadForYouTracks({ forceRefresh })
      ]);
      homeRes = homeResult.status === 'fulfilled' ? homeResult.value : null;
      forYouData = forYouResult.status === 'fulfilled' ? forYouResult.value : cachedForYouData;
    } catch (e) {}

    // Fallback: If backend is slow, sleeping or blocked, load directly via DirectSoundCloudEngine
    if (!homeRes || homeRes.status !== 'success' || !homeRes.results) {
      console.log('[Home View] Backend unavailable, loading home sections directly from SoundCloud...');
      try {
        const directSections = await DirectSoundCloudEngine.getHomeSections();
        homeRes = {
          status: 'success',
          results: directSections
        };
        if (!forYouData || !forYouData.tracks || forYouData.tracks.length === 0) {
          forYouData = {
            source: '🔥 Популярные треки прямо сейчас',
            tracks: directSections.trending || directSections.top || [],
            personalized: false,
            signals: []
          };
        }
      } catch (err) {
        console.error('[Home View] DirectSoundCloudEngine home failed:', err.message);
      }
    }

    if (requestVersion !== homeLoadVersion || activeView !== 'home') return;

    loadingIndicator.classList.add('hidden');

    if (homeRes?.status === 'success' && homeRes.results) {
      originalHomeData = homeRes.results;
      cachedForYouData = forYouData;
      renderHome(homeRes.results, forYouData);
      tracksContainer.classList.remove('hidden');
    } else if (originalHomeData) {
      cachedForYouData = forYouData || cachedForYouData;
      renderHome(originalHomeData, cachedForYouData);
      tracksContainer.classList.remove('hidden');
    } else {
      tracksContainer.innerHTML = '<div class="welcome-state"><h2>Не удалось загрузить рекомендации</h2><p>Пожалуйста, проверьте подключение к интернету</p></div>';
      tracksContainer.classList.remove('hidden');
    }
    updateActiveTab('home');
  } catch (error) {
    if (requestVersion !== homeLoadVersion || activeView !== 'home') return;
    console.error('[Renderer] Failed to load home screen recommendations:', error);
    loadingIndicator.classList.add('hidden');
    tracksContainer.innerHTML = '<div class="welcome-state"><h2>Не удалось загрузить рекомендации</h2><p>Проверьте соединение с интернетом</p></div>';
    tracksContainer.classList.remove('hidden');
    updateActiveTab('home');
  } finally {
    if (requestVersion === homeLoadVersion) {
      tracksContainer.removeAttribute('aria-busy');
      hideSplashScreen();
    }
  }
}

// Carousel state variables
let homeCarouselIndex = 0;
let carouselTimer = null;

function renderHome(sectionsData, forYouData) {
  tracksContainer.innerHTML = '';
  homeCarouselIndex = 0;
  clearInterval(carouselTimer);

  const username = currentUser ? (currentUser.displayName || currentUser.username) : currentProfile;

  // 1. Welcome Greeting and Sources Pill Capsule row
  const welcomeHeader = document.createElement('div');
  welcomeHeader.className = 'home-welcome-header';
  welcomeHeader.innerHTML = `
    <div class="welcome-greeting">
      <h2>${getGreeting()}, ${escapeHTML(username)}</h2>
      <p class="welcome-subtitle">${escapeHTML(forYouData?.source || 'Новая музыка, история и ваши любимые треки — в одном месте')}</p>
    </div>
    <div class="home-header-actions">
      <button class="home-refresh-btn" type="button" aria-label="Обновить все рекомендации" title="Обновить все рекомендации">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M18.5 16a8 8 0 1 1 .8-8.2L20 12"/></svg>
        <span>Обновить</span>
      </button>
      <div class="sources-pill-capsule" style="position: relative;">
        <div class="capsule-active-indicator" style="left: ${activeHomeSource === 'soundcloud' ? '4' : '44'}px;"></div>
        <button class="source-capsule-btn ${activeHomeSource === 'soundcloud' ? 'active' : ''}" data-source="soundcloud" title="SoundCloud" aria-label="Рекомендации SoundCloud" aria-pressed="${activeHomeSource === 'soundcloud'}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.95 14.47c0-2.45-1.92-4.44-4.29-4.44h-.35c-.48-2.61-2.73-4.6-5.46-4.6-2.58 0-4.73 1.83-5.32 4.26-.26-.06-.53-.09-.81-.09-2.58 0-4.67 2.09-4.67 4.67 0 .16.01.32.02.48C1.29 14.53 0 16.03 0 17.84c0 2.08 1.68 3.76 3.76 3.76h16.5c1.96 0 3.69-1.55 3.69-3.51 0-1.74-1.28-3.18-2.97-3.52z"/></svg>
        </button>
        <button class="source-capsule-btn ${activeHomeSource === 'spotify' ? 'active' : ''}" data-source="spotify" title="Spotify" aria-label="Рекомендации Spotify" aria-pressed="${activeHomeSource === 'spotify'}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.377-1.454-5.37-1.783-8.894-.978-.335.077-.67-.134-.746-.47-.077-.335.134-.67.47-.746 3.847-.88 7.143-.51 9.814 1.127.294.18.387.563.207.857s-.563.387-.857.207zm1.225-2.72c-.227.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.082-1.182-.413.125-.847-.107-.972-.52-.125-.413.107-.847.52-.972 3.676-1.116 8.243-.57 11.348 1.337.367.227.487.707.26 1.074zm.107-2.834C14.484 8.7 8.012 8.483 4.262 9.622c-.573.173-1.182-.154-1.355-.727-.173-.573.154-1.182.727-1.355 4.3-1.305 11.442-1.055 15.534 1.373.515.305.683.97.378 1.485-.305.515-.97.683-1.485.378z"/></svg>
        </button>
      </div>
    </div>
  `;
  tracksContainer.appendChild(welcomeHeader);

  welcomeHeader.querySelector('.home-refresh-btn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (button.disabled) return;
    button.disabled = true;
    button.classList.add('loading');
    invalidateHomeRecommendations({ preserveCache: true });
    try {
      await loadHomeView({ forceRefresh: true });
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.classList.remove('loading');
      }
    }
  });

  // Setup click listeners for capsule buttons
  welcomeHeader.querySelectorAll('.source-capsule-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const source = btn.dataset.source;
      if (activeHomeSource === source) return;

      activeHomeSource = source;

      // Update button active classes immediately for visual response
      welcomeHeader.querySelectorAll('.source-capsule-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.source === activeHomeSource);
        b.setAttribute('aria-pressed', String(b.dataset.source === activeHomeSource));
      });

      // Slide active indicator instantly
      const indicator = welcomeHeader.querySelector('.capsule-active-indicator');
      if (indicator) {
        indicator.style.left = `${activeHomeSource === 'soundcloud' ? '4' : '44'}px`;
      }

      // Smooth switch transition delay
      setTimeout(() => {
        renderHome(originalHomeData, cachedForYouData);
      }, 250);
    });
  });


  // ── Spotify: Live Mood-Card Grid ─────────────────────────────────
  if (activeHomeSource === 'spotify') {
    renderSpotifyHome();
    return;
  }

  // Filter helper based on activeHomeSource
  const filterBySource = (trackList) => {
    if (!trackList) return [];
    return trackList.filter(t => t.source === activeHomeSource);
  };

  // 2. Render For You Banner Carousel
  const getFilteredCarousel = () => {
    let sourceTracks = [];
    if (forYouData && forYouData.tracks) {
      sourceTracks = filterBySource(forYouData.tracks);
    }
    if (sourceTracks.length === 0 && sectionsData.trending) {
      sourceTracks = filterBySource(sectionsData.trending);
    }
    if (sourceTracks.length === 0 && sectionsData.top) {
      sourceTracks = filterBySource(sectionsData.top);
    }
    return sourceTracks.slice(0, 5);
  };

  const carouselTracks = getFilteredCarousel();
  const carouselSection = renderCarousel(carouselTracks, null, forYouData?.source || 'Популярное прямо сейчас');
  if (carouselSection) {
    tracksContainer.appendChild(carouselSection);
  }

  // --- Vibe Engine 2.0: SoundCloud Dynamic Time-of-Day Section ---
  const dynamicRecsContainer = document.createElement('div');
  dynamicRecsContainer.id = 'soundcloud-dynamic-recs-container';
  tracksContainer.appendChild(dynamicRecsContainer);
  loadSoundCloudDynamicRecommendations(dynamicRecsContainer);

  // 3. Render Genre Chips Scroll-bar
  const genreSection = document.createElement('div');
  genreSection.className = 'genre-scroll-section';

  const chipsContainer = document.createElement('div');
  chipsContainer.className = 'genre-chips-bar';

  const tags = ['All', 'Underground', 'Archive', 'Plugg', 'Jerk', 'Electronic', 'Rock', 'Rap'];
  tags.forEach(tag => {
    const chip = document.createElement('button');
    const isActive = (activeGenreChip === null && tag === 'All') || (activeGenreChip === tag);
    chip.className = `genre-chip-btn ${isActive ? 'active' : ''}`;
    chip.textContent = tag;

    chip.addEventListener('click', async () => {
      if (tag === 'All') {
        activeGenreChip = null;
        genreRenderVersion++;
        renderHome(originalHomeData, cachedForYouData);
      } else {
        activeGenreChip = activeGenreChip === tag ? null : tag;
        genreRenderVersion++;
        // renderHome owns the single guarded request for the selected genre.
        renderHome(originalHomeData, cachedForYouData);
      }
    });

    chipsContainer.appendChild(chip);
  });

  genreSection.appendChild(chipsContainer);

  const scrollNextBtn = document.createElement('button');
  scrollNextBtn.className = 'genre-scroll-next-btn';
  scrollNextBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
  scrollNextBtn.addEventListener('click', () => {
    chipsContainer.scrollBy({ left: 150, behavior: 'smooth' });
  });
  genreSection.appendChild(scrollNextBtn);

  tracksContainer.appendChild(genreSection);

  const contentArea = document.createElement('div');
  contentArea.id = 'home-content-area';
  tracksContainer.appendChild(contentArea);

  if (activeGenreChip) {
    const tag = activeGenreChip;
    const myVersion = genreRenderVersion; // capture at render time
    setTimeout(async () => {
      // Don't execute if a newer render was requested
      if (genreRenderVersion !== myVersion) return;
      const contentArea = document.getElementById('home-content-area');
      if (contentArea) {
        contentArea.innerHTML = '<div style="display: flex; justify-content: center; padding: 50px;"><div class="spinner"></div></div>';
      }
      try {
        let scTracks = [];
        try {
          const response = await fetchWithTimeout(`${BACKEND_URL}/search?q=${encodeURIComponent(tag)}`, {}, 2500);
          if (response.ok) {
            const result = await response.json();
            if (result.status === 'success' && result.results) {
              scTracks = result.results.filter(t => t.source === activeHomeSource);
            }
          }
        } catch (e) {}

        if (scTracks.length === 0 && activeHomeSource === 'soundcloud') {
          try {
            scTracks = await DirectSoundCloudEngine.search(tag, 20);
          } catch (scErr) {}
        }

        if (genreRenderVersion !== myVersion || activeView !== 'home' || activeGenreChip !== tag || !contentArea?.isConnected) return;
        if (scTracks.length > 0) {
          renderGenreTracks(scTracks, tag);
        } else {
          if (contentArea) {
            contentArea.innerHTML = '<div class="inline-error-state">Не удалось загрузить треки этого жанра. Попробуйте ещё раз.</div>';
          }
        }
      } catch (err) {
        if (genreRenderVersion === myVersion && activeView === 'home' && activeGenreChip === tag && contentArea?.isConnected) {
          contentArea.innerHTML = '<div class="inline-error-state">Не удалось загрузить жанр. Проверьте соединение и повторите попытку.</div>';
        }
      }
    }, 50);
  } else {
    renderHomeContent(sectionsData, forYouData);
  }
}

function openHomeCollection(title, subtitle, tracks) {
  activeView = 'home-collection';
  clearInterval(carouselTimer);
  tracksContainer.innerHTML = `
    <div class="collection-view-header">
      <button class="collection-back-btn" type="button" aria-label="Вернуться на Home"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
      <div><h2>${escapeHTML(title)}</h2><p>${escapeHTML(subtitle)}</p></div>
    </div>
    <div class="tracks-layout-grid home-collection-grid"></div>
  `;
  tracksContainer.querySelector('.collection-back-btn').addEventListener('click', () => loadHomeView());
  playlist = tracks;
  renderTracks(tracks, tracksContainer.querySelector('.home-collection-grid'));
  updateActiveTab('home');
}

function appendHomeRail(parent, { id, title, subtitle, tracks }) {
  if (!tracks.length) return;
  const section = document.createElement('section');
  section.className = 'home-section scrollable';
  section.setAttribute('aria-labelledby', `${id}-title`);
  section.innerHTML = `
    <div class="home-section-header">
      <div class="home-section-heading"><h3 id="${id}-title">${escapeHTML(title)}</h3><p>${escapeHTML(subtitle)}</p></div>
      <button type="button" class="see-all-link">Показать все <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>
    </div>
    <div class="scroller-container-outer">
      <button class="scroll-chevron prev" type="button" aria-label="Прокрутить ${escapeHTML(title)} назад"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
      <div class="scroller-container" tabindex="0" aria-label="${escapeHTML(title)}"></div>
      <button class="scroll-chevron next" type="button" aria-label="Прокрутить ${escapeHTML(title)} вперёд"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>
    </div>
  `;
  parent.appendChild(section);

  const scroller = section.querySelector('.scroller-container');
  tracks.forEach((track, index) => scroller.appendChild(renderTrackCardHorizontal(track, index, tracks)));
  const prev = section.querySelector('.scroll-chevron.prev');
  const next = section.querySelector('.scroll-chevron.next');
  const updateArrows = () => {
    prev.disabled = scroller.scrollLeft <= 4;
    next.disabled = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 4;
  };
  prev.addEventListener('click', () => scroller.scrollBy({ left: -Math.max(280, scroller.clientWidth * 0.72), behavior: 'smooth' }));
  next.addEventListener('click', () => scroller.scrollBy({ left: Math.max(280, scroller.clientWidth * 0.72), behavior: 'smooth' }));
  scroller.addEventListener('scroll', updateArrows, { passive: true });
  section.querySelector('.see-all-link').addEventListener('click', () => openHomeCollection(title, subtitle, tracks));
  requestAnimationFrame(updateArrows);
}

function renderHomeContent(sectionsData, forYouData) {
  const contentArea = document.getElementById('home-content-area');
  if (!contentArea) return;
  contentArea.innerHTML = '';

  const filterBySource = (trackList) => (trackList || []).filter((track) => track.source === activeHomeSource);
  const trackKeys = (track) => [
    `${track.source || 'unknown'}:${track.id}`,
    `${String(track.artist || '').trim().toLocaleLowerCase('ru')}::${String(track.title || '').trim().toLocaleLowerCase('ru')}`
  ];
  const heroCandidates = filterBySource(forYouData?.tracks).length
    ? filterBySource(forYouData.tracks)
    : filterBySource(sectionsData.trending).length
      ? filterBySource(sectionsData.trending)
      : filterBySource(sectionsData.top);
  const used = new Set(heroCandidates.slice(0, 5).flatMap(trackKeys));
  const takeUnique = (trackList, limit = 14) => {
    const result = [];
    filterBySource(trackList).forEach((track) => {
      if (!track?.id || result.length >= limit) return;
      const keys = trackKeys(track);
      if (keys.some((key) => used.has(key))) return;
      keys.forEach((key) => used.add(key));
      result.push(track);
    });
    return result;
  };

  const continueTracks = takeUnique(getPlayHistory(), 8);
  let personalTracks = takeUnique(forYouData?.tracks, 14);
  if (!personalTracks.length) personalTracks = takeUnique(sectionsData.top, 14);
  const discoverySources = [sectionsData.electronic || [], sectionsData.rock || [], sectionsData.pop || []];
  const discoveryPool = [];
  const discoveryDepth = Math.max(0, ...discoverySources.map((list) => list.length));
  for (let index = 0; index < discoveryDepth; index += 1) {
    discoverySources.forEach((list) => {
      if (list[index]) discoveryPool.push(list[index]);
    });
  }
  const discoveryTracks = takeUnique(discoveryPool, 14);
  const trendingTracks = takeUnique(sectionsData.trending, 14);

  appendHomeRail(contentArea, {
    id: 'continue-listening',
    title: 'Продолжить слушать',
    subtitle: 'Недавние треки — без повторного поиска',
    tracks: continueTracks
  });
  appendHomeRail(contentArea, {
    id: 'made-for-you',
    title: forYouData?.personalized ? 'Для вас' : 'С чего начать',
    subtitle: forYouData?.personalized ? forYouData.source : 'Подборка станет точнее после нескольких прослушиваний',
    tracks: personalTracks
  });
  appendHomeRail(contentArea, {
    id: 'fresh-discovery',
    title: 'Новые находки',
    subtitle: 'Смешиваем жанры, чтобы Home не застывал на одном настроении',
    tracks: discoveryTracks
  });
  appendHomeRail(contentArea, {
    id: 'trending-now',
    title: 'Сейчас в тренде',
    subtitle: 'Популярное у слушателей прямо сейчас',
    tracks: trendingTracks
  });
}

// Redesigned Track Card Horizontal builder
function renderTrackCardHorizontal(track, index, sectionTracks) {
  const card = document.createElement('div');
  const isActive = activePlayingTrack && track.id === activePlayingTrack.id;
  card.className = `track-card-horizontal ${isActive ? 'active' : ''}`;
  card.setAttribute('role', 'article');
  card.dataset.index = index;
  card.dataset.trackId = track.id;

  const trackTitle = track.title ? track.title.trim() : "Unknown Track";
  const trackArtist = track.artist ? track.artist.trim() : "Unknown Artist";
  const coverUrl = getOptimalCoverUrl(track.thumbnail, track.source);
  const fallbackCoverUrl = getFallbackCoverUrl(track.thumbnail);
  
  const isLiked = likedTrackIds.has(track.id);

  const playsText = track.source === 'soundcloud' && (track.playbackCount !== undefined || track.playback_count !== undefined)
    ? `▷ ${formatPlaybackCount(track.playbackCount || track.playback_count)}`
    : '';

  const isCurrentPlaying = isActive && !audioPlayer.paused;
  const playButtonIcon = isCurrentPlaying
    ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
    : `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 2px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;

  card.innerHTML = `
    <img src="${coverUrl}" class="card-cover-horizontal" alt="" loading="lazy" decoding="async" onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='${fallbackCoverUrl}';}">
    <div class="card-details-horizontal">
      <div class="card-title-horizontal">${escapeHTML(trackTitle)}</div>
      <div class="card-artist-horizontal">${escapeHTML(trackArtist)}</div>
      <div class="card-meta-horizontal">
        <span class="badge ${track.source}" style="display:inline-flex;align-items:center;">
          ${track.source === 'soundcloud'
            ? `<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style="margin-right:3px"><path d="M23.95 14.47c0-2.45-1.92-4.44-4.29-4.44h-.35c-.48-2.61-2.73-4.6-5.46-4.6-2.58 0-4.73 1.83-5.32 4.26-.26-.06-.53-.09-.81-.09-2.58 0-4.67 2.09-4.67 4.67 0 .16.01.32.02.48C1.29 14.53 0 16.03 0 17.84c0 2.08 1.68 3.76 3.76 3.76h16.5c1.96 0 3.69-1.55 3.69-3.51 0-1.74-1.28-3.18-2.97-3.52z"/></svg>SC`
            : track.source === 'spotify'
            ? `<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style="margin-right:3px"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.377-1.454-5.37-1.783-8.894-.978-.335.077-.67-.134-.746-.47-.077-.335.134-.67.47-.746 3.847-.88 7.143-.51 9.814 1.127.294.18.387.563.207.857zm1.225-2.72c-.227.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.082-1.182-.413.125-.847-.107-.972-.52-.125-.413.107-.847.52-.972 3.676-1.116 8.243-.57 11.348 1.337.367.227.487.707.26 1.074zm.107-2.834C14.484 8.7 8.012 8.483 4.262 9.622c-.573.173-1.182-.154-1.355-.727-.173-.573.154-1.182.727-1.355 4.3-1.305 11.442-1.055 15.534 1.373.515.305.683.97.378 1.485-.305.515-.97.683-1.485.378z"/></svg>SP`
            : `<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style="margin-right:3px"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>YT`}
        </span>
        ${playsText ? `<span>${playsText}</span><span>•</span>` : ''}
        <span>${track.duration}</span>
      </div>
    </div>
    <div class="card-actions-horizontal">
      <button class="card-play-btn-horizontal" title="Слушать" aria-label="Воспроизвести или приостановить ${escapeHTML(trackTitle)}">
        ${playButtonIcon}
      </button>
      <button class="card-like-btn-horizontal ${isLiked ? 'liked' : ''}" title="В избранное" aria-label="${isLiked ? 'Убрать из избранного' : 'Добавить в избранное'}" aria-pressed="${isLiked}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </button>
      <button class="card-more-btn-horizontal" title="Добавить в плейлист" aria-label="Добавить ${escapeHTML(trackTitle)} в плейлист">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-more-btn-horizontal') || e.target.closest('.card-play-btn-horizontal') || e.target.closest('.card-like-btn-horizontal')) return;
    playOrToggle(track, index, sectionTracks);
  });

  card.querySelector('.card-play-btn-horizontal').addEventListener('click', (e) => {
    e.stopPropagation();
    playOrToggle(track, index, sectionTracks);
  });

  card.querySelector('.card-more-btn-horizontal').addEventListener('click', (e) => {
    e.stopPropagation();
    showPlaylistMenu(e, track);
  });

  card.querySelector('.card-like-btn-horizontal').addEventListener('click', (e) => {
    toggleLike(e, track);
  });

  return card;
}

function playOrToggle(track, index, sectionTracks) {
  const isCurrent = activePlayingTrack && track.id === activePlayingTrack.id;
  if (isCurrent) {
    togglePlay();
  } else {
    playlist = sectionTracks;
    playTrack(index);
  }
}

function renderGenreTracks(tracks, tagName) {
  const contentArea = document.getElementById('home-content-area');
  if (!contentArea) return;
  contentArea.innerHTML = '';

  const sectionEl = document.createElement('div');
  sectionEl.className = 'home-section';

  const titleEl = document.createElement('div');
  titleEl.className = 'home-section-title';
  titleEl.textContent = `Жанр: ${tagName}`;
  sectionEl.appendChild(titleEl);

  const grid = document.createElement('div');
  grid.className = 'tracks-layout-grid';
  sectionEl.appendChild(grid);

  if (tracks && tracks.length > 0) {
    playlist = tracks;
    renderTracks(tracks, grid);
  } else {
    grid.innerHTML = '<div class="inline-empty-state">В этом жанре пока нет доступных треков</div>';
  }

  contentArea.appendChild(sectionEl);
}

// --- Step 3 Artist Profile View Loader ---

async function loadArtistView(artistId) {
  // Guard: don't attempt load if artistId is missing or invalid
  if (!artistId || artistId === 'undefined' || artistId === 'null' || artistId === '') {
    console.warn('[Renderer] loadArtistView called with invalid artistId:', artistId);
    // Fall back to searching by artist name instead
    const track = playlist[currentTrackIndex];
    if (track && searchInput) {
      searchInput.value = track.artist;
      performSearch();
    }
    return;
  }

  activeView = 'artist';
  welcomeScreen.classList.add('hidden');
  tracksContainer.classList.add('hidden');
  loadingIndicator.classList.remove('hidden');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${BACKEND_URL}/search/artist/${artistId}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await response.json();
    loadingIndicator.classList.add('hidden');

    if (data.status === 'success' && data.results) {
      renderArtistProfile(data.results);
      tracksContainer.classList.remove('hidden');
    } else {
      renderArtistProfileError();
    }
    updateActiveTab('artist');
  } catch (error) {
    console.error('[Renderer] Failed to load artist view:', error);
    loadingIndicator.classList.add('hidden');
    const isTimeout = error.name === 'AbortError';
    const msg = isTimeout
      ? 'Сервер не ответил вовремя. Попробуйте ещё раз.'
      : 'Не удалось загрузить профиль артиста. Проверьте соединение.';
    renderArtistProfileError(isTimeout ? '\u0422\u0430\u0439\u043c\u0430\u0443\u0442' : '\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438', msg);
    updateActiveTab('artist');
  }
}

function renderArtistProfileError(title = '\u0410\u0440\u0442\u0438\u0441\u0442 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d', message = 'SoundCloud \u043d\u0435 \u043e\u0442\u0434\u0430\u043b \u0434\u0430\u043d\u043d\u044b\u0435 \u043f\u0440\u043e\u0444\u0438\u043b\u044f.') {
  const track = playlist[currentTrackIndex];
  const artistName = track?.artist || searchInput?.value || '';
  tracksContainer.innerHTML = `
    <div class="welcome-state artist-profile-error">
      <h2>${title}</h2>
      <p>${message}</p>
      <button id="artist-global-search-btn" class="view-btn">
        <span>\u0418\u0441\u043a\u0430\u0442\u044c \u0442\u0440\u0435\u043a\u0438 \u0430\u0440\u0442\u0438\u0441\u0442\u0430 \u0447\u0435\u0440\u0435\u0437 \u0433\u043b\u043e\u0431\u0430\u043b\u044c\u043d\u044b\u0439 \u043f\u043e\u0438\u0441\u043a</span>
      </button>
    </div>
  `;
  tracksContainer.classList.remove('hidden');

  const searchBtn = document.getElementById('artist-global-search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      if (!artistName || !searchInput) return;
      searchInput.value = artistName;
      performSearch();
    });
  }
}

function renderArtistProfile(artistData) {
  tracksContainer.innerHTML = '';

  const followed = isArtistFollowed(artistData.id);
  const followBtnHTML = followed
    ? `<button id="follow-artist-btn" class="view-btn active" style="align-self: flex-start; margin-top: 8px;">
         <span>Отписаться</span>
       </button>`
    : `<button id="follow-artist-btn" class="view-btn" style="align-self: flex-start; margin-top: 8px;">
         <span>Подписаться</span>
       </button>`;

  const header = document.createElement('div');
  header.className = 'artist-header';
  header.innerHTML = `
    <img class="artist-avatar" src="${artistData.avatar || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'40\' fill=\'%23333\'/></svg>'}" alt="${artistData.name}">
    <div class="artist-info" style="display: flex; flex-direction: column;">
      <button id="back-to-previous" class="view-btn" style="align-self: flex-start; margin-bottom: 8px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        <span>Назад</span>
      </button>
      <h2>${artistData.name}</h2>
      <span class="artist-meta">${artistData.followers.toLocaleString()} подписчиков</span>
      ${followBtnHTML}
      <p class="artist-desc" style="margin-top: 10px;">${artistData.description || 'Описание отсутствует.'}</p>
    </div>
  `;
  tracksContainer.appendChild(header);

  const followBtn = header.querySelector('#follow-artist-btn');
  followBtn.addEventListener('click', () => {
    const nowFollowed = toggleFollowArtist(artistData);
    if (nowFollowed) {
      followBtn.classList.add('active');
      followBtn.querySelector('span').textContent = 'Отписаться';
    } else {
      followBtn.classList.remove('active');
      followBtn.querySelector('span').textContent = 'Подписаться';
    }
  });

  document.getElementById('back-to-previous').addEventListener('click', () => {
    loadHomeView();
  });

  const sections = document.createElement('div');
  sections.className = 'artist-sections';

  // Tracks Section
  if (artistData.tracks && artistData.tracks.length > 0) {
    const tracksSection = document.createElement('div');
    tracksSection.className = 'home-section';
    tracksSection.innerHTML = '<div class="home-section-title">Популярные треки</div>';

    const tracksGrid = document.createElement('div');
    tracksGrid.className = 'tracks-layout-grid';
    tracksSection.appendChild(tracksGrid);

    sections.appendChild(tracksSection);

    renderTracksForSection(artistData.tracks, tracksGrid);
  }

  // Playlists Section
  if (artistData.playlists && artistData.playlists.length > 0) {
    const playlistsSection = document.createElement('div');
    playlistsSection.className = 'home-section';
    playlistsSection.innerHTML = '<div class="home-section-title">Плейлисты артиста</div>';

    const scroller = document.createElement('div');
    scroller.className = 'scroller-container';
    playlistsSection.appendChild(scroller);

    artistData.playlists.forEach(pl => {
      const card = document.createElement('div');
      card.className = 'playlist-card';
      card.style.flex = '0 0 220px';
      card.style.cursor = 'pointer';

      const plThumbnail = getOptimalCoverUrl(pl.thumbnail);
      const fallbackPlThumbnail = getFallbackCoverUrl(pl.thumbnail);

      card.innerHTML = `
        <img src="${plThumbnail}" onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='${fallbackPlThumbnail}';}" style="width:100%; height:120px; object-fit:cover; border-radius:8px;">
        <div class="playlist-card-title" style="margin-top:8px;">${pl.name}</div>
        <div class="playlist-card-count">${pl.tracksCount} треков</div>
      `;

      card.addEventListener('click', () => {
        loadArtistPlaylist(pl.id, pl.name);
      });

      scroller.appendChild(card);
    });

    sections.appendChild(playlistsSection);
  }

  tracksContainer.appendChild(sections);
  tracksContainer.classList.remove('hidden');
}

async function loadArtistPlaylist(playlistId, playlistName) {
  activeView = 'playlist-tracks';
  activePlaylistId = null; // remote SoundCloud playlist
  welcomeScreen.classList.add('hidden');
  tracksContainer.classList.add('hidden');
  loadingIndicator.classList.remove('hidden');

  try {
    const response = await fetch(`${BACKEND_URL}/search/playlist/${playlistId}`);
    const data = await response.json();
    loadingIndicator.classList.add('hidden');

    if (data.status === 'success' && data.results) {
      playlist = data.results;

      tracksContainer.innerHTML = '';
      const viewHeader = document.createElement('div');
      viewHeader.className = 'view-header';
      viewHeader.innerHTML = `
        <div class="view-header-title">
          <button id="back-to-artist" class="view-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            <span>Назад</span>
          </button>
          <span>${playlistName}</span>
          <span class="view-header-subtitle">(${playlist.length} треков)</span>
        </div>
      `;
      tracksContainer.appendChild(viewHeader);

      document.getElementById('back-to-artist').addEventListener('click', () => {
        const artistId = playlist[0]?.artistId || artistData?.id || '';
        if (artistId) {
          loadArtistView(artistId);
        } else {
          loadHomeView();
        }
      });

      if (playlist.length > 0) {
        const listGrid = document.createElement('div');
        listGrid.className = 'tracks-layout-grid';
        tracksContainer.appendChild(listGrid);
        renderTracks(playlist, listGrid);
      } else {
        const emptyState = document.createElement('div');
        emptyState.className = 'welcome-state';
        emptyState.innerHTML = '<h2>Плейлист пуст</h2>';
        tracksContainer.appendChild(emptyState);
      }
      tracksContainer.classList.remove('hidden');
    } else {
      tracksContainer.innerHTML = '<div class="welcome-state"><h2>Плейлист не найден</h2></div>';
      tracksContainer.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Failed to load artist playlist:', error);
    loadingIndicator.classList.add('hidden');
    tracksContainer.innerHTML = '<div class="welcome-state"><h2>Ошибка сети</h2></div>';
    tracksContainer.classList.remove('hidden');
  }
}

// --- Step 3 Search History Autocomplete Dropdown Logic ---

function getSearchHistory() {
  const data = localStorage.getItem(getStorageKey('search_history'));
  return data ? JSON.parse(data) : [];
}

function saveSearchHistory(history) {
  localStorage.setItem(getStorageKey('search_history'), JSON.stringify(history));
}

function addToSearchHistory(query) {
  const cleaned = query.trim();
  if (!cleaned) return;

  let history = getSearchHistory();
  history = history.filter(q => q.toLowerCase() !== cleaned.toLowerCase());
  history.unshift(cleaned);
  if (history.length > 5) {
    history = history.slice(0, 5);
  }
  saveSearchHistory(history);
  invalidateHomeRecommendations();
}

function showSearchHistory() {
  const history = getSearchHistory();
  if (searchInput.value.trim() !== '') {
    searchHistoryDropdown.classList.add('hidden');
    return;
  }

  searchHistoryDropdown.innerHTML = '';

  // 1. Render Sources Selection Block at the top of the dropdown
  const sourcesContainer = document.createElement('div');
  sourcesContainer.className = 'dropdown-sources-container';
  sourcesContainer.innerHTML = `
    <div class="search-history-header">Источники поиска</div>
    <div class="dropdown-sources-row">
      <button id="source-sc" class="source-pill ${activeSources.soundcloud ? 'active' : ''}" title="SoundCloud">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.95 14.47c0-2.45-1.92-4.44-4.29-4.44h-.35c-.48-2.61-2.73-4.6-5.46-4.6-2.58 0-4.73 1.83-5.32 4.26-.26-.06-.53-.09-.81-.09-2.58 0-4.67 2.09-4.67 4.67 0 .16.01.32.02.48C1.29 14.53 0 16.03 0 17.84c0 2.08 1.68 3.76 3.76 3.76h16.5c1.96 0 3.69-1.55 3.69-3.51 0-1.74-1.28-3.18-2.97-3.52z"/></svg>
      </button>
      <button id="source-sp" class="source-pill ${activeSources.spotify ? 'active' : ''}" title="Spotify">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.377-1.454-5.37-1.783-8.894-.978-.335.077-.67-.134-.746-.47-.077-.335.134-.67.47-.746 3.847-.88 7.143-.51 9.814 1.127.294.18.387.563.207.857s-.563.387-.857.207zm1.225-2.72c-.227.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.082-1.182-.413.125-.847-.107-.972-.52-.125-.413.107-.847.52-.972 3.676-1.116 8.243-.57 11.348 1.337.367.227.487.707.26 1.074zm.107-2.834C14.484 8.7 8.012 8.483 4.262 9.622c-.573.173-1.182-.154-1.355-.727-.173-.573.154-1.182.727-1.355 4.3-1.305 11.442-1.055 15.534 1.373.515.305.683.97.378 1.485-.305.515-.97.683-1.485.378z"/></svg>
      </button>
    </div>
  `;

  searchHistoryDropdown.appendChild(sourcesContainer);

  const newSourceScBtn = sourcesContainer.querySelector('#source-sc');
  const newSourceSpBtn = sourcesContainer.querySelector('#source-sp');

  [
    { btn: newSourceScBtn, name: 'soundcloud' },
    { btn: newSourceSpBtn, name: 'spotify' }
  ].forEach(({ btn, name }) => {
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();

        const activeCount = Object.values(activeSources).filter(Boolean).length;
        if (activeCount === 1 && activeSources[name]) {
          return; // Prevent deselecting last source
        }

        activeSources[name] = !activeSources[name];
        btn.classList.toggle('active', activeSources[name]);
      });
    }
  });

  // 2. Render History if not empty
  if (history.length > 0) {
    const historyHeader = document.createElement('div');
    historyHeader.className = 'search-history-header';
    historyHeader.style.marginTop = '10px';
    historyHeader.style.borderTop = '1px solid rgba(255, 255, 255, 0.05)';
    historyHeader.style.paddingTop = '8px';
    historyHeader.innerHTML = `
      <span>История поиска</span>
      <span class="search-history-clear" id="clear-history-btn">Очистить</span>
    `;
    searchHistoryDropdown.appendChild(historyHeader);

    history.forEach(q => {
      const item = document.createElement('div');
      item.className = 'search-history-item';
      item.innerHTML = `
        <span class="history-query-text">${q}</span>
        <span class="search-history-delete" data-query="${q}">✕</span>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.search-history-delete')) {
          return; // Handled by delete button click
        }
        searchInput.value = q;
        searchHistoryDropdown.classList.add('hidden');
        performSearch();
      });

      item.querySelector('.search-history-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSearchHistoryItem(q);
      });

      searchHistoryDropdown.appendChild(item);
    });

    const clearHistoryBtn = historyHeader.querySelector('#clear-history-btn');
    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearSearchHistory();
      });
    }
  }

  searchHistoryDropdown.classList.remove('hidden');
}

function deleteSearchHistoryItem(query) {
  let history = getSearchHistory();
  history = history.filter(q => q !== query);
  saveSearchHistory(history);
  showSearchHistory();
}

function clearSearchHistory() {
  saveSearchHistory([]);
  searchHistoryDropdown.classList.add('hidden');
}

// --- Step 3 Settings & Themes Controller ---

function loadSettingsView() {
  activeView = 'settings';
  searchInput.value = '';
  welcomeScreen.classList.add('hidden');
  tracksContainer.classList.add('hidden');
  loadingIndicator.classList.remove('hidden');

  setTimeout(() => {
    renderSettings();
  }, 100);
}

function loadStudioView(tab = 'visual') {
  activeView = 'studio';
  searchInput.value = '';
  welcomeScreen.classList.add('hidden');
  tracksContainer.classList.add('hidden');
  loadingIndicator.classList.remove('hidden');

  setTimeout(() => {
    renderSettings({ scope: 'studio', studioTab: tab });
  }, 100);
}

function loadStatsView() {
  activeView = 'stats';
  searchInput.value = '';
  welcomeScreen.classList.add('hidden');
  tracksContainer.classList.add('hidden');
  loadingIndicator.classList.remove('hidden');

  setTimeout(() => {
    renderSettings({ scope: 'stats' });
  }, 100);
}

// Render Profile & Auth Card
function renderProfileContainer() {
  const container = document.getElementById('profile-section-container');
  if (!container) return;

  if (!currentUser) {
    // Guest form
    container.innerHTML = `
      <div class="glass-auth-container">
        <h2>${isRegistering ? 'Регистрация' : 'Вход в аккаунт'}</h2>
        <div id="auth-error" class="auth-error-msg hidden"></div>
        <div class="auth-form-group">
          <input type="text" id="auth-username" placeholder="Имя пользователя (@username)" autocomplete="off">
          ${isRegistering ? '<input type="text" id="auth-displayname" placeholder="Имя профиля" autocomplete="off">' : ''}
          <input type="password" id="auth-password" placeholder="Пароль">
        </div>
        <button id="auth-submit-btn" class="auth-action-btn">${isRegistering ? 'Создать аккаунт' : 'Войти'}</button>
        <div class="auth-switch-prompt">
          ${isRegistering ? 'Уже есть аккаунт?' : 'Нет аккаунта?'}
          <span id="auth-switch-btn" class="auth-switch-link">${isRegistering ? 'Войти' : 'Зарегистрироваться'}</span>
        </div>
      </div>
    `;

    document.getElementById('auth-switch-btn').addEventListener('click', () => {
      isRegistering = !isRegistering;
      renderProfileContainer();
    });

    document.getElementById('auth-submit-btn').addEventListener('click', handleAuthSubmit);
  } else {
    // Logged in profile panel
    const avatarSrc = currentUser.avatarBase64 || DEFAULT_AVATAR_90;

    container.innerHTML = `
      <div class="profile-dashboard-card">
        <img class="profile-dashboard-avatar" src="${avatarSrc}" alt="Avatar">
        <div class="profile-dashboard-details">
          <div class="profile-dashboard-displayname">${escapeHTML(currentUser.displayName)}</div>
          <div class="profile-dashboard-username">@${escapeHTML(currentUser.username)}</div>
          <div class="profile-dashboard-bio">${escapeHTML(currentUser.bio || 'Нет описания')}</div>
        </div>
        <div class="profile-dashboard-actions">
          <button id="profile-edit-btn" class="profile-action-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            Редактировать
          </button>
          <button id="profile-logout-btn" class="profile-action-btn logout">
            Выйти
          </button>
        </div>
      </div>
    `;

    document.getElementById('profile-edit-btn').addEventListener('click', openEditProfileModal);
    document.getElementById('profile-logout-btn').addEventListener('click', handleLogout);
  }
}

function renderSettings(options = {}) {
  loadingIndicator.classList.add('hidden');
  tracksContainer.innerHTML = '';
  const scope = options.scope || 'settings';
  const studioTab = options.studioTab || 'visual';

  const totalSeconds = parseFloat(localStorage.getItem('gp_stats_total_seconds')) || 0;
  const totalHours = (totalSeconds / 3600).toFixed(1);

  const stats = getProfilePlayStats();
  const topTracks = Object.values(stats)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const customTheme = getStoredCustomTheme();

  const viewHeader = document.createElement('div');
  viewHeader.className = 'view-header';
  const headerCopy = scope === 'studio'
    ? {
        title: 'Studio',
        subtitle: studioTab === 'audio' ? 'Audio effects and equalizer' : 'Visual theme constructor'
      }
    : scope === 'stats'
      ? { title: 'Stats', subtitle: 'Listening analytics' }
      : { title: 'Profile & Settings', subtitle: '' };
  const headerIcon = scope === 'studio'
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h5a4 4 0 0 0 4-4c0-3.3-4-6-9-6Z"/><circle cx="7.5" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="6.7" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="7" r="1" fill="currentColor" stroke="none"/></svg>'
    : scope === 'stats'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  viewHeader.innerHTML = `
    <div class="view-header-title">
      ${headerIcon}
      <span>${headerCopy.title}</span>
      ${headerCopy.subtitle ? `<span class="view-header-subtitle">${headerCopy.subtitle}</span>` : ``}
    </div>
  `;
  tracksContainer.appendChild(viewHeader);

  if (scope === 'settings') {
    const profileSection = document.createElement('div');
    profileSection.id = 'profile-section-container';
    tracksContainer.appendChild(profileSection);
    renderProfileContainer();
  }

  const panel = document.createElement('div');
  panel.className = 'settings-panel';

  const currentTheme = localStorage.getItem('gp_theme') || 'theme-dark-glass';

  panel.innerHTML = `
    ${scope === 'studio' ? `
      <div class="studio-tabs">
        <button id="studio-visual-tab" class="studio-tab-btn ${studioTab === 'visual' ? 'active' : ''}" type="button">Visual</button>
        <button id="studio-audio-tab" class="studio-tab-btn ${studioTab === 'audio' ? 'active' : ''}" type="button">Audio</button>
      </div>
    ` : ''}
    <div class="settings-section" data-section="theme-presets">
      <h3>Тема оформления</h3>
      <div class="theme-options" role="group" aria-label="Предустановки темы">
        <button class="theme-option-btn ${currentTheme === 'theme-dark-glass' ? 'active' : ''}" data-theme="theme-dark-glass" aria-pressed="${currentTheme === 'theme-dark-glass'}">
          <span>Dark Glass</span>
          <div class="theme-preview dark"></div>
        </button>
        <button class="theme-option-btn ${currentTheme === 'theme-pink-white' ? 'active' : ''}" data-theme="theme-pink-white" aria-pressed="${currentTheme === 'theme-pink-white'}">
          <span>Pink-White Glass</span>
          <div class="theme-preview pink"></div>
        </button>
        <button class="theme-option-btn ${currentTheme === 'theme-silver-matrix' ? 'active' : ''}" data-theme="theme-silver-matrix" aria-pressed="${currentTheme === 'theme-silver-matrix'}">
          <span>Silver Matrix</span>
          <div class="theme-preview silver"></div>
        </button>
        <button class="theme-option-btn ${currentTheme === 'custom' ? 'active' : ''}" data-theme="custom" aria-pressed="${currentTheme === 'custom'}">
          <span>Custom</span>
          <div class="theme-preview custom"></div>
        </button>
      </div>
    </div>

    <div class="settings-section ${currentTheme !== 'custom' ? 'disabled-customizer' : ''}" data-section="theme-constructor" id="theme-constructor-section" style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
        <h3 style="margin: 0;">Конструктор темы</h3>
        <button id="theme-reset-btn" class="view-btn" style="padding: 4px 10px; font-size: 11px; height: auto;">
          <span>Сброс темы</span>
        </button>
      </div>

      <!-- Группа 1: Палитра и цвета -->
      <div class="theme-constructor-group" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px; margin-bottom: 14px;">
        <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; margin-bottom: 12px;">
          Палитра и цвета
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Цвет фона 1:</span>
            <input type="color" id="theme-bg-color1" value="${customTheme.bgColor1 || '#1e1e24'}" style="width: 100%; height: 36px; border: none; border-radius: 6px; background: transparent; cursor: pointer;">
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Цвет фона 2:</span>
            <input type="color" id="theme-bg-color2" value="${customTheme.bgColor2 || '#0a0a0c'}" style="width: 100%; height: 36px; border: none; border-radius: 6px; background: transparent; cursor: pointer;">
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px; grid-column: span 2;">
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: rgba(255,255,255,0.5);">Угол градиента:</span>
              <span id="angle-val-text" style="color: #fff;">${customTheme.bgAngle !== undefined ? customTheme.bgAngle : 135}°</span>
            </div>
            <input type="range" id="theme-bg-angle" min="0" max="360" value="${customTheme.bgAngle !== undefined ? customTheme.bgAngle : 135}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Цвет текста:</span>
            <input type="color" id="theme-text-color" value="${customTheme.textColor || '#f5f5f7'}" style="width: 100%; height: 36px; border: none; border-radius: 6px; background: transparent; cursor: pointer;">
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Акцентный цвет:</span>
            <input type="color" id="theme-accent-color" value="${customTheme.accentColor || '#ffffff'}" style="width: 100%; height: 36px; border: none; border-radius: 6px; background: transparent; cursor: pointer;">
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Нижняя панель:</span>
            <input type="color" id="theme-player-color" value="${customTheme.playerBg || '#050505'}" style="width: 100%; height: 36px; border: none; border-radius: 6px; background: transparent; cursor: pointer;">
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Фон карточек:</span>
            <input type="color" id="theme-card-color" value="${customTheme.cardBg || '#ffffff'}" style="width: 100%; height: 36px; border: none; border-radius: 6px; background: transparent; cursor: pointer;">
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px; grid-column: span 2;">
            <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Шрифт:</span>
            <select id="theme-font-family" style="width: 100%; height: 36px; padding: 0 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: #fff; font-size: 13px; cursor: pointer;">
              ${['Inter', 'Outfit', 'Montserrat', 'Fira Code', 'Playfair Display'].map(font => `
                <option value="${font}" ${customTheme.fontFamily === font ? 'selected' : ''}>${font}</option>
              `).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- Группа 2: Стекло и прозрачность -->
      <div class="theme-constructor-group" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px; margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7;">
            Стекло и прозрачность (Glassmorphism)
          </div>
          <label class="switch" style="transform: scale(0.85); transform-origin: right center;">
            <input type="checkbox" id="theme-glass-enabled" ${customTheme.glassEnabled !== false ? 'checked' : ''}>
            <span class="slider round"></span>
          </label>
        </div>

        <div id="theme-glass-controls" style="display: flex; flex-direction: column; gap: 12px; transition: opacity 0.2s ease;">
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: rgba(255,255,255,0.5);">Размытие стекла (blur):</span>
              <span id="blur-val-text" style="color: #fff;">${customTheme.blur}px</span>
            </div>
            <input type="range" id="theme-blur-slider" min="0" max="60" value="${customTheme.blur}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: rgba(255,255,255,0.5);">Насыщенность под стеклом (saturation):</span>
              <span id="sat-val-text" style="color: #fff;">${customTheme.saturation || 140}%</span>
            </div>
            <input type="range" id="theme-saturation-slider" min="100" max="200" value="${customTheme.saturation || 140}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: rgba(255,255,255,0.5);">Прозрачность панелей (0% сплошные, 100% стекло):</span>
              <span id="transparency-val-text" style="color: #fff;">${Math.round((customTheme.panelTransparency ?? 0.55) * 100)}%</span>
            </div>
            <input type="range" id="theme-transparency-slider" min="0" max="100" value="${Math.round((customTheme.panelTransparency ?? 0.55) * 100)}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.06);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; justify-content: space-between; width: 100%; font-size: 12px;">
                <span style="color: rgba(255,255,255,0.5);">Прозрачность мини-плеера:</span>
                <span id="mini-transparency-val-text" style="color: #fff;">${customTheme.miniTransparency !== null && customTheme.miniTransparency !== undefined ? Math.round(customTheme.miniTransparency * 100) + '%' : 'Как у панелей'}</span>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
              <input type="checkbox" id="theme-mini-trans-sync" ${customTheme.miniTransparency === null || customTheme.miniTransparency === undefined ? 'checked' : ''} style="accent-color: var(--accent-color, #30d158); cursor: pointer;">
              <label for="theme-mini-trans-sync" style="font-size: 11px; opacity: 0.6; cursor: pointer;">Синхронизировать с основными панелями</label>
            </div>
            <input type="range" id="theme-mini-transparency-slider" min="0" max="100" value="${customTheme.miniTransparency !== null && customTheme.miniTransparency !== undefined ? Math.round(customTheme.miniTransparency * 100) : Math.round((customTheme.panelTransparency ?? 0.55) * 100)}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer; ${customTheme.miniTransparency === null || customTheme.miniTransparency === undefined ? 'opacity: 0.4; pointer-events: none;' : ''}">
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Стиль поверхностей:</span>
            <select id="theme-card-style" style="width: 100%; height: 36px; padding: 0 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: #fff; font-size: 13px; cursor: pointer;">
              ${[
                { val: 'glass', text: 'Стекло (Glass — по слайдеру)' },
                { val: 'frosted', text: 'Матовое стекло (Frosted — глубокий блюр)' },
                { val: 'solid', text: 'Плотные панели (Solid — без блюра)' },
                { val: 'flat', text: 'Плоский минимализм (Flat — без теней и блюра)' }
              ].map(opt => `
                <option value="${opt.val}" ${customTheme.cardStyle === opt.val ? 'selected' : ''}>${opt.text}</option>
              `).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- Группа 3: Свечение и геометрия -->
      <div class="theme-constructor-group" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px; margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7;">
            Свечение и геометрия
          </div>
          <label class="switch" style="transform: scale(0.85); transform-origin: right center;">
            <input type="checkbox" id="theme-glow-enabled" ${customTheme.glowEnabled !== false ? 'checked' : ''}>
            <span class="slider round"></span>
          </label>
        </div>

        <div id="theme-glow-controls" style="display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: rgba(255,255,255,0.5);">Интенсивность свечения (glow):</span>
              <span id="glow-val-text" style="color: #fff;">${customTheme.glow !== undefined ? Math.round(customTheme.glow * 100) : 25}%</span>
            </div>
            <input type="range" id="theme-glow-slider" min="0" max="100" value="${customTheme.glow !== undefined ? Math.round(customTheme.glow * 100) : 25}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Цвет свечения:</span>
            <input type="color" id="theme-glow-color" value="${customTheme.glowColor || '#ffffff'}" style="width: 100%; height: 36px; border: none; border-radius: 6px; background: transparent; cursor: pointer;">
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.06);">
            <span style="font-size: 12px; color: rgba(255,255,255,0.7);">Объёмные тени (Shadows):</span>
            <label class="switch" style="transform: scale(0.85); transform-origin: right center;">
              <input type="checkbox" id="theme-shadows-enabled" ${customTheme.shadowsEnabled !== false ? 'checked' : ''}>
              <span class="slider round"></span>
            </label>
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: rgba(255,255,255,0.5);">Скругление углов (radius):</span>
              <span id="radius-val-text" style="color: #fff;">${customTheme.windowRadius !== undefined ? customTheme.windowRadius : 12}px</span>
            </div>
            <input type="range" id="theme-radius-slider" min="0" max="32" value="${customTheme.windowRadius !== undefined ? customTheme.windowRadius : 12}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: rgba(255,255,255,0.5);">Толщина границ:</span>
              <span id="border-width-val-text" style="color: #fff;">${customTheme.borderWidth !== undefined ? customTheme.borderWidth : '1px'}</span>
            </div>
            <input type="range" id="theme-border-width" min="0" max="4" step="0.5" value="${parseFloat(customTheme.borderWidth !== undefined ? customTheme.borderWidth : 1)}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
          </div>
        </div>
      </div>

      <!-- Группа 4: Фоновые эффекты и подложка -->
      <div class="theme-constructor-group" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px; margin-bottom: 14px;">
        <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; margin-bottom: 12px;">
          Фоновые эффекты и подложка
        </div>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Фоновый эффект:</span>
            <select id="theme-bg-effect" style="width: 100%; height: 36px; padding: 0 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: #fff; font-size: 13px; cursor: pointer;">
              ${[
                { val: 'none', text: 'Без эффекта (Статичный)' },
                { val: 'aurora', text: 'Северное сияние (Aurora)' },
                { val: 'liquid', text: 'Жидкие сферы (Liquid Sphere)' },
                { val: 'particles', text: 'Атмосферные частицы (Particles)' }
              ].map(opt => `
                <option value="${opt.val}" ${customTheme.bgEffect === opt.val ? 'selected' : ''}>${opt.text}</option>
              `).join('')}
            </select>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 12px; color: rgba(255,255,255,0.7);">Анимация фона:</span>
            <label class="switch" style="transform: scale(0.85); transform-origin: right center;">
              <input type="checkbox" id="theme-animations-enabled" ${customTheme.animationsEnabled !== false ? 'checked' : ''}>
              <span class="slider round"></span>
            </label>
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: rgba(255,255,255,0.5);">Затемнение обоев (scrim):</span>
              <span id="scrim-val-text" style="color: #fff;">${Math.round((customTheme.wallpaperDim ?? 0.45) * 100)}%</span>
            </div>
            <input type="range" id="theme-scrim-slider" min="0" max="80" value="${Math.round((customTheme.wallpaperDim ?? 0.45) * 100)}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
          </div>
        </div>
      </div>

      <!-- Инструменты темы: экспорт, импорт, сохранение -->
      <div style="display: flex; gap: 10px; margin-top: 15px;">
        <button id="theme-export-btn" class="view-btn" style="flex: 1; justify-content: center;">
          <span>Скопировать код темы</span>
        </button>
      </div>

      <div class="saved-theme-tools">
        <input type="text" id="theme-save-name-input" class="theme-save-name-input" placeholder="Название темы">
        <button id="theme-save-btn" class="view-btn">
          <span>Сохранить</span>
        </button>
      </div>

      <div id="saved-themes-list" class="saved-themes-list"></div>

      <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 15px; margin-top: 15px; display: flex; flex-direction: column; gap: 8px;">
        <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Импорт темы по коду:</span>
        <div style="display: flex; gap: 8px;">
          <input type="text" id="theme-import-input" placeholder="Вставьте код темы (Base64)..." style="flex: 1; min-width: 0; max-width: calc(100% - 110px); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: #fff; font-size: 12px;">
          <button id="theme-import-btn" class="view-btn">
            <span>Применить</span>
          </button>
        </div>
      </div>
    </div>

    <div class="settings-section ${currentTheme !== 'custom' ? 'disabled-customizer' : ''}" data-section="background-image" id="background-image-section">
      <h3>Фон интерфейса (Фото / GIF / Видео)</h3>
      <div style="font-size: 11px; opacity: 0.65; margin-bottom: 12px; line-height: 1.4;">
        Загружайте собственные фото, анимированные GIF или зацикленные видео (MP4 / WebM до 8 сек, до 25 МБ). Работает 100% локально с нулевым расходом трафика.
      </div>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; gap: 10px; align-items: center;">
          <button id="bg-image-upload-btn" class="view-btn" style="flex: 1; justify-content: center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            <span style="margin-left: 6px;">Выбрать медиа (Фото/GIF/Видео)</span>
          </button>
          <button id="bg-image-clear-btn" class="view-btn danger ${localStorage.getItem('gp_bg_image') ? '' : 'hidden'}" style="justify-content: center;">
            <span>Сбросить</span>
          </button>
          <input type="file" id="bg-image-file-input" accept="image/*,video/mp4,video/webm,video/quicktime,.mp4,.webm,.gif,.mov" style="display: none;">
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; justify-content: space-between; font-size: 12px;">
            <span style="color: rgba(255,255,255,0.5);">Видимость обоев:</span>
            <span id="bg-opacity-val-text" style="color: #fff;">${localStorage.getItem('gp_bg_image_opacity') || 0}%</span>
          </div>
          <input type="range" id="bg-opacity-slider" min="0" max="100" value="${localStorage.getItem('gp_bg_image_opacity') || 0}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
        </div>
      </div>
    </div>

    <div class="settings-section" data-section="interface-effects">
      <h3>Эффекты интерфейса</h3>
      
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px;">
        <span style="font-size: 13px; color: rgba(255,255,255,0.7);">Динамический цвет обложки</span>
        <label class="switch">
          <input type="checkbox" id="dynamic-cover-checkbox" ${localStorage.getItem('gp_dynamic_cover') === 'true' ? 'checked' : ''}>
          <span class="slider round"></span>
        </label>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
        <span style="font-size: 13px; color: rgba(255,255,255,0.7);">Аудио-визуализатор</span>
        <label class="switch">
          <input type="checkbox" id="visualizer-checkbox" ${localStorage.getItem('gp_visualizer') === 'true' ? 'checked' : ''}>
          <span class="slider round"></span>
        </label>
      </div>
    </div>

    <div class="settings-section" data-section="audio-effects">
      <h3>Аудиоэффекты</h3>
      
      <div class="eq-panel">
        ${[
          { hz: 60, label: '60Hz' },
          { hz: 230, label: '230Hz' },
          { hz: 910, label: '910Hz' },
          { hz: 4000, label: '4kHz' },
          { hz: 14000, label: '14kHz' }
        ].map(band => `
          <label class="eq-band">
            <span class="eq-band-value" id="eq-${band.hz}-value">${localStorage.getItem(`gp_eq_${band.hz}`) || '0'}dB</span>
            <input class="eq-slider" data-frequency="${band.hz}" type="range" min="-12" max="12" step="1" value="${localStorage.getItem(`gp_eq_${band.hz}`) || '0'}">
            <span class="eq-band-label">${band.label}</span>
          </label>
        `).join('')}
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px;">
        <span style="font-size: 13px; color: rgba(255,255,255,0.7);">Bass Boost (+10dB 100Hz)</span>
        <label class="switch">
          <input type="checkbox" id="effect-bassboost-checkbox" ${localStorage.getItem('gp_effect_bassboost') === 'true' ? 'checked' : ''}>
          <span class="slider round"></span>
        </label>
      </div>

      <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 15px;">
        <div style="display: flex; justify-content: space-between; font-size: 12px;">
          <span style="color: rgba(255,255,255,0.5);">Скорость воспроизведения:</span>
          <span id="speed-val-text" style="color: #fff;">${localStorage.getItem('gp_effect_speed') || '1.0'}x</span>
        </div>
        <input type="range" id="effect-speed-slider" min="0.5" max="2.0" step="0.05" value="${localStorage.getItem('gp_effect_speed') || '1.0'}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
      </div>

      <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 15px;">
        <div style="display: flex; justify-content: space-between; font-size: 12px;">
          <span style="color: rgba(255,255,255,0.5);">Тональность (Pitch Shift):</span>
          <span id="pitch-val-text" style="color: #fff;">${localStorage.getItem('gp_effect_pitch_linked') === 'true' ? (localStorage.getItem('gp_effect_speed') || '1.0') : '1.0'}x</span>
        </div>
        <input type="range" id="effect-pitch-slider" min="0.5" max="2.0" step="0.05" value="${localStorage.getItem('gp_effect_pitch_linked') === 'true' ? (localStorage.getItem('gp_effect_speed') || '1.0') : '1.0'}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer; ${localStorage.getItem('gp_effect_pitch_linked') === 'true' ? '' : 'opacity: 0.5; pointer-events: none;'}">
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
        <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Связать тональность со скоростью (Nightcore)</span>
        <label class="switch">
          <input type="checkbox" id="effect-pitch-linked-checkbox" ${localStorage.getItem('gp_effect_pitch_linked') === 'true' ? 'checked' : ''}>
          <span class="slider round"></span>
        </label>
      </div>
    </div>

    <div class="settings-section" data-section="listening-stats">
      <h3>Статистика прослушивания</h3>
      <div class="settings-info-row">
        <span class="settings-info-label">Общее время прослушивания:</span>
        <span class="settings-info-value">${totalHours} ч</span>
      </div>
      <div style="margin-top: 12px; margin-bottom: 8px; font-weight: 500; font-size: 14px; color: rgba(255,255,255,0.7);">
        Топ-3 трека:
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${topTracks.length > 0 ? topTracks.map((track, i) => {
    const trackCover = getOptimalCoverUrl(track.thumbnail);
    const fallbackTrackCover = getFallbackCoverUrl(track.thumbnail);
    return `
            <div style="display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.03); padding: 6px 10px; border-radius: 6px;">
              <div style="font-weight: bold; color: #30d158; width: 15px;">${i + 1}</div>
              <img src="${trackCover}" onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='${fallbackTrackCover}';}" style="width: 32px; height: 32px; border-radius: 4px; object-fit: cover;">
              <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <div style="font-weight: 500; font-size: 13px; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${track.title}</div>
                <div style="font-size: 11px; color: rgba(255,255,255,0.5); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${track.artist}</div>
              </div>
              <div style="font-size: 12px; color: rgba(255,255,255,0.4);">${track.count} воспр.</div>
            </div>
          `;
  }).join('') : '<div style="color: rgba(255,255,255,0.4); font-size: 12px; padding: 4px 0;">Нет данных о прослушиваниях</div>'}
      </div>
    </div>

    <div class="settings-section" data-section="user-info">
      <h3>Информация о приложении</h3>
      <div class="settings-info-row">
        <span class="settings-info-label">Активный профиль:</span>
        <span class="settings-info-value" id="settings-profile-val">${currentProfile}</span>
      </div>
      <div class="settings-info-row">
        <span class="settings-info-label">Платформа:</span>
        <span class="settings-info-value">Electron Client</span>
      </div>
      <div class="settings-info-row">
        <span class="settings-info-label">Текущая версия:</span>
        <span class="settings-info-value">${APP_VERSION}</span>
      </div>
      <div class="settings-info-row" style="flex-direction: column; align-items: stretch; gap: 8px; margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 15px;">
        <span class="settings-info-label" style="font-weight: 600; margin-bottom: 2px;">Адрес сервера (API URL):</span>
        <div style="display: flex; gap: 8px; width: 100%;">
          <input type="text" id="settings-backend-url-input" class="search-box" value="${API_URL}" style="flex: 1; min-height: 38px; height: 38px; padding: 0 12px; font-size: 12px; margin: 0; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #fff;">
          <button id="settings-save-backend-btn" class="view-btn" style="height: 38px; padding: 0 16px; font-size: 12px; border-radius: 10px;">
            <span>Сохранить</span>
          </button>
          <button id="settings-reset-backend-btn" class="view-btn danger" style="height: 38px; padding: 0 16px; font-size: 12px; border-radius: 10px;">
            <span>Сброс</span>
          </button>
        </div>
        <p style="font-size: 11px; color: rgba(255,255,255,0.4); margin: 4px 0 0;">Используйте зеркало, если основной сервер Render заблокирован вашим провайдером.</p>
      </div>
      ${isElectron ? `
      <div style="margin-top: 15px; display: flex; justify-content: flex-start;">
        <button id="manual-check-updates-btn" class="view-btn" style="padding: 8px 16px; font-size: 12px; height: auto;">
          <span>Проверить обновление</span>
        </button>
      </div>
      ` : ''}
    </div>
  `;

  tracksContainer.appendChild(panel);

  const visibleSectionsByScope = {
    settings: ['interface-effects', 'user-info'],
    studio: studioTab === 'audio'
      ? ['audio-effects']
      : ['theme-presets', 'theme-constructor', 'background-image'],
    stats: ['listening-stats']
  };
  const visibleSections = visibleSectionsByScope[scope] || visibleSectionsByScope.settings;
  panel.querySelectorAll('[data-section]').forEach(section => {
    if (!visibleSections.includes(section.dataset.section)) {
      section.remove();
    }
  });

  const studioVisualTab = panel.querySelector('#studio-visual-tab');
  const studioAudioTab = panel.querySelector('#studio-audio-tab');
  if (studioVisualTab) {
    studioVisualTab.addEventListener('click', () => loadStudioView('visual'));
  }
  if (studioAudioTab) {
    studioAudioTab.addEventListener('click', () => loadStudioView('audio'));
  }

  const btns = panel.querySelectorAll('.theme-option-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selectedTheme = e.currentTarget.dataset.theme;
      applyTheme(selectedTheme);
      btns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      e.currentTarget.classList.add('active');
      e.currentTarget.setAttribute('aria-pressed', 'true');

      const constructorSec = panel.querySelector('#theme-constructor-section');
      const bgImageSec = panel.querySelector('#background-image-section');
      if (selectedTheme === 'custom') {
        constructorSec?.classList.remove('disabled-customizer');
        bgImageSec?.classList.remove('disabled-customizer');
      } else {
        constructorSec?.classList.add('disabled-customizer');
        bgImageSec?.classList.add('disabled-customizer');
      }
      renderSettings({ scope, studioTab });
    });
  });

  // Custom Theme Constructor bindings
  const customControlsEnabled = currentTheme === 'custom';
  ['#theme-constructor-section', '#background-image-section'].forEach((selector) => {
    const section = panel.querySelector(selector);
    if (!section) return;
    section.classList.toggle('disabled-customizer', !customControlsEnabled);
    section.toggleAttribute('inert', !customControlsEnabled);
    section.setAttribute('aria-disabled', String(!customControlsEnabled));
    section.querySelectorAll('input, select, button').forEach((control) => {
      control.disabled = !customControlsEnabled;
    });
  });

  function readThemeFromControls() {
    const stored = getStoredCustomTheme();
    const val = (id, fallback) => {
      const el = panel.querySelector(id);
      return el ? el.value : fallback;
    };
    const checked = (id, fallback) => {
      const el = panel.querySelector(id);
      return el ? el.checked : fallback;
    };

    const isGlass = checked('#theme-glass-enabled', stored.glassEnabled);
    const isGlow = checked('#theme-glow-enabled', stored.glowEnabled);
    const isShadows = checked('#theme-shadows-enabled', stored.shadowsEnabled);
    const isAnimations = checked('#theme-animations-enabled', stored.animationsEnabled);

    const blurVal = panel.querySelector('#theme-blur-slider') ? parseInt(panel.querySelector('#theme-blur-slider').value, 10) : stored.blur;
    const satVal = panel.querySelector('#theme-saturation-slider') ? parseInt(panel.querySelector('#theme-saturation-slider').value, 10) : (stored.saturation || 140);
    const transVal = panel.querySelector('#theme-transparency-slider') ? parseFloat(panel.querySelector('#theme-transparency-slider').value) / 100 : stored.panelTransparency;

    const syncMini = checked('#theme-mini-trans-sync', true);
    let miniTransVal = null;
    if (!syncMini && panel.querySelector('#theme-mini-transparency-slider')) {
      miniTransVal = parseFloat(panel.querySelector('#theme-mini-transparency-slider').value) / 100;
    }

    const glowVal = panel.querySelector('#theme-glow-slider') ? parseFloat(panel.querySelector('#theme-glow-slider').value) / 100 : stored.glow;
    const angleVal = panel.querySelector('#theme-bg-angle') ? parseInt(panel.querySelector('#theme-bg-angle').value, 10) : stored.bgAngle;
    const radiusVal = panel.querySelector('#theme-radius-slider') ? parseInt(panel.querySelector('#theme-radius-slider').value, 10) : stored.windowRadius;
    const borderVal = panel.querySelector('#theme-border-width') ? `${panel.querySelector('#theme-border-width').value}px` : stored.borderWidth;
    const scrimVal = panel.querySelector('#theme-scrim-slider') ? parseFloat(panel.querySelector('#theme-scrim-slider').value) / 100 : stored.wallpaperDim;

    return normalizeCustomTheme({
      version: 2,
      bgColor1: val('#theme-bg-color1', stored.bgColor1),
      bgColor2: val('#theme-bg-color2', stored.bgColor2),
      bgAngle: angleVal,
      textColor: val('#theme-text-color', stored.textColor),
      playerBg: val('#theme-player-color', stored.playerBg),
      cardBg: val('#theme-card-color', stored.cardBg),
      accentColor: val('#theme-accent-color', stored.accentColor),
      fontFamily: val('#theme-font-family', stored.fontFamily),
      glassEnabled: isGlass,
      blur: blurVal,
      saturation: satVal,
      panelTransparency: transVal,
      miniTransparency: miniTransVal,
      cardStyle: val('#theme-card-style', stored.cardStyle),
      glowEnabled: isGlow,
      glow: glowVal,
      glowColor: val('#theme-glow-color', stored.glowColor),
      shadowsEnabled: isShadows,
      windowRadius: radiusVal,
      borderWidth: borderVal,
      bgEffect: val('#theme-bg-effect', stored.bgEffect),
      animationsEnabled: isAnimations,
      wallpaperDim: scrimVal
    });
  }

  function updateCustomThemeFromUI() {
    const theme = readThemeFromControls();

    const setText = (id, text) => {
      const el = panel.querySelector(id);
      if (el) el.textContent = text;
    };

    setText('#angle-val-text', `${theme.bgAngle}°`);
    setText('#blur-val-text', `${theme.blur}px`);
    setText('#sat-val-text', `${theme.saturation}%`);
    setText('#transparency-val-text', `${Math.round(theme.panelTransparency * 100)}%`);
    setText('#mini-transparency-val-text', theme.miniTransparency !== null ? `${Math.round(theme.miniTransparency * 100)}%` : 'Как у панелей');
    setText('#glow-val-text', `${Math.round(theme.glow * 100)}%`);
    setText('#radius-val-text', `${theme.windowRadius}px`);
    setText('#border-width-val-text', theme.borderWidth);
    setText('#scrim-val-text', `${Math.round(theme.wallpaperDim * 100)}%`);

    commitCustomTheme(theme, { persist: true });

    btns.forEach(b => {
      if (b.dataset.theme === 'custom') {
        b.classList.add('active');
        b.setAttribute('aria-pressed', 'true');
      } else {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      }
    });
  }

  // Bind all constructor input controls
  const constructorInputs = panel.querySelectorAll('#theme-constructor-section input, #theme-constructor-section select');
  constructorInputs.forEach(input => {
    if (input.type === 'color' || input.type === 'range') {
      input.addEventListener('input', updateCustomThemeFromUI);
    } else if (input.type === 'checkbox' || input.tagName === 'SELECT') {
      input.addEventListener('change', updateCustomThemeFromUI);
    }
  });

  // Sync Mini Player Transparency toggle
  const themeMiniTransSyncCheck = panel.querySelector('#theme-mini-trans-sync');
  const themeMiniTransparencySlider = panel.querySelector('#theme-mini-transparency-slider');
  if (themeMiniTransSyncCheck && themeMiniTransparencySlider) {
    themeMiniTransSyncCheck.addEventListener('change', () => {
      if (themeMiniTransSyncCheck.checked) {
        themeMiniTransparencySlider.style.opacity = '0.4';
        themeMiniTransparencySlider.style.pointerEvents = 'none';
        const transSlider = panel.querySelector('#theme-transparency-slider');
        if (transSlider) themeMiniTransparencySlider.value = transSlider.value;
      } else {
        themeMiniTransparencySlider.style.opacity = '';
        themeMiniTransparencySlider.style.pointerEvents = '';
      }
      updateCustomThemeFromUI();
    });
  }

  // Reset Theme to Default
  const themeResetBtn = panel.querySelector('#theme-reset-btn');
  if (themeResetBtn) {
    themeResetBtn.addEventListener('click', () => {
      commitCustomTheme(DEFAULT_CUSTOM_THEME, { persist: true });
      showToastNotification('Тема сброшена к стандартной.', 'info', 'Тема оформления');
      renderSettings({ scope, studioTab });
    });
  }

  // Background Media (Image / GIF / Video) bindings
  const bgImageUploadBtn = panel.querySelector('#bg-image-upload-btn');
  const bgImageClearBtn = panel.querySelector('#bg-image-clear-btn');
  const bgImageFileInput = panel.querySelector('#bg-image-file-input');
  const bgOpacitySlider = panel.querySelector('#bg-opacity-slider');
  const bgOpacityValText = panel.querySelector('#bg-opacity-val-text');

  if (bgImageUploadBtn && bgImageFileInput) {
    bgImageUploadBtn.addEventListener('click', () => bgImageFileInput.click());
    
    bgImageFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const isVideo = file.type.startsWith('video/') || 
                      ['.mp4', '.webm', '.mov'].some(ext => file.name.toLowerCase().endsWith(ext));

      // Size check (Limit: 35 MB)
      const MAX_SIZE = 35 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        showToastNotification('Файл слишком большой (максимум 35 МБ)', 'warning', 'Фон');
        bgImageFileInput.value = '';
        return;
      }

      let wasAutoTrimmed = false;
      if (isVideo) {
        try {
          const duration = await new Promise((resolve, reject) => {
            const tempVideo = document.createElement('video');
            tempVideo.preload = 'metadata';
            tempVideo.onloadedmetadata = () => {
              window.URL.revokeObjectURL(tempVideo.src);
              resolve(tempVideo.duration);
            };
            tempVideo.onerror = () => reject(new Error('Не удалось прочитать видео'));
            tempVideo.src = URL.createObjectURL(file);
          });

          if (duration > 8.0) {
            wasAutoTrimmed = true;
          }
        } catch (err) {
          console.warn('[Video Check Error]:', err.message);
        }
      }
      
      const reader = new FileReader();
      reader.onload = async function(evt) {
        const base64Str = evt.target.result;
        let bgRef = base64Str;
        let isVideoSaved = isVideo;
        try {
          if (isElectron && window.electronAPI?.saveThemeBackground) {
            const saved = await window.electronAPI.saveThemeBackground({
              sourcePath: file.path,
              dataUrl: base64Str,
              name: file.name
            });
            bgRef = saved.bgUrl || saved.bgPath || base64Str;
            if (saved.isVideo !== undefined) isVideoSaved = saved.isVideo;
          }
        } catch (err) {
          console.warn('[Theme Background] Falling back to inline media:', err.message);
        }
        localStorage.setItem('gp_bg_image', bgRef);
        localStorage.setItem('gp_bg_is_video', String(isVideoSaved));
        applyBackgroundImage(bgRef, isVideoSaved);
        if (bgImageClearBtn) bgImageClearBtn.classList.remove('hidden');

        // If background opacity was 0% or unset, default to 65% so the user immediately sees their wallpaper
        const currentBgOpacity = localStorage.getItem('gp_bg_image_opacity');
        if (!currentBgOpacity || currentBgOpacity === '0') {
          localStorage.setItem('gp_bg_image_opacity', '65');
          document.documentElement.style.setProperty('--bg-image-opacity', '0.65');
          if (bgOpacitySlider) bgOpacitySlider.value = 65;
          if (bgOpacityValText) bgOpacityValText.textContent = '65%';
        }

        if (isVideoSaved) {
          if (wasAutoTrimmed) {
            showToastNotification('Видео установлено и зациклено на первых 8 секундах.', 'success', 'Фон');
          } else {
            showToastNotification('Живой видеофон установлен!', 'success', 'Фон');
          }
        } else {
          showToastNotification('Фоновое изображение установлено!', 'success', 'Фон');
        }
      };
      reader.readAsDataURL(file);
    });
  }

  if (bgImageClearBtn) {
    bgImageClearBtn.addEventListener('click', () => {
      localStorage.removeItem('gp_bg_image');
      localStorage.removeItem('gp_bg_is_video');
      applyBackgroundImage(null);
      bgImageClearBtn.classList.add('hidden');
      bgImageFileInput.value = '';
      showToastNotification('Фон сброшен');
    });
  }

  if (bgOpacitySlider && bgOpacityValText) {
    bgOpacitySlider.addEventListener('input', (e) => {
      const val = e.target.value;
      bgOpacityValText.textContent = `${val}%`;
      localStorage.setItem('gp_bg_image_opacity', val);
      document.documentElement.style.setProperty('--bg-image-opacity', parseFloat(val) / 100);
    });
  }

  const themeExportBtn = panel.querySelector('#theme-export-btn');
  if (themeExportBtn) {
    themeExportBtn.addEventListener('click', async () => {
      const customThemeVal = readThemeFromControls();
      try {
        const code = btoa(JSON.stringify(customThemeVal));
        await navigator.clipboard.writeText(code);
        showToastNotification('Код темы скопирован в буфер обмена.', 'success', 'Тема оформления');
      } catch (err) {
        console.error(err);
        showToastNotification('Не удалось скопировать код темы.', 'error', 'Тема оформления');
      }
    });
  }

  const themeImportBtn = panel.querySelector('#theme-import-btn');
  if (themeImportBtn) {
    themeImportBtn.addEventListener('click', () => {
      const input = panel.querySelector('#theme-import-input');
      const code = input?.value.trim();
      if (!code) return;
      try {
        const decoded = JSON.parse(atob(code));
        if (decoded && typeof decoded === 'object' && (decoded.bgColor || decoded.bgColor1 || decoded.version)) {
          const normalized = normalizeCustomTheme(decoded);
          commitCustomTheme(normalized, { persist: true });
          input.value = '';
          showToastNotification('Тема проверена и применена.', 'success', 'Тема оформления');
          renderSettings({ scope, studioTab });
        } else {
          showToastNotification('В коде нет обязательных параметров темы.', 'error', 'Тема оформления');
        }
      } catch (err) {
        console.error(err);
        showToastNotification('Не удалось прочитать код темы.', 'error', 'Тема оформления');
      }
    });
  }

  function getSavedThemes() {
    try {
      return JSON.parse(localStorage.getItem('gp_saved_themes') || '[]');
    } catch {
      return [];
    }
  }

  function setSavedThemes(themes) {
    localStorage.setItem('gp_saved_themes', JSON.stringify(themes));
  }

  function renderSavedThemesList() {
    const list = panel.querySelector('#saved-themes-list');
    if (!list) return;

    const themes = getSavedThemes();
    if (!themes.length) {
      list.innerHTML = '<div class="saved-themes-empty">No saved themes yet</div>';
      return;
    }

    list.innerHTML = themes.map(theme => `
      <div class="saved-theme-item" data-theme-id="${theme.id}">
        <button class="saved-theme-activate" type="button">
          <span class="saved-theme-name">${escapeHTML(theme.name)}</span>
          <span class="saved-theme-meta">${theme.bgPath ? 'Background saved' : 'Colors only'}</span>
        </button>
        <button class="saved-theme-delete" type="button" title="Delete theme">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path></svg>
        </button>
      </div>
    `).join('');

    list.querySelectorAll('.saved-theme-activate').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.closest('.saved-theme-item')?.dataset.themeId;
        const selected = getSavedThemes().find(theme => theme.id === id);
        if (!selected) return;
        const migrated = normalizeCustomTheme(selected.colors);
        commitCustomTheme(migrated, { persist: true });
        if (selected.bgUrl || selected.bgPath) {
          const bgRef = selected.bgUrl || selected.bgPath;
          const isVideoSaved = Boolean(selected.isVideo || (selected.bgPath && selected.bgPath.match(/\.(mp4|webm|mov)$/i)));
          localStorage.setItem('gp_bg_image', bgRef);
          localStorage.setItem('gp_bg_is_video', String(isVideoSaved));
          applyBackgroundImage(bgRef, isVideoSaved);
        } else {
          localStorage.removeItem('gp_bg_image');
          localStorage.removeItem('gp_bg_is_video');
          applyBackgroundImage(null);
        }
        showToastNotification('Тема применена', 'success', 'Тема оформления');
        renderSettings({ scope, studioTab });
      });
    });

    list.querySelectorAll('.saved-theme-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.closest('.saved-theme-item')?.dataset.themeId;
        setSavedThemes(getSavedThemes().filter(theme => theme.id !== id));
        renderSavedThemesList();
      });
    });
  }

  const themeSaveBtn = panel.querySelector('#theme-save-btn');
  const themeSaveNameInput = panel.querySelector('#theme-save-name-input');
  if (themeSaveBtn && themeSaveNameInput) {
    themeSaveBtn.addEventListener('click', () => {
      const name = themeSaveNameInput.value.trim();
      if (!name) {
        showToastNotification('Введите название темы', 'warning', 'Тема оформления');
        return;
      }

      const id = `theme_${Date.now()}`;
      const bgRef = localStorage.getItem('gp_bg_image') || '';
      const isVideo = localStorage.getItem('gp_bg_is_video') === 'true';
      const themes = getSavedThemes();
      themes.unshift({
        id,
        name,
        bgPath: bgRef,
        bgUrl: bgRef,
        isVideo,
        colors: readThemeFromControls()
      });
      setSavedThemes(themes);
      themeSaveNameInput.value = '';
      renderSavedThemesList();
      showToastNotification('Тема сохранена!', 'success', 'Тема оформления');
    });
    renderSavedThemesList();
  }

  // Interface Effects bindings
  const dynamicCoverCheckbox = panel.querySelector('#dynamic-cover-checkbox');
  const visualizerCheckbox = panel.querySelector('#visualizer-checkbox');

  if (dynamicCoverCheckbox) {
    dynamicCoverCheckbox.addEventListener('change', (e) => {
      localStorage.setItem('gp_dynamic_cover', e.target.checked);
      if (e.target.checked) {
        applyDynamicCoverColor();
      } else {
        resetAccentColor();
      }
    });
  }

  if (visualizerCheckbox) {
    visualizerCheckbox.addEventListener('change', (e) => {
      localStorage.setItem('gp_visualizer', e.target.checked);
      if (e.target.checked) {
        initAudioEffects();
        startVisualizer();
      } else {
        stopVisualizer();
      }
    });
  }

  // Audio Effects bindings
  const bassboostCheckbox = panel.querySelector('#effect-bassboost-checkbox');
  const speedSlider = panel.querySelector('#effect-speed-slider');
  const pitchSlider = panel.querySelector('#effect-pitch-slider');
  const pitchLinkedCheckbox = panel.querySelector('#effect-pitch-linked-checkbox');
  const eqSliders = panel.querySelectorAll('.eq-slider');

  eqSliders.forEach((slider, index) => {
    slider.addEventListener('input', (e) => {
      const frequency = e.target.dataset.frequency;
      const gain = parseFloat(e.target.value);
      localStorage.setItem(`gp_eq_${frequency}`, gain);
      const valueLabel = panel.querySelector(`#eq-${frequency}-value`);
      if (valueLabel) {
        valueLabel.textContent = `${gain}dB`;
      }
      initAudioEffects();
      if (eqFilters[index]) {
        eqFilters[index].gain.value = gain;
      }
    });
  });

  if (bassboostCheckbox) {
    bassboostCheckbox.addEventListener('change', (e) => {
      localStorage.setItem('gp_effect_bassboost', e.target.checked);
      initAudioEffects();
      if (bassFilter) {
        bassFilter.gain.value = e.target.checked ? 10 : 0;
      }
    });
  }

  if (speedSlider && pitchSlider && pitchLinkedCheckbox) {
    speedSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      localStorage.setItem('gp_effect_speed', val);
      panel.querySelector('#speed-val-text').textContent = `${val.toFixed(2)}x`;

      audioPlayer.playbackRate = val;
      audioPlayer.defaultPlaybackRate = val;

      if (pitchLinkedCheckbox.checked) {
        pitchSlider.value = val;
        panel.querySelector('#pitch-val-text').textContent = `${val.toFixed(2)}x`;
      }
    });

    pitchLinkedCheckbox.addEventListener('change', (e) => {
      const checked = e.target.checked;
      localStorage.setItem('gp_effect_pitch_linked', checked);
      audioPlayer.preservesPitch = !checked;

      if (checked) {
        const speedVal = parseFloat(speedSlider.value);
        pitchSlider.value = speedVal;
        panel.querySelector('#pitch-val-text').textContent = `${speedVal.toFixed(2)}x`;
        pitchSlider.style.opacity = '';
        pitchSlider.style.pointerEvents = '';
      } else {
        pitchSlider.value = 1.0;
        panel.querySelector('#pitch-val-text').textContent = '1.00x';
        pitchSlider.style.opacity = '0.5';
        pitchSlider.style.pointerEvents = 'none';
      }
    });

    pitchSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      pitchLinkedCheckbox.checked = true;
      localStorage.setItem('gp_effect_pitch_linked', true);
      audioPlayer.preservesPitch = false;

      pitchSlider.style.opacity = '';
      pitchSlider.style.pointerEvents = '';

      speedSlider.value = val;
      panel.querySelector('#speed-val-text').textContent = `${val.toFixed(2)}x`;
      panel.querySelector('#pitch-val-text').textContent = `${val.toFixed(2)}x`;

      audioPlayer.playbackRate = val;
      audioPlayer.defaultPlaybackRate = val;
      localStorage.setItem('gp_effect_speed', val);
    });
  }

  const manualCheckBtn = panel.querySelector('#manual-check-updates-btn');
  if (manualCheckBtn && isElectron && window.electronAPI?.checkForUpdates) {
    manualCheckBtn.addEventListener('click', () => {
      showToastNotification('Проверяем наличие новой версии…', 'info', 'Обновления');
      window.electronAPI.checkForUpdates();
    });
  }

  const backendInput = panel.querySelector('#settings-backend-url-input');
  const saveBackendBtn = panel.querySelector('#settings-save-backend-btn');
  const resetBackendBtn = panel.querySelector('#settings-reset-backend-btn');

  if (saveBackendBtn && backendInput) {
    saveBackendBtn.addEventListener('click', () => {
      let newUrl = backendInput.value.trim();
      if (!newUrl) {
        showToastNotification('Введите корректный адрес сервера.', 'warning', 'Настройки');
        return;
      }
      if (newUrl.endsWith('/')) {
        newUrl = newUrl.slice(0, -1);
      }
      localStorage.setItem('gp_backend_url', newUrl);
      showToastNotification('Адрес сервера изменен! Перезагрузка...');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    });
  }

  if (resetBackendBtn) {
    resetBackendBtn.addEventListener('click', () => {
      localStorage.removeItem('gp_backend_url');
      showToastNotification('Адрес сервера сброшен! Перезагрузка...');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    });
  }

  tracksContainer.classList.remove('hidden');
  updateActiveTab(scope);
}

// Startup Initialization
(async () => {
  initSplashScreen();
  updateSplashStatus('Инициализация интерфейса...', 20);
  try {
    updateSplashStatus('Проверка подключения к серверам...', 45);
    await initApiFailover();
  } catch (e) {
    console.warn('[Startup API Failover Error]:', e.message);
  }
  updateSplashStatus('Загрузка профилей и настроек...', 70);
  loadProfiles();
  initAuth();
  initEditProfileEventListeners();
  updateSplashStatus('Загрузка рекомендаций...', 85);
  await loadHomeView();
  hideSplashScreen();
  window.dispatchEvent(new CustomEvent('gp:app-ready'));
})();

// Apply Saved Theme on Startup
const savedTheme = localStorage.getItem('gp_theme') || 'theme-dark-glass';
applyTheme(savedTheme);

// Apply Saved Background Media (Image / GIF / Video) & Opacity on Startup
const savedBgImage = localStorage.getItem('gp_bg_image');
const savedBgIsVideo = localStorage.getItem('gp_bg_is_video') === 'true';
if (savedBgImage) {
  applyBackgroundImage(savedBgImage, savedBgIsVideo);
}
const savedBgOpacity = localStorage.getItem('gp_bg_image_opacity') || '0';
document.documentElement.style.setProperty('--bg-image-opacity', parseFloat(savedBgOpacity) / 100);

// Apply Saved Volume on Startup
const savedVolume = localStorage.getItem('gp_volume');
if (savedVolume !== null) {
  audioPlayer.volume = parseFloat(savedVolume);
  volumeSlider.value = Math.round(parseFloat(savedVolume) * 100);
} else {
  audioPlayer.volume = 0.8;
  volumeSlider.value = 80;
}

// Auto-Updater UI bindings
const updateBanner = document.getElementById('update-banner');
const bannerLoader = document.getElementById('banner-loader');
const updateBannerText = document.getElementById('update-banner-text');
const updateDownloadBtn = document.getElementById('update-download-btn');
const updateInstallBtn = document.getElementById('update-install-btn');
const updateCloseBtn = document.getElementById('update-close-btn');
const updateProgressBar = document.getElementById('update-progress-bar');

let currentUpdateInfo = null;

if (isElectron && window.electronAPI && window.electronAPI.onUpdateStatus) {
  window.electronAPI.onUpdateStatus((status, payload) => {
    console.log(`[Auto-Updater] Status changed: ${status}`, payload);
    if (status === 'checking') {
      // Background check
    } else if (status === 'available') {
      currentUpdateInfo = payload;
      const verText = typeof payload === 'object' ? payload.version : payload;
      updateBannerText.textContent = `Доступна новая версия GlassPlayer: v${verText}!`;
      updateDownloadBtn.classList.remove('hidden');
      updateInstallBtn.classList.add('hidden');
      if (bannerLoader) bannerLoader.classList.add('hidden');
      if (updateProgressBar) updateProgressBar.style.width = '0%';
      if (updateBanner) updateBanner.classList.remove('hidden');
    } else if (status === 'not-available') {
      showToastNotification('У вас установлена самая актуальная версия GlassPlayer.', 'success', 'Обновления');
    } else if (status === 'error') {
      console.error('[Auto-Updater Error]:', payload);
      showToastNotification(`Ошибка проверки обновлений: ${payload || 'Сервер недоступен'}`, 'error', 'Обновления');
    }
  });

  window.electronAPI.onUpdateProgress((percent) => {
    const rounded = Math.round(percent);
    updateBannerText.textContent = `Загрузка обновления: ${rounded}%`;
    if (updateProgressBar) updateProgressBar.style.width = `${rounded}%`;
  });

  window.electronAPI.onUpdateReady(() => {
    updateBannerText.textContent = 'Обновление скачано и готово к установке!';
    updateDownloadBtn.classList.add('hidden');
    updateInstallBtn.classList.remove('hidden');
    if (bannerLoader) bannerLoader.classList.add('hidden');
    if (updateProgressBar) updateProgressBar.style.width = '100%';
  });

  if (updateDownloadBtn) {
    updateDownloadBtn.addEventListener('click', () => {
      updateDownloadBtn.classList.add('hidden');
      if (bannerLoader) bannerLoader.classList.remove('hidden');
      updateBannerText.textContent = 'Загрузка обновления...';
      const downloadUrl = currentUpdateInfo?.downloadUrl || null;
      window.electronAPI.downloadUpdate(downloadUrl);
    });
  }

  if (updateInstallBtn) {
    updateInstallBtn.addEventListener('click', () => {
      updateBannerText.textContent = 'Перезапуск и установка...';
      window.electronAPI.installUpdate();
    });
  }

  if (updateCloseBtn) {
    updateCloseBtn.addEventListener('click', () => {
      if (updateBanner) updateBanner.classList.add('hidden');
    });
  }
}

// === RELEASE 1.1.0 GLOBAL UPDATES ===

// --- Discord RPC Client ---
let rpcInterval = null;

function sendDiscordPresence() {
  if (!isElectron || !window.electronAPI || !window.electronAPI.updatePresence) return;

  if (currentTrackIndex === -1 || !playlist[currentTrackIndex]) {
    window.electronAPI.updatePresence({
      title: 'Not Playing',
      artist: 'Выберите трек для воспроизведения',
      isPaused: true
    });
    return;
  }

  const track = playlist[currentTrackIndex];
  if (!track) return;

  const isPaused = audioPlayer.paused;
  const position = audioPlayer.currentTime;
  const duration = currentTrackDuration || audioPlayer.duration || 0;

  window.electronAPI.updatePresence({
    title: track.title || 'Not Playing',
    artist: track.artist || 'GlassPlayer',
    isPaused: isPaused,
    position: position,
    duration: duration,
    artwork_url: track.thumbnail || null
  });
}

function startPresenceInterval() {
  if (rpcInterval) clearInterval(rpcInterval);
  rpcInterval = setInterval(() => {
    if (!audioPlayer.paused) {
      sendDiscordPresence();
    }
  }, 3000);
}

// --- Mini-Player Window Mode listener ---
if (isElectron && window.electronAPI && window.electronAPI.onMiniPlayerToggled) {
  window.electronAPI.onMiniPlayerToggled((active) => {
    document.body.classList.toggle('mini-player-active', Boolean(active));
    if (typeof resizeCanvas === 'function') resizeCanvas();
  });
}

// --- Window Maximized Status listener ---
if (isElectron && window.electronAPI && window.electronAPI.onWindowMaximizedStatus) {
  window.electronAPI.onWindowMaximizedStatus((maximized) => {
    if (maximized) {
      document.body.classList.add('window-maximized');
    } else {
      document.body.classList.remove('window-maximized');
    }
  });
}


// --- Startup Initializations ---
if (localStorage.getItem('gp_visualizer') === 'true') {
  initAudioEffects();
  startVisualizer();
}

if (localStorage.getItem('gp_dynamic_cover') === 'true') {
  applyDynamicCoverColor();
}

function updateActiveTab(viewName) {
  // Clear home carousel timer if switching away from home
  if (viewName !== 'home' && carouselTimer) {
    clearInterval(carouselTimer);
    carouselTimer = null;
  }

  // Hide user search results if we switch away from search view
  const usersContainer = document.getElementById('users-search-results');
  if (usersContainer && viewName !== 'search') {
    usersContainer.classList.add('hidden');
  }

  const tabButtons = {
    'home': homeButton,
    'library': favoritesButton,
    'history': historyButton,
    'playlists': playlistsButton,
    'studio': studioButton,
    'stats': statsButton,
    'settings': settingsButton
  };

  Object.entries(tabButtons).forEach(([name, btn]) => {
    if (btn) {
      if (name === viewName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  });

  document.querySelectorAll('.mobile-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mobileView === viewName);
  });

  // If view is not home, reset genre chip active variables and styles
  if (viewName !== 'home') {
    activeGenreChip = null;
    const activeChips = document.querySelectorAll('.genre-chip-btn');
    activeChips.forEach(chip => chip.classList.remove('active'));
  }

  // Trigger smooth fade-in
  tracksContainer.classList.remove('fade-in');
  void tracksContainer.offsetWidth; // Force reflow
  tracksContainer.classList.add('fade-in');
}

// Merge offline and online playlists and sync back if necessary
function mergeAndSyncPlaylists(cloudPlaylists) {
  const localPlaylists = getPlaylists();
  const merged = [...cloudPlaylists];

  for (const localPl of localPlaylists) {
    const exists = merged.some(cloudPl => cloudPl.id === localPl.id || cloudPl.name.toLowerCase() === localPl.name.toLowerCase());
    if (!exists) {
      merged.push(localPl);
    }
  }

  localStorage.setItem(getStorageKey('playlists'), JSON.stringify(merged));

  if (merged.length > cloudPlaylists.length && currentUser && token) {
    syncPlaylistsWithBackend(merged);
  }
}

// Renders friend profile details & their liked tracks
async function loadFriendProfile(userId) {
  activeView = 'friend-profile';
  searchInput.value = '';

  const usersContainer = document.getElementById('users-search-results');
  if (usersContainer) usersContainer.classList.add('hidden');

  welcomeScreen.classList.add('hidden');
  tracksContainer.classList.add('hidden');
  loadingIndicator.classList.remove('hidden');

  const existingBtn = document.getElementById('load-more-btn');
  if (existingBtn) existingBtn.remove();
  const existingMsg = document.getElementById('load-more-limit-msg');
  if (existingMsg) existingMsg.remove();

  try {
    const response = await fetch(`${BACKEND_URL}/users/${userId}`);
    const data = await response.json();

    loadingIndicator.classList.add('hidden');

    if (data.status === 'success' && data.user) {
      const friend = data.user;
      tracksContainer.innerHTML = '';

      const avatarSrc = friend.avatarBase64 || DEFAULT_AVATAR_100;
      const liveStatus = friendStatuses.get(friend.id);
      const isOnline = liveStatus ? Boolean(liveStatus.isOnline) : Boolean(friend.isOnline);
      const lastSeen = (liveStatus && liveStatus.lastSeen) || friend.lastSeen;
      const fullDate = getFullDateTooltip(lastSeen);
      const presenceHtml = isOnline
        ? '<div class="friend-profile-presence online"><span class="presence-dot"></span><span>В сети</span></div>'
        : `<div class="friend-profile-presence offline" title="${escapeHTML(fullDate)}"><span class="presence-dot"></span><span>${escapeHTML(formatLastSeen(lastSeen))}</span></div>`;

      const headerCard = document.createElement('div');
      headerCard.className = 'friend-profile-banner';
      headerCard.innerHTML = `
        <img class="friend-profile-avatar" src="${avatarSrc}" alt="Avatar">
        <h2 class="friend-profile-name">${escapeHTML(friend.displayName)}</h2>
        <p class="friend-profile-username">${formatUsername(escapeHTML(friend.username))}</p>
        <div class="friend-profile-presence-wrap">${presenceHtml}</div>
        <p class="friend-profile-bio">${escapeHTML(friend.bio || 'Нет описания')}</p>
        <div class="friend-profile-stats">
          <span><strong>${friend.likedTracks ? friend.likedTracks.length : 0}</strong> лайков</span>
          <span><strong>${friend.playlists ? friend.playlists.length : 0}</strong> плейлистов</span>
        </div>
      `;
      tracksContainer.appendChild(headerCard);

      // Renders the playlists section
      const playlistsSection = document.createElement('div');
      playlistsSection.className = 'friend-playlists-section';

      const pHeader = document.createElement('h3');
      pHeader.textContent = 'Плейлисты и Избранное';
      playlistsSection.appendChild(pHeader);

      const pRow = document.createElement('div');
      pRow.className = 'friend-playlists-row';

      // 1. Render Liked Tracks tab card
      const likesCount = friend.likedTracks ? friend.likedTracks.length : 0;
      const likesCard = document.createElement('div');
      likesCard.className = 'friend-playlist-card active';
      likesCard.id = 'friend-likes-tab';
      likesCard.innerHTML = `
        <div class="friend-playlist-cover" style="background: rgba(255, 69, 58, 0.15); color: #ff453a;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </div>
        <div class="friend-playlist-info">
          <span class="friend-playlist-name">Избранное</span>
          <span class="friend-playlist-count">${likesCount} треков</span>
        </div>
      `;
      pRow.appendChild(likesCard);

      // 2. Render other playlists
      const playlists = friend.playlists || [];
      playlists.forEach(pl => {
        const plCard = document.createElement('div');
        plCard.className = 'friend-playlist-card';
        plCard.dataset.playlistId = pl.id;
        plCard.innerHTML = `
          <div class="friend-playlist-cover">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
          </div>
          <div class="friend-playlist-info">
            <span class="friend-playlist-name">${escapeHTML(pl.name)}</span>
            <span class="friend-playlist-count">${pl.tracks ? pl.tracks.length : 0} треков</span>
          </div>
        `;
        pRow.appendChild(plCard);

        plCard.addEventListener('click', () => {
          pRow.querySelectorAll('.friend-playlist-card').forEach(c => c.classList.remove('active'));
          plCard.classList.add('active');
          showFriendPlaylistTracks(friend, pl.id);
        });
      });

      likesCard.addEventListener('click', () => {
        pRow.querySelectorAll('.friend-playlist-card').forEach(c => c.classList.remove('active'));
        likesCard.classList.add('active');
        showFriendLikedTracks(friend);
      });

      playlistsSection.appendChild(pRow);
      tracksContainer.appendChild(playlistsSection);

      // 3. Render section title
      const sectionTitle = document.createElement('div');
      sectionTitle.className = 'view-header';
      sectionTitle.style.marginTop = '24px';
      sectionTitle.innerHTML = `
        <div class="view-header-title" id="friend-tracks-title-container">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" id="friend-tracks-title-icon"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          <span id="friend-tracks-title-text">Избранное</span>
        </div>
      `;
      tracksContainer.appendChild(sectionTitle);

      const gridContainer = document.createElement('div');
      gridContainer.className = 'tracks-layout-grid';
      tracksContainer.appendChild(gridContainer);

      if (friend.likedTracks && friend.likedTracks.length > 0) {
        playlist = friend.likedTracks;
        renderTracks(playlist, gridContainer, true);
      } else {
        const noTracksMsg = document.createElement('div');
        noTracksMsg.className = 'welcome-state';
        noTracksMsg.style.minHeight = '150px';
        noTracksMsg.style.marginTop = '10px';
        noTracksMsg.innerHTML = '<p>В избранном пока нет треков</p>';
        gridContainer.appendChild(noTracksMsg);
      }

      tracksContainer.classList.remove('hidden');
      updateActiveTab(null);
    } else {
      tracksContainer.innerHTML = `<div class="welcome-state"><h2>Ошибка</h2><p>${data.message || 'Не удалось загрузить профиль пользователя'}</p></div>`;
      tracksContainer.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error loading friend profile:', error);
    loadingIndicator.classList.add('hidden');
    tracksContainer.innerHTML = '<div class="welcome-state"><h2>Не удалось подключиться к серверу</h2><p>Пожалуйста, проверьте подключение бэкенда</p></div>';
    tracksContainer.classList.remove('hidden');
  }
}

// Helpers for switching between friend's likes and custom playlists
function showFriendLikedTracks(friend) {
  const titleText = document.getElementById('friend-tracks-title-text');
  if (titleText) titleText.textContent = 'Избранное';
  const titleIcon = document.getElementById('friend-tracks-title-icon');
  if (titleIcon) {
    titleIcon.innerHTML = `<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>`;
    titleIcon.setAttribute('fill', 'currentColor');
  }

  const gridContainer = tracksContainer.querySelector('.tracks-layout-grid');
  if (gridContainer) {
    gridContainer.innerHTML = '';
    if (friend.likedTracks && friend.likedTracks.length > 0) {
      playlist = friend.likedTracks;
      renderTracks(playlist, gridContainer, true);
    } else {
      const noTracksMsg = document.createElement('div');
      noTracksMsg.className = 'welcome-state';
      noTracksMsg.style.minHeight = '150px';
      noTracksMsg.style.marginTop = '10px';
      noTracksMsg.innerHTML = '<p>В избранном пока нет треков</p>';
      gridContainer.appendChild(noTracksMsg);
    }
  }
}

function showFriendPlaylistTracks(friend, playlistId) {
  const pl = friend.playlists.find(p => p.id === playlistId);
  if (!pl) return;

  const titleText = document.getElementById('friend-tracks-title-text');
  if (titleText) titleText.textContent = `Плейлист: ${pl.name}`;
  const titleIcon = document.getElementById('friend-tracks-title-icon');
  if (titleIcon) {
    titleIcon.innerHTML = `<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>`;
    titleIcon.setAttribute('fill', 'none');
    titleIcon.setAttribute('stroke', 'currentColor');
    titleIcon.setAttribute('stroke-width', '2');
  }

  const gridContainer = tracksContainer.querySelector('.tracks-layout-grid');
  if (gridContainer) {
    gridContainer.innerHTML = '';
    if (pl.tracks && pl.tracks.length > 0) {
      playlist = pl.tracks;
      renderTracks(playlist, gridContainer, true);
    } else {
      const noTracksMsg = document.createElement('div');
      noTracksMsg.className = 'welcome-state';
      noTracksMsg.style.minHeight = '150px';
      noTracksMsg.style.marginTop = '10px';
      noTracksMsg.innerHTML = '<p>В этом плейлисте пока нет треков</p>';
      gridContainer.appendChild(noTracksMsg);
    }
  }
}

// Left Sliding Sidebar Events & Animations (GPU-accelerated)
(function() {
  const sidebar = document.getElementById('sidebar');
  const sidebarTrigger = document.getElementById('sidebar-trigger');

  if (sidebar && sidebarTrigger) {
    let hideTimeout;
    let showFrame;

    const showSidebar = () => {
      clearTimeout(hideTimeout);
      cancelAnimationFrame(showFrame);
      showFrame = requestAnimationFrame(() => {
        sidebar.classList.add('open');
        sidebarTrigger.classList.add('open');
      });
    };

    const hideSidebar = () => {
      clearTimeout(hideTimeout);
      cancelAnimationFrame(showFrame);
      hideTimeout = setTimeout(() => {
        sidebar.classList.remove('open');
        sidebarTrigger.classList.remove('open');
      }, 190);
    };

    sidebarTrigger.addEventListener('mouseenter', showSidebar);
    sidebar.addEventListener('mouseenter', showSidebar);

    sidebarTrigger.addEventListener('mouseleave', (e) => {
      if (e.relatedTarget !== sidebar && !sidebar.contains(e.relatedTarget)) {
        hideSidebar();
      }
    });

    sidebar.addEventListener('mouseleave', (e) => {
      if (e.relatedTarget !== sidebarTrigger && !sidebarTrigger.contains(e.relatedTarget)) {
        hideSidebar();
      }
    });

    // Close sidebar after clicking navigation buttons
    const sidebarButtons = sidebar.querySelectorAll('.sidebar-btn');
    sidebarButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        sidebar.classList.remove('open');
        sidebarTrigger.classList.remove('open');
      });
    });
  }
})();

// Helper to render a horizontal carousel banner
function renderCarousel(carouselTracks, container = null, recommendationReason = 'Подобрано для вас') {
  // Clear any old auto-slide interval
  clearInterval(carouselTimer);
  homeCarouselIndex = 0;

  if (!carouselTracks || carouselTracks.length === 0) return null;

  const carouselSection = document.createElement('div');
  carouselSection.className = 'carousel-banner-section';

  let slidesHTML = '';
  let dotsHTML = '';

  carouselTracks.forEach((track, idx) => {
    const trackTitle = track.title ? track.title.trim() : "Unknown Track";
    const trackArtist = track.artist ? track.artist.trim() : "Unknown Artist";
    const coverUrl = getOptimalCoverUrl(track.thumbnail, track.source);
    const fallbackCoverUrl = getFallbackCoverUrl(track.thumbnail);
    const isLiked = likedTrackIds.has(track.id);

    const playsText = track.source === 'soundcloud' && (track.playbackCount !== undefined || track.playback_count !== undefined)
      ? `▷ ${formatPlaybackCount(track.playbackCount || track.playback_count)}`
      : '';

    slidesHTML += `
      <div class="carousel-slide" role="group" aria-roledescription="слайд" aria-label="${idx + 1} из ${carouselTracks.length}">
        <div class="carousel-slide-content">
          <img class="carousel-cover" src="${coverUrl}" onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='${fallbackCoverUrl}';}" alt="" loading="${idx === 0 ? 'eager' : 'lazy'}" decoding="async">
          <div class="carousel-details">
            <h3 class="carousel-title">${escapeHTML(trackTitle)}</h3>
            <p class="carousel-artist">${escapeHTML(trackArtist)}</p>
            <p class="carousel-reason">${escapeHTML(recommendationReason)}</p>
            <div class="carousel-meta">
              <span class="badge ${track.source}">
                ${track.source === 'soundcloud'
                  ? `<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style="margin-right:3px"><path d="M23.95 14.47c0-2.45-1.92-4.44-4.29-4.44h-.35c-.48-2.61-2.73-4.6-5.46-4.6-2.58 0-4.73 1.83-5.32 4.26-.26-.06-.53-.09-.81-.09-2.58 0-4.67 2.09-4.67 4.67 0 .16.01.32.02.48C1.29 14.53 0 16.03 0 17.84c0 2.08 1.68 3.76 3.76 3.76h16.5c1.96 0 3.69-1.55 3.69-3.51 0-1.74-1.28-3.18-2.97-3.52z"/></svg>SC`
                  : track.source === 'spotify'
                  ? `<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style="margin-right:3px"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.377-1.454-5.37-1.783-8.894-.978-.335.077-.67-.134-.746-.47-.077-.335.134-.67.47-.746 3.847-.88 7.143-.51 9.814 1.127.294.18.387.563.207.857s-.563.387-.857.207zm1.225-2.72c-.227.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.082-1.182-.413.125-.847-.107-.972-.52-.125-.413.107-.847.52-.972 3.676-1.116 8.243-.57 11.348 1.337.367.227.487.707.26 1.074zm.107-2.834C14.484 8.7 8.012 8.483 4.262 9.622c-.573.173-1.182-.154-1.355-.727-.173-.573.154-1.182.727-1.355 4.3-1.305 11.442-1.055 15.534 1.373.515.305.683.97.378 1.485-.305.515-.97.683-1.485.378z"/></svg>SP`
                  : `<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style="margin-right:3px"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>YT`}
              </span>
              ${playsText ? `<span>${playsText}</span><span>•</span>` : ''}
              <span>${track.duration}</span>
            </div>
            <div class="carousel-actions">
              <button class="carousel-play-now-btn" data-index="${idx}" aria-label="Воспроизвести ${escapeHTML(trackTitle)}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="margin-left:2px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <span>Слушать</span>
              </button>
              <button class="carousel-icon-btn add-btn" data-index="${idx}" title="Добавить в плейлист" aria-label="Добавить ${escapeHTML(trackTitle)} в плейлист">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
              <button class="carousel-icon-btn like-btn ${isLiked ? 'liked' : ''}" data-index="${idx}" title="В избранное" aria-label="${isLiked ? 'Убрать из избранного' : 'Добавить в избранное'}" aria-pressed="${isLiked}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    dotsHTML += `<button type="button" class="carousel-dot ${idx === 0 ? 'active' : ''}" data-index="${idx}" aria-label="Показать рекомендацию ${idx + 1}" aria-current="${idx === 0 ? 'true' : 'false'}"></button>`;
  });

  carouselSection.setAttribute('aria-label', 'Главная рекомендация');
  carouselSection.innerHTML = `
    <div class="carousel-container">
      <div class="carousel-wrapper" id="carousel-wrapper" style="display:flex; transition: transform 0.5s ease-in-out; width: 100%;">
        ${slidesHTML}
      </div>
    </div>
    <button class="carousel-nav-btn prev" id="carousel-prev" aria-label="Предыдущая рекомендация">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <button class="carousel-nav-btn next" id="carousel-next" aria-label="Следующая рекомендация">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
    <div class="carousel-dots-wrap">
      <div class="carousel-dots" id="carousel-dots">
        ${dotsHTML}
      </div>
      <button type="button" class="carousel-pause-btn" aria-label="Приостановить автоматическую смену рекомендаций" aria-pressed="false">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
      </button>
    </div>
  `;

  if (container) {
    container.appendChild(carouselSection);
  }

  const wrapper = carouselSection.querySelector('#carousel-wrapper');
  const dots = carouselSection.querySelectorAll('.carousel-dot');
  const slides = carouselSection.querySelectorAll('.carousel-slide');
  const pauseButton = carouselSection.querySelector('.carousel-pause-btn');
  slides.forEach((slide, index) => {
    const thumbnail = carouselTracks[index]?.thumbnail;
    if (!thumbnail) return;
    const artUrl = getOptimalCoverUrl(thumbnail, carouselTracks[index]?.source);
    slide.style.setProperty('--carousel-art', `url("${artUrl}")`);
  });

  const updateCarousel = (newIdx) => {
    if (!carouselTracks.length) return;
    homeCarouselIndex = (newIdx + carouselTracks.length) % carouselTracks.length;
    wrapper.style.transform = `translateX(-${homeCarouselIndex * 100}%)`;
    slides.forEach((slide, slideIndex) => {
      const isActiveSlide = slideIndex === homeCarouselIndex;
      slide.setAttribute('aria-hidden', String(!isActiveSlide));
      slide.inert = !isActiveSlide;
    });
    dots.forEach((dot, dIdx) => {
      dot.classList.toggle('active', dIdx === homeCarouselIndex);
      dot.setAttribute('aria-current', String(dIdx === homeCarouselIndex));
    });
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasMultipleSlides = carouselTracks.length > 1;
  let autoPlayPaused = reduceMotion;
  const updatePauseButton = () => {
    pauseButton.setAttribute('aria-pressed', String(autoPlayPaused));
    pauseButton.setAttribute('aria-label', autoPlayPaused
      ? 'Возобновить автоматическую смену рекомендаций'
      : 'Приостановить автоматическую смену рекомендаций');
    pauseButton.innerHTML = autoPlayPaused
      ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l12-8z"/></svg>'
      : '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
  };
  const startAutoSlide = () => {
    clearInterval(carouselTimer);
    if (autoPlayPaused || reduceMotion || !hasMultipleSlides) return;
    carouselTimer = setInterval(() => {
      updateCarousel(homeCarouselIndex + 1);
    }, 5000);
  };

  carouselSection.querySelector('#carousel-prev').hidden = !hasMultipleSlides;
  carouselSection.querySelector('#carousel-next').hidden = !hasMultipleSlides;
  carouselSection.querySelector('.carousel-dots-wrap').hidden = !hasMultipleSlides;
  pauseButton.hidden = reduceMotion || !hasMultipleSlides;
  updateCarousel(0);
  updatePauseButton();
  startAutoSlide();
  pauseButton.addEventListener('click', () => {
    autoPlayPaused = !autoPlayPaused;
    updatePauseButton();
    if (autoPlayPaused) clearInterval(carouselTimer);
    else startAutoSlide();
  });

  carouselSection.addEventListener('mouseenter', () => clearInterval(carouselTimer));
  carouselSection.addEventListener('mouseleave', startAutoSlide);
  carouselSection.addEventListener('focusin', () => clearInterval(carouselTimer));
  carouselSection.addEventListener('focusout', (event) => {
    if (!carouselSection.contains(event.relatedTarget)) startAutoSlide();
  });

  carouselSection.querySelector('#carousel-prev').addEventListener('click', () => {
    updateCarousel(homeCarouselIndex - 1);
  });

  carouselSection.querySelector('#carousel-next').addEventListener('click', () => {
    updateCarousel(homeCarouselIndex + 1);
  });

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      updateCarousel(parseInt(dot.dataset.index));
    });
  });

  carouselSection.querySelectorAll('.carousel-play-now-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      playlist = carouselTracks;
      playTrack(idx);
    });
  });

  carouselSection.querySelectorAll('.carousel-icon-btn.add-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.dataset.index);
      showPlaylistMenu(e, carouselTracks[idx]);
    });
  });

  carouselSection.querySelectorAll('.carousel-icon-btn.like-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.dataset.index);
      const track = carouselTracks[idx];
      toggleLike(e, track);
      const isLiked = likedTrackIds.has(track.id);
      btn.classList.toggle('liked', isLiked);
      btn.querySelector('svg').setAttribute('fill', isLiked ? 'currentColor' : 'none');
    });
  });

  return carouselSection;
}

// ═══════════════════════════════════════════════════════════════════
//  Release 1.6.0 — Spotify Mood Home & Lyrics Engine
// ═══════════════════════════════════════════════════════════════════

// ── Mood card definitions ─────────────────────────────────────────
const MOOD_CARDS = [
  { key: 'plugg',       title: 'Plugg Vibe',       sub: 'Мелодичный и тёмный' },
  { key: 'heavy',       title: 'Heavy Session',    sub: 'Тяжёлые 808-е'        },
  { key: 'dark',        title: 'Dark Archive',     sub: 'Забытые находки'      },
  { key: 'rage',        title: 'Rage / Jerk',      sub: 'Максимум энергии'     },
  { key: 'chill',       title: 'Chill Waves',      sub: 'Спокойный поток'      },
  { key: 'underground', title: 'Underground Raw',  sub: 'Сырой андеграунд'     },
  { key: 'electronic',  title: 'Electronic Zone',  sub: 'Синты и бас'          },
  { key: 'latenight',   title: 'Late Night R&B',   sub: 'После полуночи'       },
  { key: 'phonk',       title: 'Phonk Drift',      sub: 'Скорость и бас'       },
  { key: 'jerk',        title: 'Jerk / Jerk-Trap', sub: 'Ломаный грув'         },
  { key: 'lofi',        title: 'Lofi Relax',       sub: 'Учёба и отдых'        },
  { key: 'cyber',       title: 'Cyber Synth',      sub: 'Неоновая электроника'},
  { key: 'ambient',     title: 'Ambient Space',    sub: 'Воздух и атмосфера'   },
];

function getSpotifyMoodCacheKey(moodKey) {
  const hourBucket = Math.floor(new Date().getHours() / 3);
  return `${getStorageOwnerSuffix()}:${moodKey}:${hourBucket}`;
}

function getFreshSpotifyMoodCache(moodKey) {
  const cached = spotifyMoodCache.get(getSpotifyMoodCacheKey(moodKey));
  return cached && Date.now() - cached.createdAt < HOME_RECOMMENDATION_TTL ? cached : null;
}

function getTrackIdentity(track) {
  return `${String(track?.artist || '').trim().toLocaleLowerCase('ru')}::${String(track?.title || '').trim().toLocaleLowerCase('ru')}`;
}

function dedupeTracksByIdentity(tracks, excluded = new Set()) {
  const seen = new Set(excluded);
  return (tracks || []).filter((track) => {
    const identity = getTrackIdentity(track);
    const idKey = `${track?.source || 'unknown'}:${track?.id}`;
    if (!track?.id || seen.has(identity) || seen.has(idKey)) return false;
    seen.add(identity);
    seen.add(idKey);
    return true;
  });
}

/**
 * Renders the Spotify tab: mood card grid + track results.
 * Called when activeHomeSource === 'spotify'.
 */
function renderSpotifyHome() {
  const container = document.createElement('div');
  container.className = 'spotify-home-container';

  // 1. Render Carousel Placeholder at the very top of Spotify view
  const carouselPlaceholder = document.createElement('div');
  carouselPlaceholder.id = 'spotify-carousel-container';
  container.appendChild(carouselPlaceholder);

  // 2. Choose a vibe grid
  const gridLabel = document.createElement('div');
  gridLabel.className = 'spotify-home-greeting';
  gridLabel.textContent = 'Выберите настроение';
  container.appendChild(gridLabel);

  const grid = document.createElement('div');
  grid.className = 'mood-grid';

  MOOD_CARDS.forEach(mood => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `mood-card ${activeSpotifyMood === mood.key ? 'active' : ''}`;
    card.setAttribute('aria-pressed', String(activeSpotifyMood === mood.key));
    card.innerHTML = `
      <div class="mood-card-active-ring"></div>
      <div class="mood-card-title">${mood.title}</div>
      <div class="mood-card-sub">${mood.sub}</div>
    `;

    card.addEventListener('click', async () => {
      // Update active state visually
      grid.querySelectorAll('.mood-card').forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-pressed', 'false');
      });
      card.classList.add('active');
      card.setAttribute('aria-pressed', 'true');
      activeSpotifyMood = mood.key;

      // Show loading state on this card
      card.classList.add('loading');

      await loadSpotifyMoodTracks(mood.key, mood.title, container);
      if (activeSpotifyMood === mood.key) card.classList.remove('loading');
    });

    grid.appendChild(card);
  });

  container.appendChild(grid);

  // 3. Results area
  const resultsArea = document.createElement('div');
  resultsArea.id = 'spotify-results-area';
  container.appendChild(resultsArea);

  tracksContainer.appendChild(container);

  // Auto-load the previously selected mood (or default to first)
  const defaultMood = activeSpotifyMood || MOOD_CARDS[0].key;
  activeSpotifyMood = defaultMood;
  const defaultCache = getFreshSpotifyMoodCache(defaultMood);
  if (defaultCache?.moodTracks?.length) {
    renderCarousel(defaultCache.moodTracks.slice(0, 5), carouselPlaceholder);
  }
  const defaultCard = grid.querySelectorAll('.mood-card')[
    MOOD_CARDS.findIndex(m => m.key === defaultMood)
  ];
  if (defaultCard) {
    defaultCard.classList.add('active');
    defaultCard.setAttribute('aria-pressed', 'true');
    if (!defaultCache) {
      defaultCard.classList.add('loading');
      const moodDef = MOOD_CARDS.find(m => m.key === defaultMood);
      loadSpotifyMoodTracks(defaultMood, moodDef ? moodDef.title : defaultMood, container)
        .finally(() => defaultCard.classList.remove('loading'));
    } else {
      const moodDef = MOOD_CARDS.find(m => m.key === defaultMood);
      loadSpotifyMoodTracks(defaultMood, moodDef ? moodDef.title : defaultMood, container, true);
    }
  }
}

/**
 * Fetches tracks for a given mood from the backend and renders them into the container.
 * Aligns Spotify recommended & trending widgets to SoundCloud's scroll layout.
 */
async function loadSpotifyMoodTracks(moodKey, moodTitle, containerEl, useCacheOnly = false) {
  const resultsArea = containerEl.querySelector('#spotify-results-area') ||
    document.getElementById('spotify-results-area');
  if (!resultsArea) return;

  const requestVersion = ++spotifyMoodLoadVersion;
  const ownerAtRequest = getStorageOwnerSuffix();
  const cacheKey = getSpotifyMoodCacheKey(moodKey);
  const cached = getFreshSpotifyMoodCache(moodKey);
  let moodTracks = [];
  let dynamicTracks = [];

  if (useCacheOnly && cached) {
    moodTracks = cached.moodTracks;
    dynamicTracks = cached.dynamicTracks;
  } else {
    resultsArea.innerHTML = `
      <div style="display: flex; justify-content: center; padding: 40px;">
        <div class="spinner"></div>
      </div>
    `;

    try {
      const hour = new Date().getHours();
      
      // Fetch both requests in parallel
      const [moodRes, dynamicRes] = await Promise.all([
        fetchWithTimeout(`${BACKEND_URL}/spotify/recommendations?mood=${encodeURIComponent(moodKey)}`),
        fetchWithTimeout(`${BACKEND_URL}/spotify/recommendations?mood=dynamic&hour=${hour}`)
      ]);

      if (!moodRes.ok || !dynamicRes.ok) {
        throw new Error('Failed to fetch recommendation APIs');
      }

      const moodData = await moodRes.json();
      const dynamicData = await dynamicRes.json();

      moodTracks = moodData.results || [];
      dynamicTracks = dynamicData.results || [];

      moodTracks = dedupeTracksByIdentity(moodTracks);
      const moodIdentities = new Set(moodTracks.flatMap((track) => [getTrackIdentity(track), `${track.source || 'unknown'}:${track.id}`]));
      dynamicTracks = dedupeTracksByIdentity(dynamicTracks, moodIdentities);

      if (requestVersion !== spotifyMoodLoadVersion || ownerAtRequest !== getStorageOwnerSuffix() || activeSpotifyMood !== moodKey || activeHomeSource !== 'spotify') return;
      spotifyMoodCache.set(cacheKey, { createdAt: Date.now(), moodTracks, dynamicTracks });

      // Update Carousel dynamically with loaded mood tracks
      const carouselPlaceholder = containerEl.querySelector('#spotify-carousel-container');
      if (carouselPlaceholder) {
        carouselPlaceholder.innerHTML = '';
        renderCarousel(moodTracks.slice(0, 5), carouselPlaceholder);
      }
    } catch (err) {
      console.error('[Spotify Recommendations] Failed to load tracks:', err.message);
      if (requestVersion !== spotifyMoodLoadVersion || activeSpotifyMood !== moodKey || activeHomeSource !== 'spotify' || !containerEl.isConnected) return;
      resultsArea.innerHTML = `
        <div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3);">
          Не удалось загрузить рекомендации. Попробуйте еще раз.
        </div>
      `;
      return;
    }
  }

  if (requestVersion !== spotifyMoodLoadVersion || ownerAtRequest !== getStorageOwnerSuffix() || activeSpotifyMood !== moodKey || activeHomeSource !== 'spotify' || !containerEl.isConnected) return;

  resultsArea.innerHTML = '';

  // 1. Determine dynamic time-of-day greeting text
  const currentHour = new Date().getHours();
  let dynamicGreeting = "Рекомендации";
  if (currentHour >= 6 && currentHour < 12) {
    dynamicGreeting = "Доброе утро";
  } else if (currentHour >= 12 && currentHour < 18) {
    dynamicGreeting = "Добрый день";
  } else if (currentHour >= 18 && currentHour < 24) {
    dynamicGreeting = "Добрый вечер";
  } else {
    dynamicGreeting = "Доброй ночи";
  }

  // --- RENDERING DYNAMIC SECTION ---
  if (dynamicTracks.length > 0) {
    // Dynamic section header
    const dynamicHeader = document.createElement('div');
    dynamicHeader.className = 'spotify-section-header';
    dynamicHeader.innerHTML = `
      <div class="spotify-section-title">${dynamicGreeting}</div>
      <div class="spotify-section-badge">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.377-1.454-5.37-1.783-8.894-.978-.335.077-.67-.134-.746-.47-.077-.335.134-.67.47-.746 3.847-.88 7.143-.51 9.814 1.127.294.18.387.563.207.857zm1.225-2.72c-.227.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.082-1.182-.413.125-.847-.107-.972-.52-.125-.413.107-.847.52-.972 3.676-1.116 8.243-.57 11.348 1.337.367.227.487.707.26 1.074zm.107-2.834C14.484 8.7 8.012 8.483 4.262 9.622c-.573.173-1.182-.154-1.355-.727-.173-.573.154-1.182.727-1.355 4.3-1.305 11.442-1.055 15.534 1.373.515.305.683.97.378 1.485-.305.515-.97.683-1.485.378z"/>
        </svg>
        Spotify
      </div>
    `;
    resultsArea.appendChild(dynamicHeader);

    const dynamicSection = document.createElement('div');
    dynamicSection.className = 'home-section scrollable';
    dynamicSection.style.marginBottom = '24px';
    dynamicSection.innerHTML = `
      <div class="scroller-container-outer">
        <div class="scroller-container" id="spotify-dynamic-scroller"></div>
        <button class="scroll-chevron next" id="spotify-dynamic-scroll-chevron">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>
    `;
    resultsArea.appendChild(dynamicSection);

    const dynamicScroller = dynamicSection.querySelector('#spotify-dynamic-scroller');
    dynamicTracks.forEach((track, idx) => {
      const card = renderTrackCardHorizontal(track, idx, dynamicTracks);
      dynamicScroller.appendChild(card);
    });

    dynamicSection.querySelector('#spotify-dynamic-scroll-chevron').addEventListener('click', () => {
      dynamicScroller.scrollBy({ left: 300, behavior: 'smooth' });
    });
  }

  // --- RENDERING SELECTED MOOD SECTION ---
  if (moodTracks.length > 0) {
    // Vibe section header
    const vibeHeader = document.createElement('div');
    vibeHeader.className = 'spotify-section-header';
    vibeHeader.style.marginTop = '16px';
    vibeHeader.innerHTML = `
      <div class="spotify-section-title">${moodTitle}</div>
      <button class="spotify-refresh-btn" id="spotify-refresh-btn" title="Обновить рекомендации">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        <span>Обновить реки</span>
      </button>
    `;
    resultsArea.appendChild(vibeHeader);

    // Bind refresh button click handler
    const refreshBtn = vibeHeader.querySelector('#spotify-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        refreshBtn.classList.add('loading');
        // Disable click while loading
        refreshBtn.style.pointerEvents = 'none';

        loadSpotifyMoodTracks(moodKey, moodTitle, containerEl, false)
          .finally(() => {
            const btn = document.getElementById('spotify-refresh-btn');
            if (btn) {
              btn.classList.remove('loading');
              btn.style.pointerEvents = 'auto';
            }
          });
      });
    }

    const recSection = document.createElement('div');
    recSection.className = 'home-section scrollable';
    recSection.innerHTML = `
      <div class="home-section-header">
        <h3>Рекомендуемые треки</h3>
        <a href="#" class="see-all-link" id="see-all-spotify-rec">See all <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg></a>
      </div>
      <div class="scroller-container-outer">
        <div class="scroller-container" id="spotify-rec-scroller"></div>
        <button class="scroll-chevron next" id="spotify-rec-scroll-chevron">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>
    `;
    resultsArea.appendChild(recSection);

    const recScroller = recSection.querySelector('#spotify-rec-scroller');
    const recTracks = moodTracks.slice(5, 13);
    recTracks.forEach((track, idx) => {
      const card = renderTrackCardHorizontal(track, idx, recTracks);
      recScroller.appendChild(card);
    });

    recSection.querySelector('#spotify-rec-scroll-chevron').addEventListener('click', () => {
      recScroller.scrollBy({ left: 300, behavior: 'smooth' });
    });

    recSection.querySelector('#see-all-spotify-rec').addEventListener('click', (e) => {
      e.preventDefault();
      playlist = recTracks;
      renderTracks(playlist);
    });

    // More tracks from the selected mood, kept distinct from the hero and recommendations.
    if (moodTracks.length > 13) {
      const trendSection = document.createElement('div');
      trendSection.className = 'home-section scrollable';
      trendSection.innerHTML = `
        <div class="home-section-header">
          <h3>Ещё в этом настроении</h3>
          <a href="#" class="see-all-link" id="see-all-spotify-trend">See all <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg></a>
        </div>
        <div class="scroller-container-outer">
          <div class="scroller-container" id="spotify-trend-scroller"></div>
          <button class="scroll-chevron next" id="spotify-trend-scroll-chevron">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      `;
      resultsArea.appendChild(trendSection);

      const trendScroller = trendSection.querySelector('#spotify-trend-scroller');
      const trendTracks = moodTracks.slice(13, 21);
      trendTracks.forEach((track, idx) => {
        const card = renderTrackCardHorizontal(track, idx, trendTracks);
        trendScroller.appendChild(card);
      });

      trendSection.querySelector('#spotify-trend-scroll-chevron').addEventListener('click', () => {
        trendScroller.scrollBy({ left: 300, behavior: 'smooth' });
      });

      trendSection.querySelector('#see-all-spotify-trend').addEventListener('click', (e) => {
        e.preventDefault();
        playlist = trendTracks;
        renderTracks(playlist);
      });
    }
  }
}

// --- Vibe Engine 2.0: SoundCloud Dynamic recommendations helpers ---
async function loadSoundCloudDynamicRecommendations(containerEl, forceRefresh = false) {
  if (!containerEl) return;
  const requestVersion = ++soundCloudDynamicLoadVersion;
  const ownerAtRequest = getStorageOwnerSuffix();

  if (!forceRefresh && cachedSoundCloudDynamicTracks && Date.now() - cachedSoundCloudDynamicAt < HOME_RECOMMENDATION_TTL) {
    renderSoundCloudDynamicSection(containerEl, cachedSoundCloudDynamicTracks);
    return;
  }

  containerEl.innerHTML = `
    <div style="display: flex; justify-content: center; padding: 20px 0;">
      <div class="spinner"></div>
    </div>
  `;

  try {
    const hour = new Date().getHours();
    let tracks = [];
    try {
      const res = await fetchWithTimeout(`${BACKEND_URL}/spotify/recommendations?mood=dynamic&hour=${hour}`, {}, 2500);
      if (res.ok) {
        const data = await res.json();
        tracks = (data.results || []).map(t => {
          const rawId = t.id.startsWith('spotify_track:') ? t.id.split(':').slice(3).join(':') : t.id;
          return {
            ...t,
            id: rawId,
            source: 'soundcloud'
          };
        });
      }
    } catch (e) {}

    // Fallback to direct time-of-day search
    if (tracks.length === 0) {
      let timeQuery = 'chill beats';
      if (hour >= 6 && hour < 12) timeQuery = 'morning acoustic chill';
      else if (hour >= 12 && hour < 18) timeQuery = 'day electronic dance hits';
      else if (hour >= 18 && hour < 24) timeQuery = 'evening chillout wave';
      else timeQuery = 'night lofi beats';
      try {
        tracks = await DirectSoundCloudEngine.search(timeQuery, 10);
      } catch (scErr) {}
    }

    if (requestVersion !== soundCloudDynamicLoadVersion || ownerAtRequest !== getStorageOwnerSuffix() || activeView !== 'home' || activeHomeSource !== 'soundcloud' || !containerEl.isConnected) return;
    if (tracks.length > 0) {
      cachedSoundCloudDynamicTracks = tracks;
      cachedSoundCloudDynamicAt = Date.now();
      renderSoundCloudDynamicSection(containerEl, tracks);
    } else {
      containerEl.innerHTML = '';
    }
  } catch (err) {
    if (requestVersion !== soundCloudDynamicLoadVersion || activeView !== 'home' || activeHomeSource !== 'soundcloud' || !containerEl.isConnected) return;
    containerEl.innerHTML = '';
  }
}

function renderSoundCloudDynamicSection(containerEl, tracks) {
  containerEl.innerHTML = '';
  if (tracks.length === 0) return;

  const currentHour = new Date().getHours();
  let timeContext = "Подборка на сейчас";
  if (currentHour >= 6 && currentHour < 12) {
    timeContext = "Спокойный старт дня";
  } else if (currentHour >= 12 && currentHour < 18) {
    timeContext = "Музыка для дневного ритма";
  } else if (currentHour >= 18 && currentHour < 24) {
    timeContext = "Для вечернего настроения";
  } else {
    timeContext = "Ночная подборка";
  }

  const header = document.createElement('div');
  header.className = 'spotify-section-header';
  header.style.marginTop = '16px';
  header.innerHTML = `
    <div class="home-section-heading"><div class="spotify-section-title">Под настроение</div><p>${timeContext}</p></div>
    <button class="spotify-refresh-btn" id="soundcloud-refresh-btn" title="Обновить рекомендации">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
      <span>Обновить реки</span>
    </button>
  `;
  containerEl.appendChild(header);

  // Bind refresh button click handler
  const refreshBtn = header.querySelector('#soundcloud-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshBtn.classList.add('loading');
      refreshBtn.disabled = true;
      loadSoundCloudDynamicRecommendations(containerEl, true)
        .finally(() => {
          const btn = document.getElementById('soundcloud-refresh-btn');
          if (btn) {
            btn.classList.remove('loading');
            btn.disabled = false;
          }
        });
    });
  }

  const section = document.createElement('div');
  section.className = 'home-section scrollable';
  section.style.marginBottom = '16px';
  section.innerHTML = `
    <div class="scroller-container-outer">
      <div class="scroller-container" id="soundcloud-dynamic-scroller"></div>
      <button class="scroll-chevron next" id="soundcloud-dynamic-scroll-chevron">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
    </div>
  `;
  containerEl.appendChild(section);

  const scroller = section.querySelector('#soundcloud-dynamic-scroller');
  tracks.forEach((track, idx) => {
    const card = renderTrackCardHorizontal(track, idx, tracks);
    scroller.appendChild(card);
  });

  section.querySelector('#soundcloud-dynamic-scroll-chevron').addEventListener('click', () => {
    scroller.scrollBy({ left: 300, behavior: 'smooth' });
  });
}

// ── RELEASE 1.16.5: Hotfix Engine Additions ───────────────────────────────

// 1. Direct Track Download Engine (0 Server Bytes)
async function downloadCurrentTrack(trackObj) {
  const track = trackObj || playlist[currentTrackIndex];
  if (!track) {
    showToastNotification('Нет активного трека для скачивания', 'warning');
    return;
  }

  showToastNotification(`Начало скачивания: ${track.title}...`, 'info');
  try {
    const streamUrl = getAudioStreamUrl(track);
    const response = await fetch(streamUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();

    // Auto-save to IndexedDB local library
    const file = new File([blob], `${track.artist} - ${track.title}.mp3`, { type: 'audio/mpeg' });
    await saveLocalTrack(file);

    // Save to user PC disk if in Electron or browser download
    if (window.electronAPI && window.electronAPI.saveFile) {
      const arrayBuffer = await blob.arrayBuffer();
      await window.electronAPI.saveFile(`${track.artist} - ${track.title}.mp3`, Buffer.from(arrayBuffer));
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${track.artist} - ${track.title}.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    showToastNotification(`Трек «${track.title}» скачан в медиатеку!`, 'success');
    if (activeView === 'library' && currentLibrarySubTab === 'local') {
      loadFavorites('local');
    }
  } catch (err) {
    console.error('[Download Error]:', err);
    showToastNotification('Ошибка при скачивании трека', 'error');
  }
}

const downloadBtn = document.getElementById('download-button');
if (downloadBtn) {
  downloadBtn.addEventListener('click', () => downloadCurrentTrack());
}

// 2. Mini-Player Options Popover Toggle
const miniMoreBtn = document.getElementById('mini-more-button');
const miniMorePopover = document.getElementById('mini-more-popover');
if (miniMoreBtn && miniMorePopover) {
  miniMoreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    miniMorePopover.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#mini-more-popover') && !e.target.closest('#mini-more-button')) {
      miniMorePopover.classList.add('hidden');
    }
  });
}

// 3. Player Bar Swipe Down Gesture Handler
let isDraggingPlayerBar = false;
let startPlayerBarY = 0;
let currentPlayerBarTranslateY = 0;
const playerBarEl = document.querySelector('.player-bar');

if (playerBarEl) {
  const onDragStart = (clientY) => {
    isDraggingPlayerBar = true;
    startPlayerBarY = clientY;
    playerBarEl.style.transition = 'none';
  };

  const onDragMove = (clientY) => {
    if (!isDraggingPlayerBar) return;
    const deltaY = clientY - startPlayerBarY;
    if (deltaY > 0) {
      currentPlayerBarTranslateY = deltaY;
      playerBarEl.style.transform = `translate3d(0, ${deltaY}px, 0)`;
    }
  };

  const onDragEnd = () => {
    if (!isDraggingPlayerBar) return;
    isDraggingPlayerBar = false;
    playerBarEl.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
    
    if (currentPlayerBarTranslateY > 65) {
      playerBarEl.classList.add('dismissed');
      playerBarEl.classList.remove('active');
      playerBarEl.style.transform = 'translate3d(0, 140%, 0)';
      if (!audioPlayer.paused) audioPlayer.pause();
      setPlayState(false);
      currentTrackIndex = -1;
      const container = document.querySelector('.container');
      if (container) container.classList.remove('player-active');
      showToastNotification('Плеер свернут', 'info');
    } else {
      playerBarEl.style.transform = 'translate3d(0, 0, 0)';
    }
    currentPlayerBarTranslateY = 0;
  };

  playerBarEl.addEventListener('mousedown', (e) => {
    if (e.target.closest('button, input, a, .player-volume-container, .player-controls')) return;
    onDragStart(e.clientY);
  });
  window.addEventListener('mousemove', (e) => onDragMove(e.clientY));
  window.addEventListener('mouseup', onDragEnd);

  playerBarEl.addEventListener('touchstart', (e) => {
    if (e.target.closest('button, input, a, .player-volume-container, .player-controls')) return;
    if (e.touches.length === 1) onDragStart(e.touches[0].clientY);
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) onDragMove(e.touches[0].clientY);
  }, { passive: true });
  window.addEventListener('touchend', onDragEnd);
}

// ── Track Share Links ──────────────────────────────────────────────────────
// Self-contained feature: copy a public link to a track and open incoming
// glassplayer:// links. Reuses playTrack()/showToastNotification() as-is and
// never mutates existing playlist arrays (appends via concat so card indices stay valid).
const SHARE_LINK_BASE_URL = `${DEFAULT_MIRRORS[0]}/share/track`;
const SHARE_ALLOWED_SOURCES = new Set(['soundcloud', 'spotify']);
const SHARE_MAX_TEXT_LENGTH = 200;
const SHARE_LINK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

let shareLinksAppReady = false;
const pendingIncomingShareLinks = [];


function isTrackShareable(track) {
  return Boolean(track && !track.blobUrl && SHARE_ALLOWED_SOURCES.has(track.source) && shareCleanId(track.id));
}

function buildTrackShareUrl(track) {
  if (!isTrackShareable(track)) return null;
  const params = new URLSearchParams();
  params.set('src', track.source);
  params.set('id', shareCleanId(track.id));
  params.set('t', shareCleanText(track.title) || 'Unknown Track');
  const artist = shareCleanText(track.artist);
  if (artist) params.set('a', artist);
  const image = shareCleanImage(track.thumbnail);
  if (image) params.set('img', image);
  const duration = shareCleanDuration(track.duration);
  if (duration) params.set('d', duration);
  const artistId = String(track.artistId || '');
  if (/^\d{1,20}$/.test(artistId)) params.set('aid', artistId);
  return `${SHARE_LINK_BASE_URL}?${params.toString()}`;
}

async function writeTextToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('[Share Links] Clipboard API failed, using fallback:', err.message);
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

async function copyTrackShareLink(track) {
  if (!track) {
    showToastNotification('Сначала включите трек', 'info', 'Поделиться');
    return;
  }
  if (track.source === 'local' || track.blobUrl) {
    showToastNotification('Локальные треки с устройства нельзя отправить ссылкой', 'warning', 'Поделиться');
    return;
  }
  const url = buildTrackShareUrl(track);
  if (!url) {
    showToastNotification('Для этого трека ссылка недоступна', 'warning', 'Поделиться');
    return;
  }
  const copied = await writeTextToClipboard(url);
  if (copied) {
    showToastNotification(`Ссылка на «${shareCleanText(track.title)}» скопирована — отправьте её другу`, 'success', 'Поделиться');
  } else {
    showToastNotification('Не удалось скопировать ссылку в буфер обмена', 'error', 'Поделиться');
  }
}


function playSharedTrack(track) {
  let index = playlist.findIndex(t => t && t.id === track.id);
  if (index === -1) {
    // New array (no mutation of likes/playlists/history arrays) appended at the end,
    // so indices of already rendered cards remain correct.
    playlist = playlist.concat([track]);
    index = playlist.length - 1;
  }
  playTrack(index);
  showToastNotification(`${track.artist} — ${track.title}`, 'info', 'Трек по ссылке');
}

function handleIncomingShareLink(rawLink) {
  const track = parseIncomingShareLink(rawLink);
  if (!track) {
    showToastNotification('Ссылка на трек повреждена или устарела', 'warning', 'Поделиться');
    return;
  }
  if (!shareLinksAppReady) {
    pendingIncomingShareLinks.length = 0; // only the latest link matters
    pendingIncomingShareLinks.push(track);
    return;
  }
  playSharedTrack(track);
}

function flushPendingShareLinks() {
  if (shareLinksAppReady) return;
  shareLinksAppReady = true;
  const track = pendingIncomingShareLinks.pop();
  pendingIncomingShareLinks.length = 0;
  if (track) playSharedTrack(track);

  if (isElectron && window.electronAPI?.consumePendingShareLink) {
    window.electronAPI.consumePendingShareLink()
      .then(link => { if (link) handleIncomingShareLink(link); })
      .catch(err => console.warn('[Share Links] Failed to read launch link:', err.message));
  }
}

// Called from showPlaylistMenu() — adds "Скопировать ссылку" to the per-track menu.
function appendShareItemToTrackMenu(track) {
  if (!playlistMenuList || !isTrackShareable(track)) return;
  const shareItem = document.createElement('button');
  shareItem.type = 'button';
  shareItem.className = 'playlist-menu-item share-link-menu-item';
  shareItem.innerHTML = `<span class="share-link-menu-label">${SHARE_LINK_ICON}Скопировать ссылку</span>`;
  shareItem.addEventListener('click', () => {
    playlistMenu?.classList.add('hidden');
    copyTrackShareLink(track);
  });
  playlistMenuList.appendChild(shareItem);
}

function initPlayerShareButton() {
  const likeBtn = document.getElementById('player-like-btn');
  if (!likeBtn || document.getElementById('player-share-btn')) return;
  const shareBtn = document.createElement('button');
  shareBtn.id = 'player-share-btn';
  shareBtn.type = 'button';
  shareBtn.className = 'player-share-btn';
  shareBtn.title = 'Скопировать ссылку на трек';
  shareBtn.setAttribute('aria-label', 'Скопировать ссылку на трек');
  shareBtn.innerHTML = SHARE_LINK_ICON;
  shareBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyTrackShareLink(activePlayingTrack);
  });
  likeBtn.insertAdjacentElement('afterend', shareBtn);
}

try {
  initPlayerShareButton();
  if (isElectron && window.electronAPI?.onOpenShareLink) {
    window.electronAPI.onOpenShareLink(handleIncomingShareLink);
  }
  window.addEventListener('gp:app-ready', flushPendingShareLinks, { once: true });
  // Safety net: if startup stalled (offline / home view error), still honour the link.
  setTimeout(flushPendingShareLinks, 15000);
} catch (err) {
  console.error('[Share Links] Init failed (player unaffected):', err);
}
