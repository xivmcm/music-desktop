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
// activeSources is managed reactively on window by js/views/search-view.js
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
// currentSearchPage is managed reactively on window by js/views/search-view.js
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
    console.debug('[Direct SC Engine] Rotated to client_id:', this.clientId);
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

// --- Search Functionality & Pagination (Extracted to js/views/search-view.js) ---

// --- Track Card Component (Extracted to js/components/track-card.js) ---
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

// --- Toast Notifications & Confirm Dialogs (Extracted to js/components/notifications.js) ---

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
// window.getFollowedArtists and window.getSearchHistory are managed by js/views/artist-view.js and js/views/search-view.js

function getStorageKey(key) {
  return `gp_${key}_${getStorageOwnerSuffix()}`;
}

// --- Follow Artist System (Extracted to js/views/artist-view.js) ---

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
homeButton.addEventListener('click', () => { updateActiveTab('home'); loadHomeView(); });
favoritesButton.addEventListener('click', () => { updateActiveTab('library'); loadFavorites(currentLibrarySubTab); });
historyButton.addEventListener('click', () => { updateActiveTab('history'); loadHistoryView(); });
playlistsButton.addEventListener('click', () => { updateActiveTab('playlists'); loadPlaylistsView(); });
settingsButton.addEventListener('click', () => { updateActiveTab('settings'); loadSettingsView(); });
if (studioButton) {
  studioButton.addEventListener('click', () => { updateActiveTab('studio'); loadStudioView('visual'); });
}
if (statsButton) {
  statsButton.addEventListener('click', () => { updateActiveTab('stats'); loadStatsView(); });
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

// --- Artist Profile & Discography Views (Extracted to js/views/artist-view.js) ---
// --- Search History & Autocomplete Dropdown (Extracted to js/views/search-view.js) ---

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
  if (viewName !== 'home') {
    if (typeof carouselTimer !== 'undefined' && carouselTimer) {
      clearInterval(carouselTimer);
      carouselTimer = null;
    }
  }

  // Hide user search results if we switch away from search view
  const usersContainer = document.getElementById('users-search-results');
  if (usersContainer && viewName !== 'search') {
    usersContainer.classList.add('hidden');
  }

  const tabButtons = {
    'home': homeButton || document.getElementById('home-button'),
    'library': favoritesButton || document.getElementById('favorites-button'),
    'history': historyButton || document.getElementById('history-button'),
    'playlists': playlistsButton || document.getElementById('playlists-button'),
    'studio': studioButton || document.getElementById('studio-button'),
    'stats': statsButton || document.getElementById('stats-button'),
    'settings': settingsButton || document.getElementById('settings-button')
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
  if (tracksContainer) {
    tracksContainer.classList.remove('fade-in');
    void tracksContainer.offsetWidth; // Force reflow
    tracksContainer.classList.add('fade-in');
  }
}
window.updateActiveTab = updateActiveTab;

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

// --- Track Share Links (Extracted to js/components/share.js) ---
