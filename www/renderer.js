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
// Home, recommendation & vibe state managed by js/views/home-view.js

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
// likedTrackIds is managed reactively on window by js/views/library-view.js
// activeView is managed reactively on window by js/views/settings-view.js
// activePlaylistId and selectedTrackForPlaylist are managed reactively on window by js/views/playlists-view.js
// activeGenreChip, originalHomeData and cachedForYouData managed reactively on window by js/views/home-view.js
let currentSearchPage = 1;
const maxTracksLimit = 80;

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
window.API_URL = API_URL;
window.BACKEND_URL = BACKEND_URL;
window.DEFAULT_MIRRORS = DEFAULT_MIRRORS;
window.fetchWithTimeout = fetchWithTimeout;
window.getOptimalCoverUrl = getOptimalCoverUrl;
window.getFallbackCoverUrl = getFallbackCoverUrl;

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
window.DirectSoundCloudEngine = DirectSoundCloudEngine;


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
window.getStorageOwnerSuffix = getStorageOwnerSuffix;
window.getProfilePlayStats = getProfilePlayStats;
window.getFollowedArtists = getFollowedArtists;
window.getSearchHistory = getSearchHistory;

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

// --- Home Recommendation Engine & Cache (Extracted to js/views/home-view.js) ---


// --- Library, Favorites & History (Extracted to js/views/library-view.js) ---

// --- Playlists View & Controllers (Extracted to js/views/playlists-view.js) ---

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

// --- Home View & Rail Components (Extracted to js/views/home-view.js) ---

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

// --- Step 3 Settings & Themes Controller (Extracted to js/views/settings-view.js) ---

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

// --- Collaborative & Friend Playlists (Extracted to js/views/playlists-view.js) ---

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

// --- Carousel Banner & Spotify/SoundCloud Dynamic Views (Extracted to js/views/home-view.js) ---

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
