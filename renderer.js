const isElectron = Boolean(window.electronAPI);
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
let cachedSpotifyTracks = null; // Cached tracks of the active Spotify mood
let cachedSpotifyDynamicTracks = null; // Cached time-of-day tracks
let cachedSoundCloudDynamicTracks = null; // Cached SoundCloud time-of-day tracks

// Genre chip render version — prevents stale async responses from corrupting state
let genreRenderVersion = 0;

// Lyrics state
const lyricsState = {
  lrcLines: [],        // Array of { time, text } for LRC mode
  isOpen: false,
  syncTimer: null,
  currentTrackId: null,
  format: null,        // 'lrc' | 'plain' | null
  lastActiveIdx: -1,
};

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

document.querySelectorAll('[data-electron-action]').forEach((button) => {
  const action = button.dataset.electronAction;
  button.addEventListener('click', () => {
    if (isElectron && window.electronAPI?.[action]) {
      window.electronAPI[action]();
    }
  });
});

if ('serviceWorker' in navigator && !isElectron) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(() => console.log('[PWA] Service worker registered'))
      .catch((err) => console.warn('[PWA] Service worker registration failed:', err.message));
  });
}

// App state variables
let playlist = [];
let currentTrackIndex = -1;
let activePlayingTrack = null;
let isSeeking = false;
let likedTrackIds = new Set();
let currentProfile = 'Default';
let profiles = ['Default'];
let activeView = 'home'; // 'home', 'search', 'library', 'history', 'playlists', 'playlist-tracks', 'settings', 'artist'
let activePlaylistId = null;
let selectedTrackForPlaylist = null;
let isRepeat = false;
let isShuffle = false;
let currentPlayPromise = null;
let currentSeekOffset = 0;
let currentTrackDuration = 0;
let playCountSession = {
  trackId: null,
  continuousSeconds: 0,
  counted: false
};
let activeGenreChip = null;
let originalHomeData = null;
let trackLoadTimeout = null;
let currentSearchPage = 1;
const maxTracksLimit = 80;

// RELEASE 1.3.0 Auth state
let currentUser = null;
let token = null;
let tempAvatarBase64 = '';
let isRegistering = false;

let audioCtx = null;
let bassFilter = null;
let eqFilters = [];
let analyser = null;
let bufferLength = 0;
let dataArray = null;

function initAudioEffects() {
  if (audioCtx) return;

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaElementSource(audioPlayer);

    // Create lowshelf filter for Bass Boost
    bassFilter = audioCtx.createBiquadFilter();
    bassFilter.type = 'lowshelf';
    bassFilter.frequency.value = 100;

    const savedBassBoost = localStorage.getItem('gp_effect_bassboost') === 'true';
    bassFilter.gain.value = savedBassBoost ? 10 : 0;

    const eqBands = [60, 230, 910, 4000, 14000];
    eqFilters = eqBands.map((frequency) => {
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = frequency;
      filter.Q.value = 1;
      filter.gain.value = parseFloat(localStorage.getItem(`gp_eq_${frequency}`) || '0');
      return filter;
    });

    // Create Analyser
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    // Chain: Source -> Bass Boost -> EQ bands -> Analyser -> Destination
    source.connect(bassFilter);
    let previousNode = bassFilter;
    eqFilters.forEach(filter => {
      previousNode.connect(filter);
      previousNode = filter;
    });
    previousNode.connect(analyser);
    analyser.connect(audioCtx.destination);

    console.log('[Web Audio API] AudioContext, Bass Boost filter, and Analyser initialized successfully');
  } catch (err) {
    console.error('[Web Audio API] Initialization failed:', err);
  }
}

function applyAudioEffectsState() {
  const speed = parseFloat(localStorage.getItem('gp_effect_speed') || '1.0');
  const pitchLinked = localStorage.getItem('gp_effect_pitch_linked') === 'true';
  const bassBoost = localStorage.getItem('gp_effect_bassboost') === 'true';

  if (audioPlayer) {
    audioPlayer.playbackRate = speed;
    audioPlayer.defaultPlaybackRate = speed;
    audioPlayer.preservesPitch = !pitchLinked;
  }

  if (bassFilter) {
    bassFilter.gain.value = bassBoost ? 10 : 0;
  }

  if (eqFilters.length) {
    [60, 230, 910, 4000, 14000].forEach((frequency, index) => {
      if (eqFilters[index]) {
        eqFilters[index].gain.value = parseFloat(localStorage.getItem(`gp_eq_${frequency}`) || '0');
      }
    });
  }
}

function resumeAudioContext() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(err => {
      console.warn('[Web Audio API] Failed to resume AudioContext:', err.message);
    });
  }
}

function setupMediaSession(track) {
  if (!('mediaSession' in navigator) || !track) return;

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || 'Название трека',
      artist: track.artist || 'Исполнитель',
      album: 'GlassPlayer',
      artwork: [{
        src: track.thumbnail || track.cover || 'assets/icon.png',
        sizes: '512x512',
        type: 'image/png'
      }]
    });

    navigator.mediaSession.setActionHandler('play', () => { togglePlay(true); });
    navigator.mediaSession.setActionHandler('pause', () => { togglePlay(false); });
    navigator.mediaSession.setActionHandler('previoustrack', () => { playPrev(); });
    navigator.mediaSession.setActionHandler('nexttrack', () => { playNext(); });
  } catch (err) {
    console.warn('[MediaSession] Setup failed:', err.message);
  }
}

let nativeMediaControlsListenerAttached = false;

function getGlassMediaPlugin() {
  return window.Capacitor?.Plugins?.GlassMedia || null;
}

function setupNativeMediaControlsListener() {
  const glassMedia = getGlassMediaPlugin();
  if (!glassMedia || nativeMediaControlsListenerAttached) return;

  nativeMediaControlsListenerAttached = true;
  glassMedia.addListener('mediaAction', ({ action }) => {
    if (action === 'play') togglePlay(true);
    if (action === 'pause') togglePlay(false);
    if (action === 'previous') playPrev();
    if (action === 'next') playNext();
  });
}

function updateNativeMediaControls(track, isPlaying) {
  const glassMedia = getGlassMediaPlugin();
  if (!glassMedia) return;

  setupNativeMediaControlsListener();
  if (!track) {
    glassMedia.hide?.().catch(() => {});
    return;
  }

  glassMedia.update({
    title: track.title || 'GlassPlayer',
    artist: track.artist || 'Ready to play',
    artwork: track.thumbnail || track.cover || 'assets/icon.png',
    isPlaying: Boolean(isPlaying)
  }).catch((err) => {
    console.warn('[GlassMedia] Native notification update failed:', err.message);
  });
}

function updateMediaSessionPlaybackState(isPlaying) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }
}
let cachedForYouData = null;

// Base Server API URL Configuration
const DEFAULT_API_URL = 'https://music-backend-iyni.onrender.com';
const API_URL = localStorage.getItem('gp_backend_url') || DEFAULT_API_URL;
const BACKEND_URL = `${API_URL}/api`;

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

    const response = await fetch(`${BACKEND_URL}/search?q=${encodeURIComponent(query)}&sources=${sourcesStr}&page=1&limit=20`);
    const data = await response.json();

    loadingIndicator.classList.add('hidden');

    // Handle user search results (only page 1)
    const usersContainer = document.getElementById('users-search-results');
    const usersRow = usersContainer ? usersContainer.querySelector('.users-search-row') : null;

    if (usersContainer && usersRow) {
      if (data.users && data.users.length > 0) {
        usersRow.innerHTML = '';
        data.users.forEach(user => {
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

    if (data.status === 'success') {
      if (data.results && data.results.length > 0) {
        playlist = data.results;
        renderTracks(playlist);
        tracksContainer.classList.remove('hidden');
        updateLoadMoreButton(playlist.length); // Update pagination buttons
      } else {
        playlist = [];
        tracksContainer.innerHTML = '<div class="welcome-state"><h2>No results found</h2><p>Try searching for something else</p></div>';
        tracksContainer.classList.remove('hidden');
      }
    } else {
      playlist = [];
      tracksContainer.innerHTML = `<div class="welcome-state"><h2>Ошибка сервера</h2><p>${data.message || 'Произошла ошибка при выполнении поиска'}</p></div>`;
      tracksContainer.classList.remove('hidden');
    }
    updateActiveTab('search');
  } catch (error) {
    console.error('Search error:', error);
    loadingIndicator.classList.add('hidden');
    tracksContainer.innerHTML = '<div class="welcome-state"><h2>Не удалось подключиться к серверу</h2><p>Проверьте соединение с интернетом</p></div>';
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

  try {
    const response = await fetch(`${BACKEND_URL}/search?q=${encodeURIComponent(query)}&sources=${sourcesStr}&page=${currentSearchPage}&limit=20`);
    const data = await response.json();

    if (btn) btn.remove();

    if (data.status === 'success' && data.results && data.results.length > 0) {
      const newTracks = data.results;
      playlist = playlist.concat(newTracks);

      renderTracks(newTracks, null, true);
      updateLoadMoreButton(newTracks.length);
    } else {
      updateLoadMoreButton(0);
    }
  } catch (error) {
    console.error('Load more error:', error);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Показать еще';
    }
    showToastNotification("Не удалось загрузить еще треки");
  }
}

function formatPlaybackCount(count) {
  if (count === undefined || count === null || isNaN(count)) return '';
  const num = Number(count);
  if (num >= 1000000) {
    const formatted = (num / 1000000).toFixed(1);
    return formatted.endsWith('.0') ? formatted.slice(0, -2) + 'M' : formatted + 'M';
  }
  if (num >= 1000) {
    return Math.floor(num / 1000) + 'K';
  }
  return num.toString();
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

    // Correct playlist index so click events play the correct track!
    const overallIndex = append ? playlist.length - tracks.length + index : index;
    card.dataset.index = overallIndex;
    card.dataset.trackId = track.id;

    // Strict validation and fallbacks
    const trackTitle = track.title ? track.title.trim() : "Unknown Track";
    const trackArtist = track.artist ? track.artist.trim() : "Unknown Artist";
    const defaultSvgCover = 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'><rect width=\'100\' height=\'100\' fill=\'%23222\'/><path d=\'M30 30 L70 50 L30 70 Z\' fill=\'%23444\'/></svg>';
    const coverUrl = track.thumbnail
      ? `${BACKEND_URL}/cover?url=${encodeURIComponent(track.thumbnail)}`
      : defaultSvgCover;

    const isLiked = likedTrackIds.has(track.id);
    const heartIcon = isLiked
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;

    let actionsHTML = '';
    if (activeView === 'playlist-tracks' && activePlaylistId) {
      actionsHTML = `
        <button class="playlist-remove-track-btn" title="Remove from Playlist" style="background:transparent; border:none; color:rgba(255,255,255,0.25); cursor:pointer; padding:8px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:all 0.2s ease; z-index:20;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;
    } else {
      actionsHTML = `
        <button class="playlist-add-btn" title="Add to Playlist">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      `;
    }

    const artistHTML = `<span class="artist-link">${trackArtist}</span>`;

    const isCurrentPlaying = isActive && !audioPlayer.paused;
    const coverPlayIcon = isCurrentPlaying
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 2px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;

    const playsHTML = track.source === 'soundcloud' && (track.playbackCount !== undefined || track.playback_count !== undefined)
      ? `<span class="card-plays" title="Прослушивания">👁 ${formatPlaybackCount(track.playbackCount || track.playback_count)}</span>`
      : '';

    card.innerHTML = `
      <div class="track-cover-container">
        <img src="${coverUrl}" class="card-cover" alt="${trackTitle}">
        <div class="cover-overlay">
          <button class="cover-play-btn" title="Play/Pause">
            ${coverPlayIcon}
          </button>
        </div>
      </div>
      <div class="card-details">
        <div class="card-title">${trackTitle}</div>
        <div class="card-artist">${artistHTML}</div>
        <div class="card-meta">
          <span class="badge ${track.source}">
            ${track.source === 'soundcloud'
              ? `<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style="margin-right:3px"><path d="M23.95 14.47c0-2.45-1.92-4.44-4.29-4.44h-.35c-.48-2.61-2.73-4.6-5.46-4.6-2.58 0-4.73 1.83-5.32 4.26-.26-.06-.53-.09-.81-.09-2.58 0-4.67 2.09-4.67 4.67 0 .16.01.32.02.48C1.29 14.53 0 16.03 0 17.84c0 2.08 1.68 3.76 3.76 3.76h16.5c1.96 0 3.69-1.55 3.69-3.51 0-1.74-1.28-3.18-2.97-3.52z"/></svg>SC`
              : track.source === 'spotify'
              ? `<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style="margin-right:3px"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.377-1.454-5.37-1.783-8.894-.978-.335.077-.67-.134-.746-.47-.077-.335.134-.67.47-.746 3.847-.88 7.143-.51 9.814 1.127.294.18.387.563.207.857zm1.225-2.72c-.227.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.082-1.182-.413.125-.847-.107-.972-.52-.125-.413.107-.847.52-.972 3.676-1.116 8.243-.57 11.348 1.337.367.227.487.707.26 1.074zm.107-2.834C14.484 8.7 8.012 8.483 4.262 9.622c-.573.173-1.182-.154-1.355-.727-.173-.573.154-1.182.727-1.355 4.3-1.305 11.442-1.055 15.534 1.373.515.305.683.97.378 1.485-.305.515-.97.683-1.485.378z"/></svg>SP`
              : `<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style="margin-right:3px"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>YT`}
          </span>
          <span class="card-meta-right" style="display: flex; align-items: center; gap: 8px;">
            ${playsHTML}
            <span class="card-duration">${track.duration}</span>
          </span>
        </div>
      </div>
      ${actionsHTML}
      <button class="like-btn ${isLiked ? 'liked' : ''}">${heartIcon}</button>
    `;

    card.addEventListener('click', (e) => {
      // Don't play if clicking the like, playlist or artist link button itself
      if (e.target.closest('.like-btn') || e.target.closest('.playlist-add-btn') || e.target.closest('.playlist-remove-track-btn') || e.target.closest('.artist-link')) return;

      const isCurrent = activePlayingTrack && track.id === activePlayingTrack.id;
      if (isCurrent) {
        togglePlay();
      } else {
        playTrack(overallIndex);
      }
    });

    const likeBtn = card.querySelector('.like-btn');
    likeBtn.addEventListener('click', (e) => {
      toggleLike(e, track);
    });

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

    if (activeView === 'playlist-tracks' && activePlaylistId) {
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

function incrementPlayCount(track) {
  try {
    const statsStr = localStorage.getItem('gp_stats_counts');
    const stats = statsStr ? JSON.parse(statsStr) : {};
    if (!stats[track.id]) {
      stats[track.id] = {
        id: track.id,
        title: track.title,
        artist: track.artist,
        thumbnail: track.thumbnail,
        source: track.source,
        count: 0
      };
    }
    stats[track.id].count += 1;
    localStorage.setItem('gp_stats_counts', JSON.stringify(stats));
  } catch (err) {
    console.error('Failed to update play count statistics:', err);
  }
}

function resetPlayCountSession(track) {
  playCountSession = {
    trackId: track?.id || null,
    continuousSeconds: 0,
    counted: false
  };
}

function maybeCommitQualifiedPlay() {
  const track = playlist[currentTrackIndex];
  if (!track || playCountSession.counted || playCountSession.trackId !== track.id) return;

  const duration = currentTrackDuration || audioPlayer.duration || 0;
  const listenedEnough = playCountSession.continuousSeconds >= 30;
  const passedHalf = duration > 0 && playCountSession.continuousSeconds >= duration * 0.5;

  if (listenedEnough || passedHalf) {
    incrementPlayCount(track);
    playCountSession.counted = true;
  }
}

setInterval(() => {
  if (!audioPlayer || audioPlayer.paused || isSeeking) return;

  const track = playlist[currentTrackIndex];
  if (!track) return;

  let totalSeconds = parseFloat(localStorage.getItem('gp_stats_total_seconds')) || 0;
  totalSeconds += 10;
  localStorage.setItem('gp_stats_total_seconds', totalSeconds);

  if (playCountSession.trackId !== track.id) {
    resetPlayCountSession(track);
  }
  playCountSession.continuousSeconds += 10;
  maybeCommitQualifiedPlay();
}, 10000);

// 3. Play Track
// 3. Play Track
function playTrack(index) {
  if (index < 0 || index >= playlist.length) return;

  currentTrackIndex = index;
  const track = playlist[index];
  activePlayingTrack = track;

  // Slide up bottom player bar
  const mainContainer = document.querySelector('.container');
  if (mainContainer) {
    mainContainer.classList.add('player-active');
  }

  // Add to playback history
  addToHistory(track);

  resetPlayCountSession(track);

  // Update Active UI State
  const cards = document.querySelectorAll('.track-card, .track-card-horizontal');
  cards.forEach(card => card.classList.remove('active'));
  const activeCards = document.querySelectorAll(`.track-card[data-track-id="${track.id}"], .track-card-horizontal[data-track-id="${track.id}"]`);
  activeCards.forEach(card => card.classList.add('active'));

  // Update Player Meta Info
  currentTitle.textContent = track.title;
  if (miniCurrentTitle) miniCurrentTitle.textContent = track.title;

  currentArtist.innerHTML = `<span class="artist-link">${track.artist}</span>`;
  const artistLink = currentArtist.querySelector('.artist-link');
  if (artistLink) {
    artistLink.addEventListener('click', (e) => {
      e.stopPropagation();
      if (track.source === 'soundcloud' && track.artistId) {
        loadArtistView(track.artistId);
      } else {
        if (searchInput) {
          searchInput.value = track.artist;
          performSearch();
        }
      }
    });
  }
  if (miniCurrentArtist) miniCurrentArtist.textContent = track.artist;

  const coverUrl = track.thumbnail
    ? `${BACKEND_URL}/cover?url=${encodeURIComponent(track.thumbnail)}`
    : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23222"/><path d="M30 30 L70 50 L30 70 Z" fill="%23444"/></svg>';

  currentCover.crossOrigin = 'anonymous';
  currentCover.src = coverUrl;

  if (miniCurrentCover) {
    miniCurrentCover.crossOrigin = 'anonymous';
    miniCurrentCover.src = coverUrl;
  }

  // Update player like button state
  if (playerLikeBtn) {
    const isLiked = likedTrackIds.has(track.id);
    const heartIcon = isLiked
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
    if (isLiked) {
      playerLikeBtn.classList.add('liked');
    } else {
      playerLikeBtn.classList.remove('liked');
    }
    playerLikeBtn.innerHTML = heartIcon;
  }

  currentTrackDuration = parseDurationToSeconds(track.duration);
  currentSeekOffset = 0;

  // Load stream
  audioPlayer.crossOrigin = 'anonymous';
  audioPlayer.src = `${BACKEND_URL}/stream?id=${encodeURIComponent(track.id)}&source=${track.source}&artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}`;

  // Initialize and apply Audio Effects
  initAudioEffects();
  resumeAudioContext();
  applyAudioEffectsState();
  setupMediaSession(track);
  setupNativeMediaControlsListener();

  const playPromise = audioPlayer.play();
  currentPlayPromise = playPromise;

  // Clear any previous loading timeout before starting a new track
  clearTimeout(trackLoadTimeout);

  // Set 10-second track loading timeout
  trackLoadTimeout = setTimeout(() => {
    if (currentPlayPromise === playPromise) {
      handleTrackLoadError("Track loading timed out (10 seconds limit)");
    }
  }, 10000);

  playPromise
    .then(() => {
      clearTimeout(trackLoadTimeout);
      if (currentPlayPromise === playPromise) {
        setPlayState(true);
      }
    })
    .catch(err => {
      clearTimeout(trackLoadTimeout);
      if (err.name === 'AbortError') {
        return; // Ignore abort exceptions from consecutive clicks
      }
      console.error('Playback failed:', err);
      if (currentPlayPromise === playPromise) {
        handleTrackLoadError(err.message || 'Media playback error');
      }
    });
}

async function handleTrackLoadError(reason) {
  console.warn('[Track Load Error]:', reason);
  clearTimeout(trackLoadTimeout);

  // Pause audio and update UI
  audioPlayer.pause();
  setPlayState(false);

  let detailedMessage = "Этот трек недоступен";
  let is404Error = false;

  // If the error was a media error or timeout, fetch the stream URL to read the detailed error JSON
  if (audioPlayer.src) {
    try {
      const response = await fetch(audioPlayer.src, {
        headers: { 'Range': 'bytes=0-0' } // fetch just 1 byte to check status/headers quickly
      });
      if (response.status === 404) {
        is404Error = true;
      }
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        if (errData && errData.message) {
          if (errData.message.includes('not found') || response.status === 404) {
            is404Error = true;
          }
          detailedMessage = `Ошибка загрузки: ${errData.message}`;
        } else {
          detailedMessage = `Ошибка сервера (HTTP ${response.status})`;
        }
      }
    } catch (e) {
      console.error('[Error Resolver] Failed to fetch error details:', e);
      detailedMessage = `Сетевая ошибка: ${reason}`;
    }
  }

  if (is404Error) {
    detailedMessage = "Аудиопоток не найден в базе SoundCloud";
  }

  // Display toast notification
  showToastNotification(detailedMessage);

  // Skip to the next track after a short delay if the track wasn't found in SoundCloud
  if (is404Error) {
    setTimeout(() => {
      // Play next track if player is still paused and current playlist has items
      if (playlist.length > 0 && audioPlayer.paused) {
        playNext();
      }
    }, 1800);
  }
}

function showToastNotification(message) {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      top: 50px;
      right: 24px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      z-index: 100000;
      pointer-events: none;
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `
    <div class="toast-icon" style="font-size: 14px; line-height: 1;">✕</div>
    <div class="toast-message">${message}</div>
  `;
  toast.style.cssText = `
    background: rgba(255, 69, 58, 0.15);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 69, 58, 0.3);
    border-radius: 12px;
    padding: 12px 20px;
    color: #ff453a;
    font-size: 13px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 8px 32px rgba(255, 69, 58, 0.1);
    transform: translateX(120%);
    transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.4s ease;
    opacity: 0;
    pointer-events: auto;
  `;

  toastContainer.appendChild(toast);

  // Force reflow and animate in
  setTimeout(() => {
    toast.style.transform = 'translateX(0)';
    toast.style.opacity = '1';
  }, 10);

  // Auto-remove after 4 seconds
  setTimeout(() => {
    toast.style.transform = 'translateX(120%)';
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 4000);
}

function setPlayState(isPlaying) {
  if (isPlaying) {
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
    if (miniPlayIcon) miniPlayIcon.classList.add('hidden');
    if (miniPauseIcon) miniPauseIcon.classList.remove('hidden');
    if (currentCover) currentCover.classList.add('playing');
    if (miniCurrentCover) miniCurrentCover.classList.add('playing');
  } else {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    if (miniPlayIcon) miniPlayIcon.classList.remove('hidden');
    if (miniPauseIcon) miniPauseIcon.classList.add('hidden');
    if (currentCover) currentCover.classList.remove('playing');
    if (miniCurrentCover) miniCurrentCover.classList.remove('playing');
  }
  updateMediaSessionPlaybackState(isPlaying);
  updateNativeMediaControls(playlist[currentTrackIndex], isPlaying);
  updateCoverPlayButtons();
}

function updateCoverPlayButtons() {
  const isPlaying = !audioPlayer.paused;
  const currentTrack = playlist[currentTrackIndex];

  document.querySelectorAll('.track-card').forEach(card => {
    const trackId = card.dataset.trackId;
    const playBtn = card.querySelector('.cover-play-btn');
    if (!playBtn) return;

    const isCurrent = currentTrack && trackId === currentTrack.id;
    if (isCurrent && isPlaying) {
      playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
    } else {
      playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 2px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    }
  });

  document.querySelectorAll('.track-card-horizontal').forEach(card => {
    const trackId = card.dataset.trackId;
    const playBtn = card.querySelector('.card-play-btn-horizontal');
    if (!playBtn) return;

    const isCurrent = currentTrack && trackId === currentTrack.id;
    if (isCurrent && isPlaying) {
      playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
    } else {
      playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 2px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    }
  });
}

function togglePlay(forcePlay) {
  if (currentTrackIndex === -1 && playlist.length > 0) {
    playTrack(0);
    return;
  }

  const shouldPlay = typeof forcePlay === 'boolean' ? forcePlay : audioPlayer.paused;

  if (shouldPlay) {
    initAudioEffects();
    resumeAudioContext();
    const playPromise = audioPlayer.play();
    currentPlayPromise = playPromise;
    playPromise
      .then(() => {
        if (currentPlayPromise === playPromise) {
          setPlayState(true);
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error('Play failed:', err);
        }
      });
  } else if (!audioPlayer.paused) {
    audioPlayer.pause();
    setPlayState(false);
  }
}

function playNext() {
  if (playlist.length === 0) return;

  let nextIndex;
  if (isShuffle) {
    if (playlist.length === 1) {
      nextIndex = 0;
    } else {
      do {
        nextIndex = Math.floor(Math.random() * playlist.length);
      } while (nextIndex === currentTrackIndex);
    }
  } else {
    nextIndex = currentTrackIndex + 1;
    if (nextIndex >= playlist.length) {
      nextIndex = 0; // Loop back
    }
  }
  playTrack(nextIndex);
}

function playPrev() {
  if (playlist.length === 0) return;

  let prevIndex;
  if (isShuffle) {
    if (playlist.length === 1) {
      prevIndex = 0;
    } else {
      do {
        prevIndex = Math.floor(Math.random() * playlist.length);
      } while (prevIndex === currentTrackIndex);
    }
  } else {
    prevIndex = currentTrackIndex - 1;
    if (prevIndex < 0) {
      prevIndex = playlist.length - 1; // Go to last
    }
  }
  playTrack(prevIndex);
}

// Helper to format time in MM:SS
function formatTime(seconds) {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Helper to convert MM:SS or HH:MM:SS format to seconds
function parseDurationToSeconds(durationStr) {
  if (!durationStr) return 0;
  const parts = durationStr.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return parseFloat(durationStr) || 0;
}

// 4. Listeners
searchButton.addEventListener('click', performSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') performSearch();
});

// Search source states are managed dynamically inside showSearchHistory dropdown

playButton.addEventListener('click', togglePlay);
nextButton.addEventListener('click', playNext);
prevButton.addEventListener('click', playPrev);

if (miniPlayButton) miniPlayButton.addEventListener('click', togglePlay);
if (miniNextButton) miniNextButton.addEventListener('click', playNext);
if (miniPrevButton) miniPrevButton.addEventListener('click', playPrev);

// Audio Player Events
audioPlayer.addEventListener('loadedmetadata', () => {
  clearTimeout(trackLoadTimeout);
  progressSlider.max = 100;
  applyAudioEffectsState();
});

audioPlayer.onerror = () => {
  handleTrackLoadError("Audio element fired onerror event");
};

let lastProgressUpdateTime = 0;
audioPlayer.addEventListener('timeupdate', () => {
  if (isSeeking) return;
  const now = Date.now();
  if (now - lastProgressUpdateTime < 250) return;
  lastProgressUpdateTime = now;

  const current = currentSeekOffset + audioPlayer.currentTime;
  const duration = currentTrackDuration || audioPlayer.duration || 0;

  currentTimeText.textContent = formatTime(current);
  if (duration > 0) {
    totalTimeText.textContent = formatTime(duration);
    progressSlider.max = 100;
    progressSlider.value = (current / duration) * 100;
    if (miniProgressBar) {
      miniProgressBar.style.width = `${(current / duration) * 100}%`;
    }
    if (miniProgressSlider && !miniProgressSlider.matches(':active')) {
      miniProgressSlider.value = (current / duration) * 100;
    }
  } else {
    progressSlider.value = 0;
    if (miniProgressBar) {
      miniProgressBar.style.width = '0%';
    }
    if (miniProgressSlider) {
      miniProgressSlider.value = 0;
    }
  }
});

audioPlayer.addEventListener('ended', () => {
  if (isRepeat) {
    currentSeekOffset = 0;
    const track = playlist[currentTrackIndex];
    audioPlayer.crossOrigin = 'anonymous';
    audioPlayer.src = `${BACKEND_URL}/stream?id=${encodeURIComponent(track.id)}&source=${track.source}&artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}`;
    const playPromise = audioPlayer.play();
    currentPlayPromise = playPromise;
    playPromise
      .then(() => {
        if (currentPlayPromise === playPromise) {
          setPlayState(true);
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error('Repeat playback failed:', err);
        }
      });
  } else {
    playNext();
  }
});

// Seek Slider Actions
function seekToPercent(percent) {
  const duration = currentTrackDuration || audioPlayer.duration || 0;
  const track = playlist[currentTrackIndex];
  if (duration > 0 && track) {
    const seekTime = (parseFloat(percent) / 100) * duration;
    currentSeekOffset = seekTime;

    audioPlayer.crossOrigin = 'anonymous';
    audioPlayer.src = `${BACKEND_URL}/stream?id=${encodeURIComponent(track.id)}&source=${track.source}&seek=${seekTime}&artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}`;
    const playPromise = audioPlayer.play();
    currentPlayPromise = playPromise;
    playPromise
      .then(() => {
        if (currentPlayPromise === playPromise) {
          setPlayState(true);
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error('Playback failed after seek:', err);
        }
      });
  }
}

progressSlider.addEventListener('input', () => {
  isSeeking = true;
  const duration = currentTrackDuration || audioPlayer.duration || 0;
  currentTimeText.textContent = formatTime((parseFloat(progressSlider.value) / 100) * duration);
});

progressSlider.addEventListener('change', () => {
  seekToPercent(progressSlider.value);
  isSeeking = false;
});

if (miniProgressSlider) {
  miniProgressSlider.addEventListener('input', () => {
    isSeeking = true;
    if (miniProgressBar) {
      miniProgressBar.style.width = `${miniProgressSlider.value}%`;
    }
  });

  miniProgressSlider.addEventListener('change', () => {
    seekToPercent(miniProgressSlider.value);
    isSeeking = false;
  });
}

// Volume Slider Actions
volumeSlider.addEventListener('input', () => {
  const vol = volumeSlider.value / 100;
  audioPlayer.volume = vol;
  localStorage.setItem('gp_volume', vol);
});

// Shuffle / Repeat UI Actions
shuffleButton.addEventListener('click', () => {
  isShuffle = !isShuffle;
  shuffleButton.classList.toggle('active', isShuffle);
});

repeatButton.addEventListener('click', () => {
  isRepeat = !isRepeat;
  repeatButton.classList.toggle('active', isRepeat);
});

// Player Like Button Action
playerLikeBtn.addEventListener('click', (e) => {
  const playingTrack = playlist[currentTrackIndex];
  if (playingTrack) {
    toggleLike(e, playingTrack);
  }
});

// Local Storage Manager Helper functions
function getStorageKey(key) {
  return `gp_${key}_${currentProfile || 'Default'}`;
}

// Subscriptions & Recommendations Helpers
function getFollowedArtists() {
  const data = localStorage.getItem('gp_followed_artists');
  return data ? JSON.parse(data) : [];
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
  localStorage.setItem('gp_followed_artists', JSON.stringify(list));
  return !followed;
}

async function loadForYouTracks() {
  const followed = getFollowedArtists();
  let queryParams = '';
  let recommendationSource = '';

  if (followed.length > 0) {
    const randomArtist = followed[Math.floor(Math.random() * followed.length)];
    queryParams = `artistId=${encodeURIComponent(randomArtist.id)}`;
    recommendationSource = `на основе подписки на ${randomArtist.name}`;
  } else {
    const history = getSearchHistory();
    if (history.length > 0) {
      const lastQuery = history[0];
      queryParams = `q=${encodeURIComponent(lastQuery)}`;
      recommendationSource = `на основе поиска «${lastQuery}»`;
    }
  }

  if (!queryParams) {
    return null;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/search/related?${queryParams}`);
    const data = await response.json();
    if (data.status === 'success' && data.results && data.results.length > 0) {
      return {
        source: recommendationSource,
        tracks: data.results
      };
    }
  } catch (err) {
    console.error('[Renderer] Failed to load For You recommendations:', err);
  }
  return null;
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

// User Profiles Manager
function loadProfiles() {
  const savedProfiles = localStorage.getItem('gp_profiles');
  if (savedProfiles) {
    profiles = JSON.parse(savedProfiles);
  } else {
    profiles = ['Default'];
    localStorage.setItem('gp_profiles', JSON.stringify(profiles));
  }

  const savedActive = localStorage.getItem('gp_active_profile');
  if (savedActive && profiles.includes(savedActive)) {
    currentProfile = savedActive;
  } else {
    currentProfile = 'Default';
    localStorage.setItem('gp_active_profile', currentProfile);
  }

  activeProfileName.textContent = currentProfile;
  loadLikedTracks();
}

function renderProfilesDropdown() {
  profilesList.innerHTML = '';
  profiles.forEach(p => {
    const item = document.createElement('button');
    const isActive = p === currentProfile && !currentUser;
    item.className = `profile-dropdown-item ${isActive ? 'active' : ''}`;
    item.innerHTML = `
      <span>${p}</span>
      ${p !== 'Default' ? `<span class="profile-delete-icon" style="opacity: 0.5; font-size: 11px; padding: 4px;">✕</span>` : ''}
    `;

    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('profile-delete-icon')) {
        e.stopPropagation();
        deleteUserProfile(p);
        return;
      }
      switchUserProfile(p);
      profileDropdown.classList.add('hidden');
    });

    profilesList.appendChild(item);
  });

  // Dynamically update the action button in the profile dropdown
  if (currentUser) {
    createProfileBtn.textContent = `Выйти (@${currentUser.username})`;
    createProfileBtn.classList.add('logout-mode');
    createProfileBtn.classList.remove('login-mode');
  } else {
    createProfileBtn.textContent = 'Войти в аккаунт';
    createProfileBtn.classList.add('login-mode');
    createProfileBtn.classList.remove('logout-mode');
  }
}

async function switchUserProfile(profileName) {
  currentProfile = profileName;
  localStorage.setItem('gp_active_profile', currentProfile);
  activeProfileName.textContent = currentProfile;

  // Reload liked ids
  await loadLikedTracks();

  // Update player like button UI if a track is playing
  if (currentTrackIndex !== -1 && playlist[currentTrackIndex]) {
    updateLikeUI(playlist[currentTrackIndex].id);
  } else {
    const playerLikeBtn = document.getElementById('player-like-btn');
    if (playerLikeBtn) {
      playerLikeBtn.classList.remove('liked');
      playerLikeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
    }
  }

  renderProfilesDropdown();

  // Switch view or refresh search results
  if (activeView === 'home') {
    loadHomeView();
  } else if (activeView === 'settings') {
    renderSettings();
  } else if (activeView === 'library') {
    loadFavorites();
  } else if (activeView === 'history') {
    loadHistoryView();
  } else if (activeView === 'playlists' || activeView === 'playlist-tracks') {
    loadPlaylistsView();
  } else {
    renderTracks(playlist);
  }
}

function createUserProfile(name) {
  const cleanedName = name.trim();
  if (!cleanedName) return;

  if (profiles.includes(cleanedName)) {
    alert('Profile already exists.');
    return;
  }

  profiles.push(cleanedName);
  localStorage.setItem('gp_profiles', JSON.stringify(profiles));
  switchUserProfile(cleanedName);
}

function deleteUserProfile(profileName) {
  if (profileName === 'Default') return;
  if (!confirm(`Are you sure you want to delete profile "${profileName}"? All local likes, history, and playlists for this user will be lost.`)) return;

  // Clear keys from localStorage
  localStorage.removeItem(`gp_likes_${profileName}`);
  localStorage.removeItem(`gp_history_${profileName}`);
  localStorage.removeItem(`gp_playlists_${profileName}`);

  profiles = profiles.filter(p => p !== profileName);
  localStorage.setItem('gp_profiles', JSON.stringify(profiles));

  if (currentProfile === profileName) {
    switchUserProfile('Default');
  } else {
    renderProfilesDropdown();
  }
}

// Get Greeting based on local time
function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return 'Good morning';
  } else if (hour >= 12 && hour < 18) {
    return 'Good afternoon';
  } else if (hour >= 18 && hour < 22) {
    return 'Good evening';
  } else {
    return 'Good night';
  }
}

// Escape HTML string helper to prevent XSS
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g,
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Liked tracks services logic (using client-side localStorage and backend synchronization)
async function loadLikedTracks() {
  if (currentUser && currentUser.likedTracks) {
    const localLikes = getLikedTracks();
    const cloudLikes = currentUser.likedTracks;

    // Merge local and cloud likes by track ID
    const mergedLikes = [...cloudLikes];
    for (const localTrack of localLikes) {
      if (!mergedLikes.some(t => t.id === localTrack.id)) {
        mergedLikes.push(localTrack);
      }
    }

    saveLikedTracks(mergedLikes);
    likedTrackIds = new Set(mergedLikes.map(t => t.id));

    // If local likes were added, sync them back to Atlas
    if (mergedLikes.length > cloudLikes.length && token) {
      syncLikesWithBackend(mergedLikes);
    }
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
  const cards = document.querySelectorAll(`.track-card[data-track-id="${trackId}"]`);
  cards.forEach(card => {
    const cardLikeBtn = card.querySelector('.like-btn');
    if (cardLikeBtn) {
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

function loadFavorites() {
  activeView = 'library';
  searchInput.value = '';
  welcomeScreen.classList.add('hidden');
  tracksContainer.classList.add('hidden');
  loadingIndicator.classList.remove('hidden');

  setTimeout(async () => {
    await loadLikedTracks();
    const likes = getLikedTracks();
    loadingIndicator.classList.add('hidden');

    if (likes && likes.length > 0) {
      playlist = likes;
      renderTracks(playlist);
      tracksContainer.classList.remove('hidden');
    } else {
      playlist = [];
      tracksContainer.innerHTML = '<div class="welcome-state"><h2>Your Library is empty</h2><p>Click the heart icon on any track to add it here</p></div>';
      tracksContainer.classList.remove('hidden');
    }
    updateActiveTab('library');
  }, 200);
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

  // Refresh if viewing history
  if (activeView === 'history') {
    renderHistory();
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
    alert('Playlist with this name already exists.');
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
    noPlaylists.className = 'playlist-menu-item';
    noPlaylists.style.cursor = 'default';
    noPlaylists.innerHTML = '<span style="color:rgba(255,255,255,0.4);">No Playlists</span>';
    playlistMenuList.appendChild(noPlaylists);
  }

  const createNewItem = document.createElement('button');
  createNewItem.className = 'playlist-menu-item';
  createNewItem.style.color = '#30d158';
  createNewItem.style.borderTop = '1px solid rgba(255,255,255,0.06)';
  createNewItem.style.marginTop = '4px';
  createNewItem.innerHTML = '<span>+ New Playlist</span>';
  createNewItem.addEventListener('click', () => {
    playlistMenu.classList.add('hidden');
    playlistModal.classList.remove('hidden');
    newPlaylistInput.focus();
  });
  playlistMenuList.appendChild(createNewItem);

  playlistMenu.style.top = `${rect.bottom + window.scrollY + 6}px`;
  playlistMenu.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - 200)}px`;
  playlistMenu.classList.remove('hidden');
}

// UI Click Event Listeners
favoritesButton.addEventListener('click', loadFavorites);
historyButton.addEventListener('click', loadHistoryView);
playlistsButton.addEventListener('click', loadPlaylistsView);

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
homeButton.addEventListener('click', loadHomeView);
favoritesButton.addEventListener('click', loadFavorites);
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
    if (view === 'library') loadFavorites();
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

async function loadHomeView() {
  activeView = 'home';
  searchInput.value = '';
  welcomeScreen.classList.add('hidden');
  tracksContainer.classList.add('hidden');
  loadingIndicator.classList.remove('hidden');

  try {
    const [homeRes, forYouData] = await Promise.all([
      fetch(`${BACKEND_URL}/search/home`).then(r => r.json()),
      loadForYouTracks()
    ]);
    loadingIndicator.classList.add('hidden');

    if (homeRes.status === 'success' && homeRes.results) {
      originalHomeData = homeRes.results;
      cachedForYouData = forYouData;
      renderHome(homeRes.results, forYouData);
      tracksContainer.classList.remove('hidden');
    } else {
      tracksContainer.innerHTML = '<div class="welcome-state"><h2>Не удалось загрузить рекомендации</h2><p>Пожалуйста, проверьте соединение с бэкендом</p></div>';
      tracksContainer.classList.remove('hidden');
    }
    updateActiveTab('home');
  } catch (error) {
    console.error('[Renderer] Failed to load home screen recommendations:', error);
    loadingIndicator.classList.add('hidden');
    tracksContainer.innerHTML = '<div class="welcome-state"><h2>Не удалось подключиться к серверу</h2><p>Проверьте соединение с интернетом</p></div>';
    tracksContainer.classList.remove('hidden');
    updateActiveTab('home');
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
      <p class="welcome-subtitle">Play what you love.</p>
    </div>
    <div class="sources-pill-capsule" style="position: relative;">
      <div class="capsule-active-indicator" style="left: ${activeHomeSource === 'soundcloud' ? '4' : '44'}px;"></div>
      <button class="source-capsule-btn ${activeHomeSource === 'soundcloud' ? 'active' : ''}" data-source="soundcloud" title="SoundCloud">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.95 14.47c0-2.45-1.92-4.44-4.29-4.44h-.35c-.48-2.61-2.73-4.6-5.46-4.6-2.58 0-4.73 1.83-5.32 4.26-.26-.06-.53-.09-.81-.09-2.58 0-4.67 2.09-4.67 4.67 0 .16.01.32.02.48C1.29 14.53 0 16.03 0 17.84c0 2.08 1.68 3.76 3.76 3.76h16.5c1.96 0 3.69-1.55 3.69-3.51 0-1.74-1.28-3.18-2.97-3.52z"/></svg>
      </button>
      <button class="source-capsule-btn ${activeHomeSource === 'spotify' ? 'active' : ''}" data-source="spotify" title="Spotify">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.377-1.454-5.37-1.783-8.894-.978-.335.077-.67-.134-.746-.47-.077-.335.134-.67.47-.746 3.847-.88 7.143-.51 9.814 1.127.294.18.387.563.207.857s-.563.387-.857.207zm1.225-2.72c-.227.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.082-1.182-.413.125-.847-.107-.972-.52-.125-.413.107-.847.52-.972 3.676-1.116 8.243-.57 11.348 1.337.367.227.487.707.26 1.074zm.107-2.834C14.484 8.7 8.012 8.483 4.262 9.622c-.573.173-1.182-.154-1.355-.727-.173-.573.154-1.182.727-1.355 4.3-1.305 11.442-1.055 15.534 1.373.515.305.683.97.378 1.485-.305.515-.97.683-1.485.378z"/></svg>
      </button>
    </div>
  `;
  tracksContainer.appendChild(welcomeHeader);

  // Setup click listeners for capsule buttons
  welcomeHeader.querySelectorAll('.source-capsule-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const source = btn.dataset.source;
      if (activeHomeSource === source) return;

      activeHomeSource = source;

      // Update button active classes immediately for visual response
      welcomeHeader.querySelectorAll('.source-capsule-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.source === activeHomeSource);
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
  const carouselSection = renderCarousel(carouselTracks);
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
        // ── All: clear genre, increment version, re-render defaults ──
        activeGenreChip = null;
        genreRenderVersion++;
        renderHome(originalHomeData, cachedForYouData);
      } else {
        if (activeGenreChip === tag) {
          // ── Toggle off: same chip clicked again → go back to All ──
          activeGenreChip = null;
          genreRenderVersion++;
          renderHome(originalHomeData, cachedForYouData);
        } else {
          // ── New genre selected ──
          activeGenreChip = tag;
          const myVersion = ++genreRenderVersion; // capture version for this request

          renderHome(originalHomeData, cachedForYouData);

          const contentArea = document.getElementById('home-content-area');
          if (contentArea) {
            contentArea.innerHTML = '<div style="display: flex; justify-content: center; padding: 50px;"><div class="spinner"></div></div>';
          }

          try {
            const response = await fetch(`${BACKEND_URL}/search?q=${encodeURIComponent(tag)}`);
            // ⚠️ Stale-guard: if version changed while waiting, discard this response
            if (genreRenderVersion !== myVersion) return;
            const result = await response.json();
            if (genreRenderVersion !== myVersion) return;
            if (result.status === 'success' && result.results) {
              const scTracks = result.results.filter(t => t.source === activeHomeSource);
              renderGenreTracks(scTracks, tag);
            } else {
              const ca = document.getElementById('home-content-area');
              if (ca) ca.innerHTML = '<div style="text-align: center; padding: 30px; color: rgba(255,255,255,0.4);">Не удалось загрузить треки</div>';
            }
          } catch (err) {
            console.error(err);
            if (genreRenderVersion === myVersion) {
              const ca = document.getElementById('home-content-area');
              if (ca) ca.innerHTML = '<div style="text-align: center; padding: 30px; color: rgba(255,255,255,0.4);">Ошибка загрузки</div>';
            }
          }
        }
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
        const response = await fetch(`${BACKEND_URL}/search?q=${encodeURIComponent(tag)}`);
        if (genreRenderVersion !== myVersion) return;
        const result = await response.json();
        if (genreRenderVersion !== myVersion) return;
        if (result.status === 'success' && result.results) {
          const scTracks = result.results.filter(t => t.source === activeHomeSource);
          renderGenreTracks(scTracks, tag);
        } else {
          if (contentArea) {
            contentArea.innerHTML = '<div style="text-align: center; padding: 30px; color: rgba(255,255,255,0.4);">Не удалось загрузить треки</div>';
          }
        }
      } catch (err) {
        console.error(err);
      }
    }, 50);
  } else {
    renderHomeContent(sectionsData, forYouData);
  }
}

function renderHomeContent(sectionsData, forYouData) {
  const contentArea = document.getElementById('home-content-area');
  if (!contentArea) return;
  contentArea.innerHTML = '';

  const filterBySource = (trackList) => {
    if (!trackList) return [];
    return trackList.filter(t => t.source === activeHomeSource);
  };

  // 1. Recommended tracks (top sections data fallback)
  let recommendedTracks = [];
  if (forYouData && forYouData.tracks) {
    recommendedTracks = filterBySource(forYouData.tracks);
  }
  if (recommendedTracks.length === 0 && sectionsData.top) {
    recommendedTracks = filterBySource(sectionsData.top);
  }

  if (recommendedTracks.length > 0) {
    const recSection = document.createElement('div');
    recSection.className = 'home-section scrollable';
    recSection.innerHTML = `
      <div class="home-section-header">
        <h3>Recommended</h3>
        <a href="#" class="see-all-link" id="see-all-recommended">See all <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg></a>
      </div>
      <div class="scroller-container-outer">
        <div class="scroller-container" id="recommended-scroller"></div>
        <button class="scroll-chevron next" id="rec-scroll-chevron">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>
    `;

    contentArea.appendChild(recSection);

    const scroller = recSection.querySelector('#recommended-scroller');
    recommendedTracks.forEach((track, idx) => {
      const card = renderTrackCardHorizontal(track, idx, recommendedTracks);
      scroller.appendChild(card);
    });

    recSection.querySelector('#rec-scroll-chevron').addEventListener('click', () => {
      scroller.scrollBy({ left: 300, behavior: 'smooth' });
    });

    recSection.querySelector('#see-all-recommended').addEventListener('click', (e) => {
      e.preventDefault();
      playlist = recommendedTracks;
      renderTracks(playlist);
    });
  }

  // 2. Trending this week (trending sections data)
  const trendingTracks = filterBySource(sectionsData.trending || []);

  if (trendingTracks.length > 0) {
    const trendSection = document.createElement('div');
    trendSection.className = 'home-section scrollable';
    trendSection.innerHTML = `
      <div class="home-section-header">
        <h3>Trending this week</h3>
        <a href="#" class="see-all-link" id="see-all-trending">See all <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg></a>
      </div>
      <div class="scroller-container-outer">
        <div class="scroller-container" id="trending-scroller"></div>
        <button class="scroll-chevron next" id="trend-scroll-chevron">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>
    `;

    contentArea.appendChild(trendSection);

    const scroller = trendSection.querySelector('#trending-scroller');
    trendingTracks.forEach((track, idx) => {
      const card = renderTrackCardHorizontal(track, idx, trendingTracks);
      scroller.appendChild(card);
    });

    trendSection.querySelector('#trend-scroll-chevron').addEventListener('click', () => {
      scroller.scrollBy({ left: 300, behavior: 'smooth' });
    });

    trendSection.querySelector('#see-all-trending').addEventListener('click', (e) => {
      e.preventDefault();
      playlist = trendingTracks;
      renderTracks(playlist);
    });
  }
}

// Redesigned Track Card Horizontal builder
function renderTrackCardHorizontal(track, index, sectionTracks) {
  const card = document.createElement('div');
  const isActive = activePlayingTrack && track.id === activePlayingTrack.id;
  card.className = `track-card-horizontal ${isActive ? 'active' : ''}`;
  card.dataset.index = index;
  card.dataset.trackId = track.id;

  const trackTitle = track.title ? track.title.trim() : "Unknown Track";
  const trackArtist = track.artist ? track.artist.trim() : "Unknown Artist";
  const defaultSvgCover = 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'><rect width=\'100\' height=\'100\' fill=\'%23222\'/><path d=\'M30 30 L70 50 L30 70 Z\' fill=\'%23444\'/></svg>';
  const coverUrl = track.thumbnail
    ? `${BACKEND_URL}/cover?url=${encodeURIComponent(track.thumbnail)}`
    : defaultSvgCover;
  
  const isLiked = likedTrackIds.has(track.id);

  const playsText = track.source === 'soundcloud' && (track.playbackCount !== undefined || track.playback_count !== undefined)
    ? `▷ ${formatPlaybackCount(track.playbackCount || track.playback_count)}`
    : '';

  const isCurrentPlaying = isActive && !audioPlayer.paused;
  const playButtonIcon = isCurrentPlaying
    ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
    : `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 2px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;

  card.innerHTML = `
    <img src="${coverUrl}" class="card-cover-horizontal" alt="${trackTitle}">
    <div class="card-details-horizontal">
      <div class="card-title-horizontal">${trackTitle}</div>
      <div class="card-artist-horizontal">${trackArtist}</div>
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
      <button class="card-play-btn-horizontal" title="Play">
        ${playButtonIcon}
      </button>
      <button class="card-more-btn-horizontal" title="Add to Playlist">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-more-btn-horizontal') || e.target.closest('.card-play-btn-horizontal')) return;
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
    grid.innerHTML = '<div style="color: rgba(255,255,255,0.4); padding: 20px;">Нет треков в этом жанре</div>';
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

      const plThumbnail = pl.thumbnail
        ? `${BACKEND_URL}/cover?url=${encodeURIComponent(pl.thumbnail)}`
        : 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'><rect width=\'100\' height=\'100\' fill=\'%23222\'/></svg>';

      card.innerHTML = `
        <img src="${plThumbnail}" style="width:100%; height:120px; object-fit:cover; border-radius:8px;">
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
  const data = localStorage.getItem(`gp_search_history_${currentProfile}`);
  return data ? JSON.parse(data) : [];
}

function saveSearchHistory(history) {
  localStorage.setItem(`gp_search_history_${currentProfile}`, JSON.stringify(history));
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

  const statsStr = localStorage.getItem('gp_stats_counts');
  const stats = statsStr ? JSON.parse(statsStr) : {};
  const topTracks = Object.values(stats)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const savedCustom = localStorage.getItem('gp_custom_theme');
  const customTheme = savedCustom ? JSON.parse(savedCustom) : {
    bgColor: '#1e1e24',
    textColor: '#f5f5f7',
    playerBg: '#050505',
    cardBg: '#ffffff',
    accentColor: '#ffffff',
    blur: 28,
    opacity: 0.45
  };

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
  viewHeader.innerHTML = `
    <div class="view-header-title">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
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
      <div class="theme-options">
        <button class="theme-option-btn ${currentTheme === 'theme-dark-glass' ? 'active' : ''}" data-theme="theme-dark-glass">
          <span>Dark Glass</span>
          <div class="theme-preview dark"></div>
        </button>
        <button class="theme-option-btn ${currentTheme === 'theme-pink-white' ? 'active' : ''}" data-theme="theme-pink-white">
          <span>Pink-White Glass</span>
          <div class="theme-preview pink"></div>
        </button>
        <button class="theme-option-btn ${currentTheme === 'theme-silver-matrix' ? 'active' : ''}" data-theme="theme-silver-matrix">
          <span>Silver Matrix</span>
          <div class="theme-preview silver"></div>
        </button>
        <button class="theme-option-btn ${currentTheme === 'custom' ? 'active' : ''}" data-theme="custom">
          <span>Custom</span>
          <div class="theme-preview custom"></div>
        </button>
      </div>
    </div>

    <div class="settings-section ${currentTheme !== 'custom' ? 'disabled-customizer' : ''}" data-section="theme-constructor" id="theme-constructor-section" style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 20px;">
      <h3>Конструктор темы</h3>
      
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 15px;">
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Цвет фона 1:</span>
          <input type="color" id="theme-bg-color1" value="${customTheme.bgColor1 || customTheme.bgColor || '#1e1e24'}" style="width: 100%; height: 36px; border: none; border-radius: 6px; background: transparent; cursor: pointer;">
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Цвет фона 2:</span>
          <input type="color" id="theme-bg-color2" value="${customTheme.bgColor2 || customTheme.bgColor || '#0a0a0c'}" style="width: 100%; height: 36px; border: none; border-radius: 6px; background: transparent; cursor: pointer;">
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px; grid-column: span 2;">
          <div style="display: flex; justify-content: space-between; font-size: 12px;">
            <span style="color: rgba(255,255,255,0.5);">Угол градиента:</span>
            <span id="angle-val-text" style="color: #fff;">${customTheme.bgAngle !== undefined ? customTheme.bgAngle : 135}°</span>
          </div>
          <input type="range" id="theme-bg-angle" min="0" max="360" value="${customTheme.bgAngle !== undefined ? customTheme.bgAngle : 135}" style="width: 100%; accent-color: #30d158; cursor: pointer;">
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Цвет текста:</span>
          <input type="color" id="theme-text-color" value="${customTheme.textColor}" style="width: 100%; height: 36px; border: none; border-radius: 6px; background: transparent; cursor: pointer;">
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Нижняя панель:</span>
          <input type="color" id="theme-player-color" value="${customTheme.playerBg || '#050505'}" style="width: 100%; height: 36px; border: none; border-radius: 6px; background: transparent; cursor: pointer;">
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Фон карточек:</span>
          <input type="color" id="theme-card-color" value="${customTheme.cardBg || '#ffffff'}" style="width: 100%; height: 36px; border: none; border-radius: 6px; background: transparent; cursor: pointer;">
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Акцентный цвет:</span>
          <input type="color" id="theme-accent-color" value="${customTheme.accentColor || '#ffffff'}" style="width: 100%; height: 36px; border: none; border-radius: 6px; background: transparent; cursor: pointer;">
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 15px;">
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; justify-content: space-between; font-size: 12px;">
            <span style="color: rgba(255,255,255,0.5);">Размытие стекла (blur):</span>
            <span id="blur-val-text" style="color: #fff;">${customTheme.blur}px</span>
          </div>
          <input type="range" id="theme-blur-slider" min="0" max="80" value="${customTheme.blur}" style="width: 100%; accent-color: #30d158; cursor: pointer;">
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; justify-content: space-between; font-size: 12px;">
            <span style="color: rgba(255,255,255,0.5);">Интенсивность свечения (glow):</span>
            <span id="glow-val-text" style="color: #fff;">${customTheme.glow !== undefined ? Math.round(customTheme.glow * 100) : 5}%</span>
          </div>
          <input type="range" id="theme-glow-slider" min="0" max="100" value="${customTheme.glow !== undefined ? Math.round(customTheme.glow * 100) : 5}" style="width: 100%; accent-color: #30d158; cursor: pointer;">
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; justify-content: space-between; font-size: 12px;">
            <span style="color: rgba(255,255,255,0.5);">Прозрачность панелей:</span>
            <span id="opacity-val-text" style="color: #fff;">${Math.round(customTheme.opacity * 100)}%</span>
          </div>
          <input type="range" id="theme-opacity-slider" min="0" max="100" value="${Math.round(customTheme.opacity * 100)}" style="width: 100%; accent-color: #30d158; cursor: pointer;">
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; justify-content: space-between; font-size: 12px;">
            <span style="color: rgba(255,255,255,0.5);">Скругление углов (radius):</span>
            <span id="radius-val-text" style="color: #fff;">${customTheme.windowRadius !== undefined ? customTheme.windowRadius : 12}px</span>
          </div>
          <input type="range" id="theme-radius-slider" min="0" max="30" value="${customTheme.windowRadius !== undefined ? customTheme.windowRadius : 12}" style="width: 100%; accent-color: #30d158; cursor: pointer;">
        </div>
      </div>

      <div style="display: flex; gap: 10px; margin-top: 15px;">
        <button id="theme-export-btn" class="view-btn" style="flex: 1; justify-content: center;">
          <span>Скопировать код темы</span>
        </button>
      </div>

      <div class="saved-theme-tools">
        <input type="text" id="theme-save-name-input" class="theme-save-name-input" placeholder="Theme name">
        <button id="theme-save-btn" class="view-btn">
          <span>Save Theme</span>
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
      <h3>Фоновое изображение</h3>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; gap: 10px; align-items: center;">
          <button id="bg-image-upload-btn" class="view-btn" style="flex: 1; justify-content: center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            <span style="margin-left: 6px;">Выбрать фото</span>
          </button>
          <button id="bg-image-clear-btn" class="view-btn danger ${localStorage.getItem('gp_bg_image') ? '' : 'hidden'}" style="justify-content: center;">
            <span>Сбросить</span>
          </button>
          <input type="file" id="bg-image-file-input" accept="image/*" style="display: none;">
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; justify-content: space-between; font-size: 12px;">
            <span style="color: rgba(255,255,255,0.5);">Прозрачность фона:</span>
            <span id="bg-opacity-val-text" style="color: #fff;">${localStorage.getItem('gp_bg_image_opacity') || 0}%</span>
          </div>
          <input type="range" id="bg-opacity-slider" min="0" max="100" value="${localStorage.getItem('gp_bg_image_opacity') || 0}" style="width: 100%; accent-color: #30d158; cursor: pointer;">
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
    const trackCover = track.thumbnail
      ? `${BACKEND_URL}/cover?url=${encodeURIComponent(track.thumbnail)}`
      : 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'50\' height=\'50\' viewBox=\'0 0 100 100\'><rect width=\'100\' height=\'100\' fill=\'%23222\'/></svg>';
    return `
            <div style="display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.03); padding: 6px 10px; border-radius: 6px;">
              <div style="font-weight: bold; color: #30d158; width: 15px;">${i + 1}</div>
              <img src="${trackCover}" style="width: 32px; height: 32px; border-radius: 4px; object-fit: cover;">
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
      <h3>Информация о пользователе</h3>
      <div class="settings-info-row">
        <span class="settings-info-label">Активный профиль:</span>
        <span class="settings-info-value" id="settings-profile-val">${currentProfile}</span>
      </div>
      <div class="settings-info-row">
        <span class="settings-info-label">Платформа:</span>
        <span class="settings-info-value">Electron Client</span>
      </div>
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
      btns.forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');

      const constructorSec = panel.querySelector('#theme-constructor-section');
      const bgImageSec = panel.querySelector('#background-image-section');
      if (selectedTheme === 'custom') {
        constructorSec?.classList.remove('disabled-customizer');
        bgImageSec?.classList.remove('disabled-customizer');
      } else {
        constructorSec?.classList.add('disabled-customizer');
        bgImageSec?.classList.add('disabled-customizer');
      }
    });
  });

  // Custom Theme Constructor bindings
  const themeBgColor1Input = panel.querySelector('#theme-bg-color1');
  const themeBgColor2Input = panel.querySelector('#theme-bg-color2');
  const themeBgAngleSlider = panel.querySelector('#theme-bg-angle');
  const themeTextInput = panel.querySelector('#theme-text-color');
  const themePlayerInput = panel.querySelector('#theme-player-color');
  const themeCardInput = panel.querySelector('#theme-card-color');
  const themeAccentInput = panel.querySelector('#theme-accent-color');
  const themeBlurSlider = panel.querySelector('#theme-blur-slider');
  const themeGlowSlider = panel.querySelector('#theme-glow-slider');
  const themeOpacitySlider = panel.querySelector('#theme-opacity-slider');
  const themeRadiusSlider = panel.querySelector('#theme-radius-slider');

  function updateCustomThemeFromUI() {
    const customThemeVal = {
      bgColor1: themeBgColor1Input.value,
      bgColor2: themeBgColor2Input.value,
      bgAngle: parseInt(themeBgAngleSlider.value, 10),
      textColor: themeTextInput.value,
      playerBg: themePlayerInput.value,
      cardBg: themeCardInput.value,
      accentColor: themeAccentInput.value,
      blur: parseInt(themeBlurSlider.value, 10),
      glow: parseFloat(themeGlowSlider.value) / 100,
      opacity: parseFloat(themeOpacitySlider.value) / 100,
      windowRadius: themeRadiusSlider ? parseInt(themeRadiusSlider.value, 10) : 12
    };

    panel.querySelector('#angle-val-text').textContent = `${customThemeVal.bgAngle}°`;
    panel.querySelector('#blur-val-text').textContent = `${customThemeVal.blur}px`;
    panel.querySelector('#glow-val-text').textContent = `${Math.round(customThemeVal.glow * 100)}%`;
    panel.querySelector('#opacity-val-text').textContent = `${Math.round(customThemeVal.opacity * 100)}%`;
    if (themeRadiusSlider) {
      panel.querySelector('#radius-val-text').textContent = `${customThemeVal.windowRadius}px`;
    }

    applyCustomTheme(customThemeVal);
    localStorage.setItem('gp_custom_theme', JSON.stringify(customThemeVal));
    localStorage.setItem('gp_theme', 'custom');

    btns.forEach(b => {
      if (b.dataset.theme === 'custom') {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
  }

  const hasThemeConstructor = [
    themeBgColor1Input,
    themeBgColor2Input,
    themeBgAngleSlider,
    themeTextInput,
    themePlayerInput,
    themeCardInput,
    themeAccentInput,
    themeBlurSlider,
    themeGlowSlider,
    themeOpacitySlider
  ].every(Boolean);

  if (hasThemeConstructor) {
    themeBgColor1Input.addEventListener('input', updateCustomThemeFromUI);
    themeBgColor2Input.addEventListener('input', updateCustomThemeFromUI);
    themeBgAngleSlider.addEventListener('input', updateCustomThemeFromUI);
    themeTextInput.addEventListener('input', updateCustomThemeFromUI);
    themePlayerInput.addEventListener('input', updateCustomThemeFromUI);
    themeCardInput.addEventListener('input', updateCustomThemeFromUI);
    themeAccentInput.addEventListener('input', updateCustomThemeFromUI);
    themeBlurSlider.addEventListener('input', updateCustomThemeFromUI);
    themeGlowSlider.addEventListener('input', updateCustomThemeFromUI);
    themeOpacitySlider.addEventListener('input', updateCustomThemeFromUI);
    if (themeRadiusSlider) {
      themeRadiusSlider.addEventListener('input', updateCustomThemeFromUI);
    }
  }

  // Background Image bindings
  const bgImageUploadBtn = panel.querySelector('#bg-image-upload-btn');
  const bgImageClearBtn = panel.querySelector('#bg-image-clear-btn');
  const bgImageFileInput = panel.querySelector('#bg-image-file-input');
  const bgOpacitySlider = panel.querySelector('#bg-opacity-slider');
  const bgOpacityValText = panel.querySelector('#bg-opacity-val-text');

  if (bgImageUploadBtn && bgImageFileInput) {
    bgImageUploadBtn.addEventListener('click', () => bgImageFileInput.click());
    
    bgImageFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = async function(evt) {
        const base64Str = evt.target.result;
        let bgRef = base64Str;
        try {
          if (isElectron && window.electronAPI?.saveThemeBackground) {
            const saved = await window.electronAPI.saveThemeBackground({
              sourcePath: file.path,
              dataUrl: base64Str,
              name: file.name
            });
            bgRef = saved.bgUrl || saved.bgPath || base64Str;
          }
        } catch (err) {
          console.warn('[Theme Background] Falling back to inline image:', err.message);
        }
        localStorage.setItem('gp_bg_image', bgRef);
        applyBackgroundImage(bgRef);
        bgImageClearBtn.classList.remove('hidden');
        showToastNotification('Фоновое изображение установлено!');
      };
      reader.readAsDataURL(file);
    });
  }

  if (bgImageClearBtn) {
    bgImageClearBtn.addEventListener('click', () => {
      localStorage.removeItem('gp_bg_image');
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
  if (themeExportBtn && hasThemeConstructor) {
    themeExportBtn.addEventListener('click', () => {
    const customThemeVal = {
      bgColor1: themeBgColor1Input.value,
      bgColor2: themeBgColor2Input.value,
      bgAngle: parseInt(themeBgAngleSlider.value, 10),
      textColor: themeTextInput.value,
      playerBg: themePlayerInput.value,
      cardBg: themeCardInput.value,
      accentColor: themeAccentInput.value,
      blur: parseInt(themeBlurSlider.value, 10),
      glow: parseFloat(themeGlowSlider.value) / 100,
      opacity: parseFloat(themeOpacitySlider.value) / 100
    };
    try {
      const code = btoa(JSON.stringify(customThemeVal));
      navigator.clipboard.writeText(code);
      alert('Код темы скопирован в буфер обмена!');
    } catch (err) {
      console.error(err);
      alert('Не удалось экспортировать тему');
    }
  });
  }

  const themeImportBtn = panel.querySelector('#theme-import-btn');
  if (themeImportBtn) {
    themeImportBtn.addEventListener('click', () => {
    const input = panel.querySelector('#theme-import-input');
    const code = input.value.trim();
    if (!code) return;
    try {
      const decoded = JSON.parse(atob(code));
      if (decoded.textColor && decoded.blur !== undefined && decoded.opacity !== undefined) {
        // Backwards compatibility for single bgColor
        if (decoded.bgColor && !decoded.bgColor1) {
          decoded.bgColor1 = decoded.bgColor;
          decoded.bgColor2 = decoded.bgColor;
          decoded.bgAngle = 135;
        }
        if (!decoded.bgColor1) decoded.bgColor1 = '#1e1e24';
        if (!decoded.bgColor2) decoded.bgColor2 = '#0a0a0c';
        if (decoded.bgAngle === undefined) decoded.bgAngle = 135;
        if (!decoded.playerBg) decoded.playerBg = '#050505';
        if (!decoded.cardBg) decoded.cardBg = '#ffffff';
        if (!decoded.accentColor) decoded.accentColor = decoded.textColor || '#ffffff';
        if (decoded.glow === undefined) decoded.glow = 0.05;

        applyCustomTheme(decoded);
        localStorage.setItem('gp_custom_theme', JSON.stringify(decoded));
        localStorage.setItem('gp_theme', 'custom');
        input.value = '';
        alert('Тема успешно импортирована!');
        renderSettings({ scope, studioTab });
      } else {
        alert('Некорректный код темы');
      }
    } catch (err) {
      console.error(err);
      alert('Не удалось расшифровать код темы');
    }
  });
  }

  const getCurrentThemeColors = () => ({
    bgColor1: themeBgColor1Input?.value || customTheme.bgColor1 || customTheme.bgColor || '#1e1e24',
    bgColor2: themeBgColor2Input?.value || customTheme.bgColor2 || customTheme.bgColor || '#0a0a0c',
    bgAngle: parseInt(themeBgAngleSlider?.value || customTheme.bgAngle || 135, 10),
    textColor: themeTextInput?.value || customTheme.textColor || '#f5f5f7',
    playerBg: themePlayerInput?.value || customTheme.playerBg || '#050505',
    cardBg: themeCardInput?.value || customTheme.cardBg || '#ffffff',
    accentColor: themeAccentInput?.value || customTheme.accentColor || '#ffffff',
    blur: parseInt(themeBlurSlider?.value || customTheme.blur || 28, 10),
    glow: parseFloat(themeGlowSlider?.value || ((customTheme.glow || 0.05) * 100)) / 100,
    opacity: parseFloat(themeOpacitySlider?.value || ((customTheme.opacity || 0.45) * 100)) / 100
  });

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
        applyCustomTheme(selected.colors);
        localStorage.setItem('gp_custom_theme', JSON.stringify(selected.colors));
        localStorage.setItem('gp_theme', 'custom');
        if (selected.bgUrl || selected.bgPath) {
          const bgRef = selected.bgUrl || selected.bgPath;
          localStorage.setItem('gp_bg_image', bgRef);
          applyBackgroundImage(bgRef);
        } else {
          localStorage.removeItem('gp_bg_image');
          applyBackgroundImage(null);
        }
        showToastNotification('Theme applied');
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
  if (themeSaveBtn && themeSaveNameInput && hasThemeConstructor) {
    themeSaveBtn.addEventListener('click', () => {
      const name = themeSaveNameInput.value.trim();
      if (!name) {
        showToastNotification('Enter theme name');
        return;
      }

      const id = `theme_${Date.now()}`;
      const bgRef = localStorage.getItem('gp_bg_image') || '';
      const themes = getSavedThemes();
      themes.unshift({
        id,
        name,
        bgPath: bgRef,
        bgUrl: bgRef,
        colors: getCurrentThemeColors()
      });
      setSavedThemes(themes);
      themeSaveNameInput.value = '';
      renderSavedThemesList();
      showToastNotification('Theme saved');
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

  tracksContainer.classList.remove('hidden');
  updateActiveTab(scope);
}

function applyTheme(themeName) {
  document.body.classList.remove('theme-dark-glass', 'theme-pink-white', 'theme-silver-matrix');
  if (themeName === 'custom') {
    const savedCustom = localStorage.getItem('gp_custom_theme');
    if (savedCustom) {
      applyCustomTheme(JSON.parse(savedCustom));
    } else {
      const defaultCustomTheme = {
        bgColor: '#1e1e24',
        textColor: '#f5f5f7',
        blur: 28,
        opacity: 0.45
      };
      applyCustomTheme(defaultCustomTheme);
    }
  } else {
    clearCustomThemeProperties();
    document.body.classList.add(themeName);
  }
  localStorage.setItem('gp_theme', themeName);
}

function hexToRgba(hex, alpha) {
  let c;
  if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
    c = hex.substring(1).split('');
    if (c.length === 3) {
      c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    c = '0x' + c.join('');
    return `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${alpha})`;
  }
  return `rgba(255, 255, 255, ${alpha})`;
}

function isColorDark(hex) {
  let c;
  if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
    c = hex.substring(1).split('');
    if (c.length === 3) {
      c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    c = '0x' + c.join('');
    const r = (c >> 16) & 255;
    const g = (c >> 8) & 255;
    const b = c & 255;
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq < 128;
  }
  return true;
}

function applyBackgroundImage(base64Str) {
  const root = document.documentElement;
  if (base64Str) {
    root.style.setProperty('--bg-image', `url("${base64Str}")`);
  } else {
    root.style.removeProperty('--bg-image');
  }
}

function applyCustomTheme(theme) {
  const root = document.documentElement;
  root.style.setProperty('--text-color', theme.textColor);
  root.style.setProperty('--blur-value', `blur(${theme.blur}px)`);

  const textDim = hexToRgba(theme.textColor, 0.55);
  root.style.setProperty('--text-dim', textDim);

  if (theme.bgColor1 && theme.bgColor2) {
    const angle = theme.bgAngle !== undefined ? theme.bgAngle : 135;
    root.style.setProperty('--bg-gradient', `linear-gradient(${angle}deg, ${theme.bgColor1} 0%, ${theme.bgColor2} 100%)`);
  } else {
    root.style.setProperty('--bg-gradient', theme.bgColor || '#1e1e24');
  }

  // Resolve theme custom colors
  const playerBgHex = theme.playerBg || '#050505';
  const cardBgHex = theme.cardBg || '#ffffff';
  const accentColorHex = theme.accentColor || theme.textColor || '#ffffff';

  root.style.setProperty('--player-bg', hexToRgba(playerBgHex, theme.opacity));
  root.style.setProperty('--player-border', hexToRgba(playerBgHex, theme.opacity * 0.15));
  root.style.setProperty('--card-bg', hexToRgba(cardBgHex, theme.opacity * 0.15));
  root.style.setProperty('--card-border', hexToRgba(cardBgHex, theme.opacity * 0.2));
  root.style.setProperty('--card-hover-bg', hexToRgba(cardBgHex, theme.opacity * 0.3));
  root.style.setProperty('--card-hover-border', hexToRgba(cardBgHex, theme.opacity * 0.5));

  const isDarkBg = isColorDark(theme.bgColor1 || theme.bgColor || '#1e1e24');
  if (isDarkBg) {
    root.style.setProperty('--panel-bg', `rgba(0, 0, 0, ${theme.opacity * 0.4})`);
  } else {
    root.style.setProperty('--panel-bg', `rgba(255, 255, 255, ${theme.opacity * 0.4})`);
  }
  root.style.setProperty('--accent-color', accentColorHex);

  const glowAlpha = theme.glow !== undefined ? theme.glow : 0.05;
  root.style.setProperty('--glass-glow', `inset 0 1px 0 0 rgba(255, 255, 255, ${glowAlpha})`);

  // Redesign dynamic variables exposure
  root.style.setProperty('--bgColor1', theme.bgColor1 || theme.bgColor || '#1e1e24');
  root.style.setProperty('--glow', theme.glow !== undefined ? theme.glow : 0.05);
  root.style.setProperty('--blur', `${theme.blur !== undefined ? theme.blur : 28}px`);
  
  const radius = theme.windowRadius !== undefined ? theme.windowRadius : 12;
  root.style.setProperty('--window-radius', `${radius}px`);
}

function clearCustomThemeProperties() {
  const root = document.documentElement;
  root.style.removeProperty('--bg-gradient');
  root.style.removeProperty('--blur-value');
  root.style.removeProperty('--text-color');
  root.style.removeProperty('--text-dim');
  root.style.removeProperty('--card-bg');
  root.style.removeProperty('--card-border');
  root.style.removeProperty('--card-hover-bg');
  root.style.removeProperty('--card-hover-border');
  root.style.removeProperty('--player-bg');
  root.style.removeProperty('--player-border');
  root.style.removeProperty('--panel-bg');
  root.style.removeProperty('--accent-color');
  root.style.removeProperty('--glass-glow');

  // Clear custom redesign variables
  root.style.removeProperty('--bgColor1');
  root.style.removeProperty('--glow');
  root.style.removeProperty('--blur');
  root.style.removeProperty('--window-radius');
}

// Startup Initialization
loadProfiles();
initAuth();
initEditProfileEventListeners();
loadHomeView();

// Apply Saved Theme on Startup
const savedTheme = localStorage.getItem('gp_theme') || 'theme-dark-glass';
applyTheme(savedTheme);

// Apply Saved Background Image & Opacity on Startup
const savedBgImage = localStorage.getItem('gp_bg_image');
if (savedBgImage) {
  applyBackgroundImage(savedBgImage);
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

if (isElectron && window.electronAPI && window.electronAPI.onUpdateStatus) {
  window.electronAPI.onUpdateStatus((status, version) => {
    console.log(`[Auto-Updater] Status changed: ${status}, Version: ${version}`);
    if (status === 'checking') {
      // Checked in console
    } else if (status === 'available') {
      updateBannerText.textContent = `Доступна новая версия: ${version}!`;
      updateDownloadBtn.classList.remove('hidden');
      updateInstallBtn.classList.add('hidden');
      bannerLoader.classList.add('hidden');
      updateProgressBar.style.width = '0%';
      updateBanner.classList.remove('hidden');
    } else if (status === 'error') {
      console.error('[Auto-Updater] Error searching for updates');
    }
  });

  window.electronAPI.onUpdateProgress((percent) => {
    updateBannerText.textContent = `Загрузка обновления... ${Math.round(percent)}%`;
    updateProgressBar.style.width = `${percent}%`;
  });

  window.electronAPI.onUpdateReady(() => {
    updateBannerText.textContent = 'Обновление загружено и готово к установке!';
    updateDownloadBtn.classList.add('hidden');
    updateInstallBtn.classList.remove('hidden');
    bannerLoader.classList.add('hidden');
    updateProgressBar.style.width = '100%';
  });

  updateDownloadBtn.addEventListener('click', () => {
    updateDownloadBtn.classList.add('hidden');
    bannerLoader.classList.remove('hidden');
    updateBannerText.textContent = 'Начало загрузки обновления...';
    window.electronAPI.downloadUpdate();
  });

  updateInstallBtn.addEventListener('click', () => {
    window.electronAPI.installUpdate();
  });

  updateCloseBtn.addEventListener('click', () => {
    updateBanner.classList.add('hidden');
  });
}

// === RELEASE 1.1.0 GLOBAL UPDATES ===

// --- Discord RPC Client ---
let rpcInterval = null;

function sendDiscordPresence() {
  if (!isElectron || !window.electronAPI || !window.electronAPI.updatePresence) return;

  if (currentTrackIndex === -1) {
    window.electronAPI.updatePresence({
      title: 'Not Playing',
      artist: 'Выберите трек для воспроизведения',
      isPaused: true
    });
    return;
  }

  const track = playlist[currentTrackIndex];
  const isPaused = audioPlayer.paused;
  const position = audioPlayer.currentTime;
  const duration = currentTrackDuration || audioPlayer.duration || 0;

  window.electronAPI.updatePresence({
    title: track.title,
    artist: track.artist,
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

audioPlayer.addEventListener('play', () => {
  sendDiscordPresence();
  startPresenceInterval();
  broadcastPlayerStatus();
  startVisualizer();
});

audioPlayer.addEventListener('pause', () => {
  playCountSession.continuousSeconds = 0;
  if (rpcInterval) {
    clearInterval(rpcInterval);
    rpcInterval = null;
  }
  sendDiscordPresence();
  broadcastPlayerStatus();
  stopVisualizer();
});

// --- Mini-Player Window Mode listener ---
if (isElectron && window.electronAPI && window.electronAPI.onMiniPlayerToggled) {
  window.electronAPI.onMiniPlayerToggled((active) => {
    if (active) {
      document.body.classList.add('mini-player-active');
    } else {
      document.body.classList.remove('mini-player-active');
    }
    resizeCanvas();
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

// --- Dynamic Cover Vibrant Glass Color Extractor ---
function extractDominantColor(imgElement) {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 30;
    canvas.height = 30;

    ctx.drawImage(imgElement, 0, 0, 30, 30);
    const imgData = ctx.getImageData(0, 0, 30, 30).data;

    let colorCounts = {};
    let maxCount = 0;
    let dominantColor = '#ffffff';
    let highestSaturation = 0;

    for (let i = 0; i < imgData.length; i += 4) {
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];
      const a = imgData[i + 3];

      if (a < 200) continue;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;

      const s = max === 0 ? 0 : delta / max;
      const l = (max + min) / 2 / 255;

      if (s > 0.25 && l > 0.25 && l < 0.75) {
        const qr = Math.round(r / 16) * 16;
        const qg = Math.round(g / 16) * 16;
        const qb = Math.round(b / 16) * 16;
        const key = `${qr},${qg},${qb}`;

        colorCounts[key] = (colorCounts[key] || 0) + 1;

        if (colorCounts[key] > maxCount) {
          maxCount = colorCounts[key];
          dominantColor = `rgb(${qr}, ${qg}, ${qb})`;
        }
      }
    }

    if (maxCount === 0) {
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let i = 0; i < imgData.length; i += 4) {
        sumR += imgData[i];
        sumG += imgData[i + 1];
        sumB += imgData[i + 2];
        count++;
      }
      if (count > 0) {
        return `rgb(${Math.round(sumR / count)}, ${Math.round(sumG / count)}, ${Math.round(sumB / count)})`;
      }
      return '#ffffff';
    }

    return dominantColor;
  } catch (err) {
    console.error('Error extracting cover color:', err);
    return '#ffffff';
  }
}

function applyDynamicCoverColor() {
  if (currentCover.src && !currentCover.src.startsWith('data:image/svg')) {
    if (currentCover.complete) {
      const color = extractDominantColor(currentCover);
      document.documentElement.style.setProperty('--accent-color', color);
    } else {
      currentCover.onload = function () {
        const color = extractDominantColor(currentCover);
        document.documentElement.style.setProperty('--accent-color', color);
        currentCover.onload = null;
      };
    }
  }
}

function resetAccentColor() {
  const currentTheme = localStorage.getItem('gp_theme') || 'theme-dark-glass';
  applyTheme(currentTheme);
}

currentCover.addEventListener('load', () => {
  if (localStorage.getItem('gp_dynamic_cover') === 'true') {
    applyDynamicCoverColor();
  }
});

// --- Audio Visualizer Loop (Liquid Wave inside Player Bar) ---
let visualizerAnimationId = null;
const visualizerCanvas = document.getElementById('player-visualizer');
let smoothBass = 0;
let currentAmp = 0;

function resizeCanvas() {
  if (!visualizerCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = visualizerCanvas.getBoundingClientRect();
  visualizerCanvas.width = rect.width * dpr;
  visualizerCanvas.height = rect.height * dpr;
}

window.addEventListener('resize', resizeCanvas);

function startVisualizer() {
  if (!visualizerCanvas) return;
  if (visualizerAnimationId) return;

  if (localStorage.getItem('gp_visualizer') !== 'true') return;
  if (audioPlayer.paused) return;

  resizeCanvas();

  const ctx = visualizerCanvas.getContext('2d');
  let time = 0;

  function draw() {
    if (localStorage.getItem('gp_visualizer') !== 'true' || audioPlayer.paused) {
      stopVisualizer();
      return;
    }

    visualizerAnimationId = requestAnimationFrame(draw);

    const width = visualizerCanvas.width;
    const height = visualizerCanvas.height;
    ctx.clearRect(0, 0, width, height);

    // Compute sub-bass/bass value from 20Hz-120Hz bins
    let bassSum = 0;
    let bassBins = 0;
    
    if (analyser) {
      analyser.getByteFrequencyData(dataArray);
      const nyquist = audioCtx ? audioCtx.sampleRate / 2 : 24000;
      const binHz = nyquist / bufferLength;
      const startBin = Math.max(0, Math.floor(20 / binHz));
      const endBin = Math.min(bufferLength - 1, Math.ceil(120 / binHz));
      for (let i = startBin; i <= endBin; i++) {
        bassSum += dataArray[i];
        bassBins += 1;
      }
    }
    
    const avgBass = bassBins > 0 ? bassSum / bassBins : 0;
    const bassNormalized = avgBass / 255;
    smoothBass = smoothBass * 0.85 + bassNormalized * 0.15;
    const bassKick = bassNormalized > 0.62;
    const playerBar = document.querySelector('.player-bar');
    if (playerBar) {
      playerBar.classList.toggle('bass-pulse', bassKick);
    }

    // Determine target amplitude
    let targetAmp = 0;
    if (analyser) {
      const bassMultiplier = bassKick ? 1.65 : 1 + smoothBass * 0.45;
      targetAmp = (3 + smoothBass * height * 0.5) * bassMultiplier;
    }
    currentAmp = currentAmp * 0.9 + targetAmp * 0.1;

    time += 0.04;

    const styles = getComputedStyle(document.documentElement);
    const accentColor = styles.getPropertyValue('--accent-color').trim() || '#1db954';
    
    // Wave 1: Underlay wave (slightly out of phase, less opaque, slower)
    if (currentAmp > 0.1) {
      const grad1 = ctx.createLinearGradient(0, 0, 0, height);
      grad1.addColorStop(0, accentColor);
      grad1.addColorStop(1, 'transparent');
      drawSingleWave(ctx, time * 0.8, currentAmp * 0.7, 1.5, width, height, grad1, accentColor, 0.15, 0.15);
    }

    // Wave 2: Foreground wave (main bass reactive wave)
    const grad2 = ctx.createLinearGradient(0, 0, 0, height);
    grad2.addColorStop(0, accentColor);
    grad2.addColorStop(1, 'transparent');
    drawSingleWave(ctx, time, currentAmp, 0, width, height, grad2, accentColor, 0.3, 0.6);
  }

  visualizerAnimationId = requestAnimationFrame(draw);
}

function drawSingleWave(ctx, time, amp, phaseOffset, width, height, fillGradient, strokeColor, fillOpacity, strokeOpacity) {
  const points = [];
  const N = 8;
  const segmentWidth = width / N;

  for (let i = 0; i <= N; i++) {
    const x = i * segmentWidth;
    const waveFreq = 0.5;
    const wavePhase = i * 0.45 + phaseOffset;
    const y = amp * Math.sin(time * waveFreq + wavePhase);
    points.push({ x, y: Math.max(1, y + amp + 1) });
  }

  // Draw fill
  ctx.beginPath();
  ctx.moveTo(0, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i+1].x) / 2;
    const yc = (points[i].y + points[i+1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
  }
  ctx.lineTo(width, points[points.length - 1].y);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();

  ctx.globalAlpha = fillOpacity;
  ctx.fillStyle = fillGradient;
  ctx.fill();

  // Draw stroke
  ctx.beginPath();
  ctx.moveTo(0, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i+1].x) / 2;
    const yc = (points[i].y + points[i+1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
  }
  ctx.lineTo(width, points[points.length - 1].y);

  ctx.shadowBlur = amp > 2 ? 8 : 0;
  ctx.shadowColor = strokeColor;
  ctx.globalAlpha = strokeOpacity;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Reset values
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1.0;
}

function stopVisualizer() {
  if (visualizerAnimationId) {
    cancelAnimationFrame(visualizerAnimationId);
    visualizerAnimationId = null;
  }
  if (visualizerCanvas) {
    const ctx = visualizerCanvas.getContext('2d');
    ctx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
  }
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

// ==========================================================================
// RELEASE 1.3.0: Core Social Update Logic (Auth API, Canvas Comp., Friends Profile)
// ==========================================================================

// Auth Initialization
async function initAuth() {
  token = localStorage.getItem('auth_token');
  currentUser = localStorage.getItem('auth_user') ? JSON.parse(localStorage.getItem('auth_user')) : null;

  if (token) {
    try {
      const res = await fetch(`${BACKEND_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 200) {
        const data = await res.json();
        if (data.status === 'success') {
          currentUser = data.user;
          localStorage.setItem('auth_user', JSON.stringify(currentUser));
          updateHeaderProfileUI();
          await loadLikedTracks();
          if (currentUser.playlists) {
            mergeAndSyncPlaylists(currentUser.playlists);
          }
          connectWS();
        } else {
          handleLogout();
        }
      } else if (res.status === 401 || res.status === 403) {
        // Token is invalid or expired, log out
        handleLogout();
      } else {
        // Temporary server or database error (e.g. 500), keep offline session active
        console.warn('[Auth Auto-login] Server returned error status, keeping offline session:', res.status);
        updateHeaderProfileUI();
        loadLikedTracks();
      }
    } catch (err) {
      console.warn('[Auth Auto-login Error] Backend offline, using offline auth state:', err);
      updateHeaderProfileUI();
      loadLikedTracks();
    }
  } else {
    updateHeaderProfileUI();
    loadLikedTracks();
  }
}

// Update Active Account Display in Header
function updateHeaderProfileUI() {
  const activeProfileName = document.getElementById('active-profile-name');
  if (activeProfileName) {
    if (currentUser) {
      activeProfileName.textContent = currentUser.displayName;
    } else {
      activeProfileName.textContent = currentProfile || 'Default';
    }
  }
}

// Handle Authentication Submission
async function handleAuthSubmit() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const errorEl = document.getElementById('auth-error');
  if (errorEl) errorEl.classList.add('hidden');

  if (!username || !password) {
    if (errorEl) {
      errorEl.textContent = 'Заполните имя пользователя и пароль';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  const payload = { username, password };
  let url = `${BACKEND_URL}/auth/login`;

  if (isRegistering) {
    const displayName = document.getElementById('auth-displayname').value.trim();
    if (!displayName) {
      if (errorEl) {
        errorEl.textContent = 'Заполните имя профиля';
        errorEl.classList.remove('hidden');
      }
      return;
    }
    payload.displayName = displayName;
    url = `${BACKEND_URL}/auth/register`;
  }

  const submitBtn = document.getElementById('auth-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Загрузка...';
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.status === 'success') {
      token = data.token;
      currentUser = data.user;
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(currentUser));

      // Load and sync favorites
      await loadLikedTracks();
      if (currentUser.playlists) {
        mergeAndSyncPlaylists(currentUser.playlists);
      }

      showToastNotification(isRegistering ? 'Регистрация успешна!' : 'Успешный вход!');
      renderProfileContainer();
      updateHeaderProfileUI();
    } else {
      if (errorEl) {
        errorEl.textContent = data.message || 'Произошла ошибка';
        errorEl.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.error(err);
    if (errorEl) {
      errorEl.textContent = 'Не удалось подключиться к серверу';
      errorEl.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = isRegistering ? 'Создать аккаунт' : 'Войти';
    }
  }
}

// Handle Logout
function handleLogout() {
  currentUser = null;
  token = null;
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');

  loadLikedTracks();
  updateHeaderProfileUI();
  renderProfileContainer();
  showToastNotification('Вы вышли из аккаунта');

  if (activeView === 'settings') {
    renderSettings();
  } else if (activeView === 'home') {
    loadHomeView();
  }
}

// Profile Modal Interactions
function openEditProfileModal() {
  const modal = document.getElementById('edit-profile-modal');
  if (!modal) return;

  document.getElementById('edit-display-name-input').value = currentUser.displayName || '';
  document.getElementById('edit-bio-input').value = currentUser.bio || '';

  const avatarSrc = currentUser.avatarBase64 || DEFAULT_AVATAR_100;
  document.getElementById('edit-avatar-preview').src = avatarSrc;

  tempAvatarBase64 = currentUser.avatarBase64 || '';
  modal.classList.remove('hidden');
}

function closeEditProfileModal() {
  const modal = document.getElementById('edit-profile-modal');
  if (modal) modal.classList.add('hidden');
}

// Initialise Profile Modal buttons
function initEditProfileEventListeners() {
  const selectBtn = document.getElementById('select-avatar-btn');
  const fileInput = document.getElementById('edit-avatar-input');

  if (selectBtn && fileInput) {
    selectBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        compressAndPreviewAvatar(file);
      }
    });
  }

  const cancelBtn = document.getElementById('cancel-edit-profile-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeEditProfileModal);
  }

  const saveBtn = document.getElementById('save-edit-profile-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveProfileChanges);
  }
}

// Compress avatar with HTML5 Canvas to 100x100 JPEG @ 0.7
function compressAndPreviewAvatar(file) {
  const reader = new FileReader();
  reader.onload = function (event) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');

      const size = Math.min(img.width, img.height);
      const xOffset = (img.width - size) / 2;
      const yOffset = (img.height - size) / 2;

      ctx.drawImage(img, xOffset, yOffset, size, size, 0, 0, 100, 100);

      const base64Str = canvas.toDataURL('image/jpeg', 0.7);
      document.getElementById('edit-avatar-preview').src = base64Str;
      tempAvatarBase64 = base64Str;
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

// Update profile data in DB
async function saveProfileChanges() {
  const displayName = document.getElementById('edit-display-name-input').value.trim();
  const bio = document.getElementById('edit-bio-input').value.trim();

  if (!displayName) {
    showToastNotification('Имя профиля не может быть пустым');
    return;
  }

  const saveBtn = document.getElementById('save-edit-profile-btn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Сохранение...';
  }

  try {
    const response = await fetch(`${BACKEND_URL}/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        displayName,
        bio,
        avatarBase64: tempAvatarBase64
      })
    });

    const data = await response.json();
    if (data.status === 'success') {
      currentUser = data.user;
      localStorage.setItem('auth_user', JSON.stringify(currentUser));

      showToastNotification('Профиль обновлен!');
      closeEditProfileModal();
      renderProfileContainer();
      updateHeaderProfileUI();
    } else {
      showToastNotification(data.message || 'Ошибка обновления профиля');
    }
  } catch (err) {
    console.error(err);
    showToastNotification('Не удалось соединиться с сервером');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Сохранить';
    }
  }
}

// Synchronise cloud likes list
async function syncLikesWithBackend(likes) {
  try {
    const res = await fetch(`${BACKEND_URL}/auth/sync-likes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ likedTracks: likes })
    });
    const data = await res.json();
    if (data.status === 'success') {
      currentUser.likedTracks = data.likedTracks;
      localStorage.setItem('auth_user', JSON.stringify(currentUser));
    }
  } catch (error) {
    console.error('[Sync Likes Error]:', error);
  }
}

// Synchronise cloud playlists list
async function syncPlaylistsWithBackend(playlists) {
  try {
    const res = await fetch(`${BACKEND_URL}/users/sync-playlists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ playlists })
    });
    const data = await res.json();
    if (data.status === 'success') {
      currentUser.playlists = data.playlists;
      localStorage.setItem('auth_user', JSON.stringify(currentUser));
    }
  } catch (error) {
    console.error('[Sync Playlists Error]:', error);
  }
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

      const headerCard = document.createElement('div');
      headerCard.className = 'friend-profile-banner';
      headerCard.innerHTML = `
        <img class="friend-profile-avatar" src="${avatarSrc}" alt="Avatar">
        <h2 class="friend-profile-name">${escapeHTML(friend.displayName)}</h2>
        <p class="friend-profile-username">@${escapeHTML(friend.username)}</p>
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

// --- Step 6: Auth Modal Controller ---
let isModalRegistering = false;

function openAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;

  // Reset inputs
  document.getElementById('auth-modal-username').value = '';
  document.getElementById('auth-modal-displayname').value = '';
  document.getElementById('auth-modal-password').value = '';
  const errorEl = document.getElementById('auth-modal-error');
  if (errorEl) errorEl.classList.add('hidden');

  isModalRegistering = false;
  updateAuthModalState();

  modal.classList.remove('hidden');
}

function updateAuthModalState() {
  const titleEl = document.getElementById('auth-modal-title');
  const displaynameInput = document.getElementById('auth-modal-displayname');
  const submitBtn = document.getElementById('auth-modal-submit-btn');
  const switchPromptText = document.getElementById('auth-modal-switch-prompt-text');
  const switchBtn = document.getElementById('auth-modal-switch-btn');

  if (isModalRegistering) {
    titleEl.textContent = 'Регистрация';
    displaynameInput.classList.remove('hidden');
    submitBtn.textContent = 'Создать аккаунт';
    switchPromptText.textContent = 'Уже есть аккаунт?';
    switchBtn.textContent = 'Войти';
  } else {
    titleEl.textContent = 'Вход в аккаунт';
    displaynameInput.classList.add('hidden');
    submitBtn.textContent = 'Войти';
    switchPromptText.textContent = 'Нет аккаунта?';
    switchBtn.textContent = 'Зарегистрироваться';
  }
}

async function handleModalAuthSubmit() {
  const username = document.getElementById('auth-modal-username').value.trim();
  const password = document.getElementById('auth-modal-password').value;
  const errorEl = document.getElementById('auth-modal-error');
  if (errorEl) errorEl.classList.add('hidden');

  if (!username || !password) {
    if (errorEl) {
      errorEl.textContent = 'Заполните имя пользователя и пароль';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  const payload = { username, password };
  let url = `${BACKEND_URL}/auth/login`;

  if (isModalRegistering) {
    const displayName = document.getElementById('auth-modal-displayname').value.trim();
    if (!displayName) {
      if (errorEl) {
        errorEl.textContent = 'Заполните имя профиля';
        errorEl.classList.remove('hidden');
      }
      return;
    }
    payload.displayName = displayName;
    url = `${BACKEND_URL}/auth/register`;
  }

  const submitBtn = document.getElementById('auth-modal-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Загрузка...';
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.status === 'success') {
      token = data.token;
      currentUser = data.user;
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(currentUser));

      await loadLikedTracks();
      if (currentUser.playlists) {
        mergeAndSyncPlaylists(currentUser.playlists);
      }
      connectWS();

      showToastNotification(isModalRegistering ? 'Регистрация успешна!' : 'Успешный вход!');
      updateHeaderProfileUI();
      document.getElementById('auth-modal').classList.add('hidden');
      
      // If we are currently in settings page or home, re-render it
      if (activeView === 'settings') {
        renderSettings();
      } else if (activeView === 'home') {
        loadHomeView();
      }
    } else {
      if (errorEl) {
        errorEl.textContent = data.message || 'Произошла ошибка';
        errorEl.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.error(err);
    if (errorEl) {
      errorEl.textContent = 'Не удалось подключиться к серверу';
      errorEl.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      updateAuthModalState();
    }
  }
}

// Bind auth modal event listeners on startup
document.getElementById('close-auth-modal-btn').addEventListener('click', () => {
  document.getElementById('auth-modal').classList.add('hidden');
});

document.getElementById('auth-modal-switch-btn').addEventListener('click', () => {
  isModalRegistering = !isModalRegistering;
  updateAuthModalState();
});

document.getElementById('auth-modal-submit-btn').addEventListener('click', handleModalAuthSubmit);

// ==========================================================================
// RELEASE 1.5.0: The Social Engine Websocket & Collaboration Logic
// ==========================================================================
let ws = null;
let wsReconnectTimeout = null;
let friendStatuses = new Map(); // friendId -> statusObject
let mutualFriends = []; // Mutual friends list

function connectWS() {
  if (ws) {
    try {
      ws.close();
    } catch(e){}
  }
  if (!currentUser || !token) return;

  const wsUrl = BACKEND_URL.replace(/^http/, 'ws');
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[WS] Connected to server.');
    ws.send(JSON.stringify({ type: 'auth', userId: currentUser.id }));
    broadcastPlayerStatus();
    loadMutualFriends();
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'friend_status_update') {
        const { userId, status } = data;
        friendStatuses.set(userId, status);
        renderFriendActivity();
        
        // If we are currently in Playlists view, we should re-render to update the glow indicator of cooperative playlists!
        if (activeView === 'playlists') {
          renderPlaylists();
        }
      } else if (data.type === 'playlist_updated' || data.type === 'playlist_added') {
        const { playlistId } = data;
        syncPlaylistsFromServer(playlistId);
      }
    } catch (err) {
      console.error('[WS Message Handle Error]:', err);
    }
  };

  ws.onclose = () => {
    console.log('[WS] Disconnected, reconnecting in 5s...');
    if (wsReconnectTimeout) clearTimeout(wsReconnectTimeout);
    wsReconnectTimeout = setTimeout(() => {
      if (currentUser && token) connectWS();
    }, 5000);
  };

  ws.onerror = (err) => {
    console.error('[WS Error]:', err);
  };
}

function broadcastPlayerStatus() {
  if (ws && ws.readyState === WebSocket.OPEN && currentUser) {
    const currentTrack = playlist[currentTrackIndex];
    ws.send(JSON.stringify({
      type: 'update_status',
      trackName: currentTrack ? currentTrack.title : '',
      artist: currentTrack ? currentTrack.artist : '',
      isPlaying: !audioPlayer.paused
    }));
  }
}

// Fetch mutual friends and update right sidebar
async function loadMutualFriends() {
  if (!token) return;
  try {
    const res = await fetch(`${BACKEND_URL}/users/friends`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 200) {
      const data = await res.json();
      if (data.status === 'success') {
        mutualFriends = data.friends || [];
        renderFriendActivity();
      }
    }
  } catch (error) {
    console.error('[Load Mutual Friends Error]:', error);
  }
}

// Helper to render a horizontal carousel banner
function renderCarousel(carouselTracks, container = null) {
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
    const coverUrl = track.thumbnail
      ? `${BACKEND_URL}/cover?url=${encodeURIComponent(track.thumbnail)}`
      : 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'><rect width=\'100\' height=\'100\' fill=\'%23222\'/><path d=\'M30 30 L70 50 L30 70 Z\' fill=\'%23444\'/></svg>';
    const isLiked = likedTrackIds.has(track.id);

    const playsText = track.source === 'soundcloud' && (track.playbackCount !== undefined || track.playback_count !== undefined)
      ? `▷ ${formatPlaybackCount(track.playbackCount || track.playback_count)}`
      : '';

    slidesHTML += `
      <div class="carousel-slide">
        <div class="carousel-slide-content">
          <img class="carousel-cover" src="${coverUrl}" alt="${trackTitle}">
          <div class="carousel-details">
            <span class="carousel-tag">✦ FOR YOU</span>
            <h3 class="carousel-title">${trackTitle}</h3>
            <p class="carousel-artist">${trackArtist}</p>
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
              <button class="carousel-play-now-btn" data-index="${idx}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="margin-left:2px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <span>Play Now</span>
              </button>
              <button class="carousel-icon-btn add-btn" data-index="${idx}" title="Add to Playlist">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
              <button class="carousel-icon-btn like-btn ${isLiked ? 'liked' : ''}" data-index="${idx}" title="Like">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    dotsHTML += `<div class="carousel-dot ${idx === 0 ? 'active' : ''}" data-index="${idx}"></div>`;
  });

  carouselSection.innerHTML = `
    <div class="carousel-container">
      <div class="carousel-wrapper" id="carousel-wrapper" style="display:flex; transition: transform 0.5s ease-in-out; width: 100%;">
        ${slidesHTML}
      </div>
    </div>
    <button class="carousel-nav-btn prev" id="carousel-prev">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <button class="carousel-nav-btn next" id="carousel-next">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
    <div class="carousel-dots" id="carousel-dots">
      ${dotsHTML}
    </div>
  `;

  if (container) {
    container.appendChild(carouselSection);
  }

  const wrapper = carouselSection.querySelector('#carousel-wrapper');
  const dots = carouselSection.querySelectorAll('.carousel-dot');

  const updateCarousel = (newIdx) => {
    if (!carouselTracks.length) return;
    homeCarouselIndex = (newIdx + carouselTracks.length) % carouselTracks.length;
    wrapper.style.transform = `translateX(-${homeCarouselIndex * 100}%)`;
    dots.forEach((dot, dIdx) => {
      dot.classList.toggle('active', dIdx === homeCarouselIndex);
    });
  };

  const startAutoSlide = () => {
    clearInterval(carouselTimer);
    carouselTimer = setInterval(() => {
      updateCarousel(homeCarouselIndex + 1);
    }, 5000);
  };

  startAutoSlide();

  carouselSection.addEventListener('mouseenter', () => clearInterval(carouselTimer));
  carouselSection.addEventListener('mouseleave', startAutoSlide);

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

// Render Friend Activity sidebar panel
function renderFriendActivity() {
  const containerEl = document.getElementById('friend-activity-list');
  if (!containerEl) return;

  if (!currentUser) {
    containerEl.innerHTML = '<div class="friend-activity-empty">Войдите в аккаунт, чтобы видеть активность друзей</div>';
    return;
  }

  if (mutualFriends.length === 0) {
    containerEl.innerHTML = '<div class="friend-activity-empty">У вас еще нет взаимных друзей. Нажмите кнопку "+" выше, чтобы найти пользователей.</div>';
    return;
  }

  containerEl.innerHTML = '';
  
  mutualFriends.forEach(friend => {
    const status = friendStatuses.get(friend.id) || { isOnline: false, isPlaying: false };
    const isOnline = status.isOnline;
    const isPlaying = status.isPlaying && status.trackName;

    const item = document.createElement('div');
    item.className = 'friend-activity-item';

    // Status avatar
    const avatarHtml = friend.avatarBase64
      ? `<img src="${friend.avatarBase64}" class="friend-avatar" />`
      : `<div class="friend-avatar-placeholder">${friend.displayName[0].toUpperCase()}</div>`;

    // Status description
    let statusText = 'Offline';
    if (isOnline) {
      if (isPlaying) {
        statusText = `
          <div class="friend-marquee">
            <span>Listening to: ${escapeHTML(status.trackName)} - ${escapeHTML(status.artist)}</span>
          </div>
        `;
      } else {
        statusText = '<span style="color: #30d158; font-weight: 500;">Online</span>';
      }
    }

    item.innerHTML = `
      <div class="friend-avatar-container">
        ${avatarHtml}
        <div class="friend-status-dot ${isOnline ? 'online' : ''} ${isPlaying ? 'playing' : ''}"></div>
      </div>
      <div class="friend-info">
        <div class="friend-name">${escapeHTML(friend.displayName)}</div>
        <div class="friend-status-text">${statusText}</div>
      </div>
    `;

    containerEl.appendChild(item);
  });
}

// Sync playlist updates from server
async function syncPlaylistsFromServer(updatedPlaylistId) {
  if (!token) return;
  try {
    const res = await fetch(`${BACKEND_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 200) {
      const data = await res.json();
      if (data.status === 'success') {
        currentUser.playlists = data.user.playlists;
        localStorage.setItem('auth_user', JSON.stringify(currentUser));
        
        // Render again to capture updates in real-time
        if (activeView === 'playlist-tracks' && activePlaylistId === updatedPlaylistId) {
          openPlaylist(updatedPlaylistId);
        } else if (activeView === 'playlists') {
          renderPlaylists();
        }
      }
    }
  } catch (err) {
    console.error('[Sync Playlists Server Error]:', err);
  }
}

// Collapsible Friend Activity sidebar trigger
const toggleActivityBtn = document.getElementById('toggle-friend-activity-btn');
const activityPanel = document.getElementById('friend-activity-panel');

if (toggleActivityBtn && activityPanel) {
  toggleActivityBtn.addEventListener('click', () => {
    activityPanel.classList.toggle('hidden');
    toggleActivityBtn.classList.toggle('active');
    toggleActivityBtn.style.color = activityPanel.classList.contains('hidden') ? 'var(--text-dim)' : 'var(--accent-color)';
  });
}

// Find Friends Modal search & toggles
const findFriendsBtn = document.getElementById('find-friends-btn');
const findFriendsModal = document.getElementById('find-friends-modal');
const closeFindFriendsBtn = document.getElementById('close-find-friends-modal-btn');
const findFriendsSearchInput = document.getElementById('find-friends-search');
const findFriendsList = document.getElementById('find-friends-list');

if (findFriendsBtn) {
  findFriendsBtn.addEventListener('click', () => {
    if (!currentUser) {
      showToastNotification('Войдите в аккаунт для поиска друзей');
      return;
    }
    findFriendsModal.classList.remove('hidden');
    findFriendsSearchInput.value = '';
    searchOtherUsers('');
  });
}

if (closeFindFriendsBtn) {
  closeFindFriendsBtn.addEventListener('click', () => {
    findFriendsModal.classList.add('hidden');
  });
}

if (findFriendsSearchInput) {
  findFriendsSearchInput.addEventListener('input', (e) => {
    searchOtherUsers(e.target.value.trim());
  });
}

async function searchOtherUsers(query) {
  if (!token) return;
  try {
    const res = await fetch(`${BACKEND_URL}/users`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 200) {
      const data = await res.json();
      if (data.status === 'success') {
        const users = data.users || [];
        
        // Filter users by search query
        const filtered = users.filter(u => 
          u.username.toLowerCase().includes(query.toLowerCase()) ||
          u.displayName.toLowerCase().includes(query.toLowerCase())
        );

        renderFindFriendsList(filtered);
      }
    }
  } catch (error) {
    console.error('[Search Users Error]:', error);
  }
}

function renderFindFriendsList(users) {
  if (!findFriendsList) return;
  
  if (users.length === 0) {
    findFriendsList.innerHTML = '<div style="text-align: center; color: var(--text-dim); font-size: 12px; padding: 20px;">Пользователи не найдены</div>';
    return;
  }

  findFriendsList.innerHTML = '';
  users.forEach(user => {
    const isFollowing = currentUser.following && currentUser.following.includes(user.id);
    const row = document.createElement('div');
    row.className = 'user-search-row';
    row.innerHTML = `
      <div class="user-search-info">
        ${user.avatarBase64 ? `<img src="${user.avatarBase64}" class="user-search-avatar" alt="">` : `<div class="user-search-avatar user-search-avatar-placeholder">${user.displayName[0].toUpperCase()}</div>`}
        <div class="user-search-copy">
          <span class="user-search-name">${escapeHTML(user.displayName)}</span>
          <span class="user-search-username">@${escapeHTML(user.username)}</span>
        </div>
      </div>
      <button class="follow-btn ${isFollowing ? 'following' : ''}" data-user-id="${user.id}">
        ${isFollowing ? 'Following' : 'Follow'}
      </button>
    `;

    // Hook Follow toggle action
    row.querySelector('.follow-btn').addEventListener('click', async (e) => {
      const btn = e.target;
      const targetId = btn.dataset.userId;
      
      try {
        const fRes = await fetch(`${BACKEND_URL}/users/follow/${targetId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        if (fRes.status === 200) {
          const fData = await fRes.json();
          if (fData.status === 'success') {
            currentUser.following = fData.following;
            localStorage.setItem('auth_user', JSON.stringify(currentUser));
            
            // Re-toggle UI states
            btn.classList.toggle('following', fData.isFollowing);
            btn.textContent = fData.isFollowing ? 'Following' : 'Follow';
            
            // Refresh friends lists
            await loadMutualFriends();
          }
        }
      } catch (err) {
        console.error('[Toggle Follow Error]:', err);
      }
    });

    findFriendsList.appendChild(row);
  });
}

// Bind Collaborative Modal Close Button
const closeCollabBtn = document.getElementById('close-collab-modal-btn');
if (closeCollabBtn) {
  closeCollabBtn.addEventListener('click', () => {
    document.getElementById('collab-modal').classList.add('hidden');
  });
}

function openCollabModal(playlistId) {
  const modal = document.getElementById('collab-modal');
  if (!modal) return;

  const friendsListContainer = document.getElementById('collab-friends-list');
  friendsListContainer.innerHTML = '';

  const playlists = getPlaylists();
  const pl = playlists.find(p => p.id === playlistId);
  if (!pl) return;

  const activeCollabIds = pl.collaborators || [];

  if (mutualFriends.length === 0) {
    friendsListContainer.innerHTML = '<div style="text-align: center; color: var(--text-dim); font-size: 12px; padding: 20px;">У вас пока нет взаимных друзей для добавления в совместный плейлист.</div>';
  } else {
    mutualFriends.forEach(friend => {
      const isChecked = activeCollabIds.includes(friend.id);
      const row = document.createElement('div');
      row.className = 'user-search-row';
      row.style.background = 'transparent';
      row.style.border = 'none';
      row.style.padding = '6px 0';
      row.innerHTML = `
        <div class="user-search-info">
          ${friend.avatarBase64 ? `<img src="${friend.avatarBase64}" style="width: 28px; height: 28px; border-radius:50%;" />` : `<div style="width: 28px; height: 28px; border-radius:50%; background:#3a3f50; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; color:#fff;">${friend.displayName[0].toUpperCase()}</div>`}
          <span style="font-size:13px; color:var(--text-color);">${friend.displayName}</span>
        </div>
        <input type="checkbox" class="collab-friend-checkbox" data-friend-id="${friend.id}" ${isChecked ? 'checked' : ''} style="width:16px; height:16px; cursor:pointer;" />
      `;
      friendsListContainer.appendChild(row);
    });
  }

  // Bind save action
  const saveBtn = document.getElementById('save-collab-btn');
  // Remove old listeners by cloning
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

  newSaveBtn.addEventListener('click', () => {
    const checkboxes = friendsListContainer.querySelectorAll('.collab-friend-checkbox');
    const selectedIds = [];
    checkboxes.forEach(cb => {
      if (cb.checked) {
        selectedIds.push(cb.dataset.friendId);
      }
    });

    pl.isCollaborative = selectedIds.length > 0;
    pl.collaborators = selectedIds;

    // Save locally and sync with backend
    savePlaylists(playlists, true);
    modal.classList.add('hidden');
    showToastNotification('Настройки доступа сохранены');
    openPlaylist(playlistId); // Refresh playlist header UI
  });

  modal.classList.remove('hidden');
}

// Call connectWS on startup if token is active
if (token) {
  connectWS();
}

// ═══════════════════════════════════════════════════════════════════
//  Release 1.6.0 — Spotify Mood Home & Lyrics Engine
// ═══════════════════════════════════════════════════════════════════

// ── Mood card definitions ─────────────────────────────────────────
const MOOD_CARDS = [
  { key: 'plugg',       title: 'Plugg Vibe',       sub: 'Melodic darkness'   },
  { key: 'heavy',       title: 'Heavy Session',    sub: 'Hard-hitting 808s'  },
  { key: 'dark',        title: 'Dark Archive',     sub: 'Forgotten classics' },
  { key: 'rage',        title: 'Rage / Jerk',      sub: 'High energy chaos'  },
  { key: 'chill',       title: 'Chill Waves',      sub: 'Smooth & easy'      },
  { key: 'underground', title: 'Underground Raw',  sub: 'Street certified'   },
  { key: 'electronic',  title: 'Electronic Zone',  sub: 'Synth & bass'       },
  { key: 'latenight',   title: 'Late Night R&B',   sub: 'Midnight sessions'  },
  { key: 'phonk',       title: 'Phonk Drift',      sub: 'Bass boost & speed' },
  { key: 'jerk',        title: 'Jerk / Jerk-Trap', sub: 'Hypnotic jerky rap' },
  { key: 'lofi',        title: 'Lofi Relax',       sub: 'Study & sleep vibes'},
  { key: 'cyber',       title: 'Cyber Synth',      sub: 'Cyberpunk beats'    },
  { key: 'ambient',     title: 'Ambient Space',    sub: 'Atmospheric relax'  },
];

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
  gridLabel.textContent = 'Choose a vibe to explore';
  container.appendChild(gridLabel);

  const grid = document.createElement('div');
  grid.className = 'mood-grid';

  MOOD_CARDS.forEach(mood => {
    const card = document.createElement('div');
    card.className = `mood-card ${activeSpotifyMood === mood.key ? 'active' : ''}`;
    card.innerHTML = `
      <div class="mood-card-active-ring"></div>
      <div class="mood-card-title">${mood.title}</div>
      <div class="mood-card-sub">${mood.sub}</div>
    `;

    card.addEventListener('click', async () => {
      // Update active state visually
      grid.querySelectorAll('.mood-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      activeSpotifyMood = mood.key;

      // Show loading state on this card
      card.classList.add('loading');

      await loadSpotifyMoodTracks(mood.key, mood.title, container);
      card.classList.remove('loading');
    });

    grid.appendChild(card);
  });

  container.appendChild(grid);

  // 3. Results area
  const resultsArea = document.createElement('div');
  resultsArea.id = 'spotify-results-area';
  container.appendChild(resultsArea);

  tracksContainer.appendChild(container);

  // If we already have cached tracks for the active mood, draw carousel immediately
  if (cachedSpotifyTracks && cachedSpotifyTracks.length > 0) {
    renderCarousel(cachedSpotifyTracks.slice(0, 5), carouselPlaceholder);
  }

  // Auto-load the previously selected mood (or default to first)
  const defaultMood = activeSpotifyMood || MOOD_CARDS[0].key;
  const defaultCard = grid.querySelectorAll('.mood-card')[
    MOOD_CARDS.findIndex(m => m.key === defaultMood)
  ];
  if (defaultCard) {
    defaultCard.classList.add('active');
    // If no cache or active mood is different, fetch from server
    if (!cachedSpotifyTracks || activeSpotifyMood !== defaultMood) {
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

  let moodTracks = [];
  let dynamicTracks = [];

  if (useCacheOnly && cachedSpotifyTracks && cachedSpotifyDynamicTracks) {
    moodTracks = cachedSpotifyTracks;
    dynamicTracks = cachedSpotifyDynamicTracks;
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
        fetch(`${BACKEND_URL}/spotify/recommendations?mood=${encodeURIComponent(moodKey)}`),
        fetch(`${BACKEND_URL}/spotify/recommendations?mood=dynamic&hour=${hour}`)
      ]);

      if (!moodRes.ok || !dynamicRes.ok) {
        throw new Error('Failed to fetch recommendation APIs');
      }

      const moodData = await moodRes.json();
      const dynamicData = await dynamicRes.json();

      moodTracks = moodData.results || [];
      dynamicTracks = dynamicData.results || [];

      cachedSpotifyTracks = moodTracks;
      cachedSpotifyDynamicTracks = dynamicTracks;

      // Update Carousel dynamically with loaded mood tracks
      const carouselPlaceholder = document.getElementById('spotify-carousel-container');
      if (carouselPlaceholder) {
        carouselPlaceholder.innerHTML = '';
        renderCarousel(moodTracks.slice(0, 5), carouselPlaceholder);
      }
    } catch (err) {
      console.error('[Spotify Recommendations] Failed to load tracks:', err.message);
      resultsArea.innerHTML = `
        <div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3);">
          Не удалось загрузить рекомендации. Попробуйте еще раз.
        </div>
      `;
      return;
    }
  }

  resultsArea.innerHTML = '';

  // 1. Determine dynamic time-of-day greeting text
  const currentHour = new Date().getHours();
  let dynamicGreeting = "Музыка под настроение";
  if (currentHour >= 6 && currentHour < 12) {
    dynamicGreeting = "Доброе утро! Твой утренний микс ☕";
  } else if (currentHour >= 12 && currentHour < 18) {
    dynamicGreeting = "Добрый день! Дневной заряд энергии ☀️";
  } else if (currentHour >= 18 && currentHour < 24) {
    dynamicGreeting = "Добрый вечер! Время раскачаться 🌙";
  } else {
    dynamicGreeting = "Доброй ночи! Ночной подземный вайб 🌌";
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
    const recTracks = moodTracks.slice(0, 8);
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

    // Trending section (next 8 tracks)
    if (moodTracks.length > 8) {
      const trendSection = document.createElement('div');
      trendSection.className = 'home-section scrollable';
      trendSection.innerHTML = `
        <div class="home-section-header">
          <h3>В тренде</h3>
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
      const trendTracks = moodTracks.slice(8, 16);
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

// ═══════════════════════════════════════════════════════════════════
//  Lyrics Engine
// ═══════════════════════════════════════════════════════════════════

const lyricsOverlay  = document.getElementById('lyrics-overlay');
const lyricsContent  = document.getElementById('lyrics-content');
const lyricsTitleEl  = document.getElementById('lyrics-track-title');
const lyricsArtistEl = document.getElementById('lyrics-track-artist');
const lyricsCloseBtn = document.getElementById('lyrics-close-btn');
const lyricsBtn      = document.getElementById('lyrics-btn');

/**
 * Parses an LRC string into an array of { time (seconds), text } objects.
 */
function parseLRC(lrcText) {
  const lines = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
  let match;
  while ((match = regex.exec(lrcText)) !== null) {
    const min  = parseInt(match[1], 10);
    const sec  = parseInt(match[2], 10);
    const ms   = parseInt(match[3].padEnd(3, '0'), 10);
    const time = min * 60 + sec + ms / 1000;
    const text = match[4].trim();
    if (text) lines.push({ time, text });
  }
  return lines;
}

/**
 * Fetches lyrics from the backend for the currently playing track.
 */
async function fetchLyrics(title, artist) {
  const params = new URLSearchParams({ title, artist });
  const res = await fetch(`${BACKEND_URL}/spotify/lyrics?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Not found');
  }
  return res.json();
}

/**
 * Renders LRC lyric lines as individual DOM elements.
 */
function renderLRCLines(lines) {
  lyricsContent.innerHTML = '';
  lines.forEach((line, i) => {
    const el = document.createElement('div');
    el.className = 'lyrics-line upcoming';
    el.dataset.index = i;
    el.dataset.time = line.time;
    el.textContent = line.text;
    // Click a line to seek audio
    el.addEventListener('click', () => {
      if (audioPlayer && isFinite(line.time)) {
        audioPlayer.currentTime = line.time;
      }
    });
    lyricsContent.appendChild(el);
  });
}

/**
 * Updates which lyric line is active based on current audio time.
 * Called on timeupdate.
 */
function syncLyricsToTime(currentTime) {
  let activeIdx = -1;
  for (let i = 0; i < lyricsState.lrcLines.length; i++) {
    if (lyricsState.lrcLines[i].time <= currentTime) {
      activeIdx = i;
    } else {
      break;
    }
  }

  if (activeIdx === lyricsState.lastActiveIdx) {
    return;
  }
  lyricsState.lastActiveIdx = activeIdx;

  const linEls = lyricsContent.querySelectorAll('.lyrics-line');
  if (!linEls.length) return;

  linEls.forEach((el, i) => {
    el.classList.remove('active', 'past', 'upcoming');
    if (i < activeIdx)       el.classList.add('past');
    else if (i === activeIdx) el.classList.add('active');
    else                      el.classList.add('upcoming');
  });

  // Smooth-scroll active line into view
  if (activeIdx >= 0 && linEls[activeIdx]) {
    linEls[activeIdx].scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }
}

/**
 * Opens the lyrics overlay for the currently playing track.
 */
async function openLyricsOverlay() {
  const currentTrack = playlist[currentTrackIndex];
  if (!currentTrack) {
    showToastNotification('No track is currently playing');
    return;
  }

  // Update header
  if (lyricsTitleEl)  lyricsTitleEl.textContent  = currentTrack.title  || 'Unknown Track';
  if (lyricsArtistEl) lyricsArtistEl.textContent = currentTrack.artist || 'Unknown Artist';

  // Show overlay immediately with loading state
  lyricsOverlay.classList.remove('hidden');
  requestAnimationFrame(() => lyricsOverlay.classList.add('visible'));
  lyricsState.isOpen = true;
  if (lyricsBtn) lyricsBtn.classList.add('active');

  lyricsContent.innerHTML = `
    <div class="lyrics-loading">
      <div class="spinner"></div>
      <span>Fetching lyrics...</span>
    </div>
  `;

  // Stop previous sync timer
  if (lyricsState.syncTimer) {
    audioPlayer.removeEventListener('timeupdate', lyricsState.syncTimer);
    lyricsState.syncTimer = null;
  }
  lyricsState.lrcLines = [];
  lyricsState.format = null;
  lyricsState.currentTrackId = currentTrack.id;
  lyricsState.lastActiveIdx = -1;

  try {
    const data = await fetchLyrics(currentTrack.title, currentTrack.artist);

    // Check track didn't change while fetching
    if (lyricsState.currentTrackId !== currentTrack.id) return;

    if (data.format === 'lrc' && data.lyrics) {
      // ── Synchronized LRC mode ────────────────────────────────
      lyricsState.lrcLines = parseLRC(data.lyrics);
      lyricsState.format = 'lrc';
      renderLRCLines(lyricsState.lrcLines);

      // Register time-sync callback
      const syncHandler = () => syncLyricsToTime(audioPlayer.currentTime);
      lyricsState.syncTimer = syncHandler;
      audioPlayer.addEventListener('timeupdate', syncHandler);
      // Initial sync
      syncHandler();

    } else if (data.plainText) {
      // ── Plain text mode ───────────────────────────────────────
      lyricsState.format = 'plain';
      lyricsContent.innerHTML = `<div class="lyrics-plain">${escapeHTML(data.plainText)}</div>`;
    } else {
      throw new Error('No lyrics data');
    }
  } catch (err) {
    if (lyricsState.currentTrackId !== currentTrack.id) return;
    lyricsContent.innerHTML = `
      <div class="lyrics-not-found">
        <div style="font-size: 40px; margin-bottom: 16px;">🎤</div>
        <div>Lyrics not found for this track.</div>
        <div style="font-size: 12px; margin-top: 8px; opacity: 0.6;">${escapeHTML(currentTrack.title)} · ${escapeHTML(currentTrack.artist || '')}</div>
      </div>
    `;
    console.warn('[Lyrics] Not found:', err.message);
  }
}

/**
 * Closes the lyrics overlay and cleans up sync handlers.
 */
function closeLyricsOverlay() {
  lyricsOverlay.classList.remove('visible');
  setTimeout(() => lyricsOverlay.classList.add('hidden'), 350);
  lyricsState.isOpen = false;
  if (lyricsBtn) lyricsBtn.classList.remove('active');
  if (lyricsState.syncTimer) {
    audioPlayer.removeEventListener('timeupdate', lyricsState.syncTimer);
    lyricsState.syncTimer = null;
  }
  lyricsState.lastActiveIdx = -1;
}

// ── Lyrics button click ───────────────────────────────────────────
if (lyricsBtn) {
  lyricsBtn.addEventListener('click', () => {
    if (lyricsState.isOpen) {
      closeLyricsOverlay();
    } else {
      openLyricsOverlay();
    }
  });
}

// ── Close button ──────────────────────────────────────────────────
if (lyricsCloseBtn) {
  lyricsCloseBtn.addEventListener('click', closeLyricsOverlay);
}

// ── ESC key closes overlay ────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && lyricsState.isOpen) {
    closeLyricsOverlay();
  }
});

// ── When track changes while overlay is open, reload lyrics ──────
audioPlayer.addEventListener('playing', () => {
  if (lyricsState.isOpen) {
    const currentTrack = playlist[currentTrackIndex];
    if (currentTrack && lyricsState.currentTrackId !== currentTrack.id) {
      openLyricsOverlay();
    }
  }
});

// --- Vibe Engine 2.0: SoundCloud Dynamic recommendations helpers ---
async function loadSoundCloudDynamicRecommendations(containerEl, forceRefresh = false) {
  if (!containerEl) return;

  if (!forceRefresh && cachedSoundCloudDynamicTracks) {
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
    const res = await fetch(`${BACKEND_URL}/spotify/recommendations?mood=dynamic&hour=${hour}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    // Tag results as source: 'soundcloud' instead of 'spotify'
    const tracks = (data.results || []).map(t => {
      // If the ID contains the spotify composite prefix, extract the raw SoundCloud ID
      const rawId = t.id.startsWith('spotify_track:') ? t.id.split(':').slice(3).join(':') : t.id;
      return {
        ...t,
        id: rawId,
        source: 'soundcloud'
      };
    });

    cachedSoundCloudDynamicTracks = tracks;
    renderSoundCloudDynamicSection(containerEl, tracks);
  } catch (err) {
    console.error('[SoundCloud Dynamic Recs] Failed to load:', err.message);
    containerEl.innerHTML = ''; // Hide silently on error to not disrupt main UI
  }
}

function renderSoundCloudDynamicSection(containerEl, tracks) {
  containerEl.innerHTML = '';
  if (tracks.length === 0) return;

  const currentHour = new Date().getHours();
  let greeting = "Твой микс под настроение";
  if (currentHour >= 6 && currentHour < 12) {
    greeting = "Доброе утро! Твой утренний микс ☕";
  } else if (currentHour >= 12 && currentHour < 18) {
    greeting = "Добрый день! Дневной заряд энергии ☀️";
  } else if (currentHour >= 18 && currentHour < 24) {
    greeting = "Добрый вечер! Время раскачаться 🌙";
  } else {
    greeting = "Доброй ночи! Ночной подземный вайб 🌌";
  }

  const header = document.createElement('div');
  header.className = 'spotify-section-header';
  header.style.marginTop = '16px';
  header.innerHTML = `
    <div class="spotify-section-title">${greeting}</div>
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
      refreshBtn.style.pointerEvents = 'none';
      loadSoundCloudDynamicRecommendations(containerEl, true)
        .finally(() => {
          const btn = document.getElementById('soundcloud-refresh-btn');
          if (btn) {
            btn.classList.remove('loading');
            btn.style.pointerEvents = 'auto';
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
