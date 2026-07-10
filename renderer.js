const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const tracksContainer = document.getElementById('tracks-container');
const welcomeScreen = document.getElementById('welcome-screen');
const loadingIndicator = document.getElementById('loading-indicator');
const favoritesButton = document.getElementById('favorites-button');
let activeSources = { soundcloud: true, youtube: true };

// Audio Element
const audioPlayer = document.getElementById('audio-player');

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

// App state variables
let playlist = [];
let currentTrackIndex = -1;
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
    
    // Create Analyser
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    
    // Chain: Source -> Filter -> Analyser -> Destination
    source.connect(bassFilter);
    bassFilter.connect(analyser);
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
}
let cachedForYouData = null;

// Base Server API URL Configuration
const API_URL = 'http://localhost:5000';
const BACKEND_URL = `${API_URL}/api`;

// Default Base64-encoded SVG avatars to prevent HTML template quote clash
const DEFAULT_AVATAR_54 = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="54" height="54" viewBox="0 0 54 54"><circle cx="27" cy="27" r="25" fill="#333"/><path d="M27 24a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0 4c-8 0-11 5-11 9v2h22v-2c0-4-3-9-11-9z" fill="#666"/></svg>');
const DEFAULT_AVATAR_90 = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="90" height="90" viewBox="0 0 90 90"><circle cx="45" cy="45" r="43" fill="#333"/><path d="M45 40a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0 8c-14 0-20 8-20 16v3h40v-3c0-8-6-16-20-16z" fill="#666"/></svg>');
const DEFAULT_AVATAR_100 = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#333"/><path d="M50 44a12 12 0 1 0 0-24 12 12 0 0 0 0 24zm0 8c-16 0-22 10-22 18v4h44v-4c0-8-6-18-22-18z" fill="#666"/></svg>');

// DOM Elements
const homeButton = document.getElementById('home-button');
const historyButton = document.getElementById('history-button');
const playlistsButton = document.getElementById('playlists-button');
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
  if (activeSources.youtube) sources.push('youtube');
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

    if (data.status === 'success' && data.results && data.results.length > 0) {
      playlist = data.results;
      renderTracks(playlist);
      tracksContainer.classList.remove('hidden');
      updateLoadMoreButton(playlist.length); // Update pagination buttons
    } else {
      playlist = [];
      tracksContainer.innerHTML = '<div class="welcome-state"><h2>No results found</h2><p>Try searching for something else</p></div>';
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
  if (activeSources.youtube) sources.push('youtube');
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
  
  tracks.forEach((track, index) => {
    const card = document.createElement('div');
    const currentTrack = playlist[currentTrackIndex];
    const isActive = currentTrack && track.id === currentTrack.id;
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

    const artistHTML = track.artistId && track.source === 'soundcloud'
      ? `<span class="artist-link" data-artist-id="${track.artistId}">${trackArtist}</span>`
      : `<span>${trackArtist}</span>`;

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
          <span class="badge ${track.source}">${track.source}</span>
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
      
      const currentTrack = playlist[currentTrackIndex];
      const isCurrent = currentTrack && track.id === currentTrack.id;
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
        loadArtistView(track.artistId);
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

// 3. Play Track
// 3. Play Track
function playTrack(index) {
  if (index < 0 || index >= playlist.length) return;

  currentTrackIndex = index;
  const track = playlist[index];

  // Add to playback history
  addToHistory(track);

  // Increment local stats play count
  incrementPlayCount(track);
  audioPlayer.lastStatsTime = null;

  // Update Active UI State
  const cards = document.querySelectorAll('.track-card');
  cards.forEach(card => card.classList.remove('active'));
  const activeCards = document.querySelectorAll(`.track-card[data-track-id="${track.id}"]`);
  activeCards.forEach(card => card.classList.add('active'));

  // Update Player Meta Info
  currentTitle.textContent = track.title;
  if (miniCurrentTitle) miniCurrentTitle.textContent = track.title;
  
  if (track.artistId && track.source === 'soundcloud') {
    currentArtist.innerHTML = `<span class="artist-link" data-artist-id="${track.artistId}">${track.artist}</span>`;
    const artistLink = currentArtist.querySelector('.artist-link');
    if (artistLink) {
      artistLink.addEventListener('click', (e) => {
        e.stopPropagation();
        loadArtistView(track.artistId);
      });
    }
  } else {
    currentArtist.textContent = track.artist;
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
  audioPlayer.src = `${BACKEND_URL}/stream?id=${encodeURIComponent(track.id)}&source=${track.source}`;
  
  // Initialize and apply Audio Effects
  initAudioEffects();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  applyAudioEffectsState();
  
  const playPromise = audioPlayer.play();
  currentPlayPromise = playPromise;

  // Clear any previous loading timeout before starting a new track
  clearTimeout(trackLoadTimeout);

  // Set 5-second track loading timeout
  trackLoadTimeout = setTimeout(() => {
    if (currentPlayPromise === playPromise) {
      handleTrackLoadError("Track loading timed out (5 seconds limit)");
    }
  }, 5000);

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

function handleTrackLoadError(reason) {
  console.warn('[Track Load Error]:', reason);
  clearTimeout(trackLoadTimeout);
  
  // Pause audio and update UI
  audioPlayer.pause();
  setPlayState(false);
  
  // Display toast notification
  showToastNotification("Этот трек недоступен");
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
}

function togglePlay() {
  if (currentTrackIndex === -1 && playlist.length > 0) {
    playTrack(0);
    return;
  }

  if (audioPlayer.paused) {
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
  } else {
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

audioPlayer.addEventListener('timeupdate', () => {
  // Accumulate stats total seconds
  if (!audioPlayer.paused && !isSeeking) {
    if (audioPlayer.lastStatsTime !== undefined && audioPlayer.lastStatsTime !== null) {
      const diff = audioPlayer.currentTime - audioPlayer.lastStatsTime;
      if (diff > 0 && diff < 2) {
        let totalSeconds = parseFloat(localStorage.getItem('gp_stats_total_seconds')) || 0;
        totalSeconds += diff;
        localStorage.setItem('gp_stats_total_seconds', totalSeconds);
      }
    }
    audioPlayer.lastStatsTime = audioPlayer.currentTime;
  } else {
    audioPlayer.lastStatsTime = audioPlayer.currentTime;
  }

  if (isSeeking) return;
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
  } else {
    progressSlider.value = 0;
    if (miniProgressBar) {
      miniProgressBar.style.width = '0%';
    }
  }
});

audioPlayer.addEventListener('ended', () => {
  if (isRepeat) {
    currentSeekOffset = 0;
    const track = playlist[currentTrackIndex];
    audioPlayer.src = `${BACKEND_URL}/stream?id=${encodeURIComponent(track.id)}&source=${track.source}`;
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
progressSlider.addEventListener('input', () => {
  isSeeking = true;
  const duration = currentTrackDuration || audioPlayer.duration || 0;
  currentTimeText.textContent = formatTime((parseFloat(progressSlider.value) / 100) * duration);
});

progressSlider.addEventListener('change', () => {
  const duration = currentTrackDuration || audioPlayer.duration || 0;
  const track = playlist[currentTrackIndex];
  if (duration > 0 && track) {
    const seekTime = (parseFloat(progressSlider.value) / 100) * duration;
    currentSeekOffset = seekTime;
    
    // Set src with seek parameter to play from the new position
    audioPlayer.src = `${BACKEND_URL}/stream?id=${encodeURIComponent(track.id)}&source=${track.source}&seek=${seekTime}`;
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
  isSeeking = false;
});

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
    item.className = `profile-dropdown-item ${p === currentProfile ? 'active' : ''}`;
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
}

function switchUserProfile(profileName) {
  currentProfile = profileName;
  localStorage.setItem('gp_active_profile', currentProfile);
  activeProfileName.textContent = currentProfile;
  
  // Reload liked ids
  loadLikedTracks();
  
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

  setTimeout(() => {
    loadLikedTracks();
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
      const card = document.createElement('div');
      card.className = 'playlist-card';
      
      card.innerHTML = `
        <div class="playlist-card-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
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

  const viewHeader = document.createElement('div');
  viewHeader.className = 'view-header';
  viewHeader.innerHTML = `
    <div class="view-header-title">
      <button id="back-to-playlists" class="view-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        <span>Back</span>
      </button>
      <span>${pl.name}</span>
      <span class="view-header-subtitle">(${pl.tracks.length} tracks)</span>
    </div>
  `;
  tracksContainer.appendChild(viewHeader);

  document.getElementById('back-to-playlists').addEventListener('click', () => {
    loadPlaylistsView();
  });

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
  profileModal.classList.remove('hidden');
  newProfileInput.focus();
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

function renderHome(sectionsData, forYouData) {
  tracksContainer.innerHTML = '';

  // 1. Render Genre Chips Scroll-bar
  const chipsContainer = document.createElement('div');
  chipsContainer.className = 'genre-chips-bar';
  chipsContainer.style.cssText = 'display: flex; gap: 8px; overflow-x: auto; padding: 10px 5px; margin-bottom: 15px; scrollbar-width: none; -webkit-overflow-scrolling: touch;';
  
  if (!document.getElementById('genre-chips-style')) {
    const style = document.createElement('style');
    style.id = 'genre-chips-style';
    style.textContent = '.genre-chips-bar::-webkit-scrollbar { display: none; }';
    document.head.appendChild(style);
  }

  const tags = ['Underground', 'Archive', 'Plugg', 'Jerk', 'Electronic', 'Rock', 'Rap'];
  tags.forEach(tag => {
    const chip = document.createElement('button');
    const isActive = activeGenreChip === tag;
    chip.className = `genre-chip-btn ${isActive ? 'active' : ''}`;
    chip.textContent = tag;

    chip.addEventListener('click', async () => {
      if (activeGenreChip === tag) {
        activeGenreChip = null;
        renderHome(originalHomeData, cachedForYouData);
      } else {
        activeGenreChip = tag;
        renderHome(originalHomeData, cachedForYouData);

        const contentArea = document.getElementById('home-content-area');
        if (contentArea) {
          contentArea.innerHTML = '<div style="display: flex; justify-content: center; padding: 50px;"><div style="color: rgba(255,255,255,0.6); font-size: 14px;">Загрузка жанра...</div></div>';
        }

        try {
          const response = await fetch(`${BACKEND_URL}/search?q=${encodeURIComponent(tag)}`);
          const result = await response.json();
          if (result.status === 'success' && result.results) {
            const scTracks = result.results.filter(t => t.source === 'soundcloud');
            renderGenreTracks(scTracks, tag);
          } else {
            if (contentArea) {
              contentArea.innerHTML = '<div style="text-align: center; padding: 30px; color: rgba(255,255,255,0.4);">Не удалось загрузить треки</div>';
            }
          }
        } catch (err) {
          console.error(err);
          if (contentArea) {
            contentArea.innerHTML = '<div style="text-align: center; padding: 30px; color: rgba(255,255,255,0.4);">Ошибка загрузки</div>';
          }
        }
      }
    });

    chipsContainer.appendChild(chip);
  });

  tracksContainer.appendChild(chipsContainer);

  const contentArea = document.createElement('div');
  contentArea.id = 'home-content-area';
  tracksContainer.appendChild(contentArea);

  if (activeGenreChip) {
    const tag = activeGenreChip;
    setTimeout(async () => {
      const contentArea = document.getElementById('home-content-area');
      if (contentArea) {
        contentArea.innerHTML = '<div style="display: flex; justify-content: center; padding: 50px;"><div style="color: rgba(255,255,255,0.6); font-size: 14px;">Загрузка жанра...</div></div>';
      }
      try {
        const response = await fetch(`${BACKEND_URL}/search?q=${encodeURIComponent(tag)}`);
        const result = await response.json();
        if (result.status === 'success' && result.results) {
          const scTracks = result.results.filter(t => t.source === 'soundcloud');
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

  // 1. Render "Для вас" (For You) Section
  if (forYouData && forYouData.tracks && forYouData.tracks.length > 0) {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'home-section';
    
    const titleEl = document.createElement('div');
    titleEl.className = 'home-section-title';
    titleEl.innerHTML = `Для вас <span style="font-size: 12px; font-weight: normal; color: rgba(255,255,255,0.4); margin-left: 8px;">${forYouData.source}</span>`;
    sectionEl.appendChild(titleEl);
    
    const scroller = document.createElement('div');
    scroller.className = 'scroller-container';
    sectionEl.appendChild(scroller);
    
    renderTracksForSection(forYouData.tracks, scroller);
    contentArea.appendChild(sectionEl);
  }

  // 2. Render normal sections
  const sections = [
    { title: 'Тренды недели', tracks: sectionsData.trending },
    { title: 'Популярное', tracks: sectionsData.top },
    { title: 'Жанр: Электроника', tracks: sectionsData.electronic },
    { title: 'Жанр: Рок', tracks: sectionsData.rock },
    { title: 'Жанр: Поп', tracks: sectionsData.pop },
    { title: 'Жанр: Хип-хоп / Рэп', tracks: sectionsData.hiphop }
  ];

  sections.forEach(sec => {
    if (!sec.tracks || sec.tracks.length === 0) return;

    const sectionEl = document.createElement('div');
    sectionEl.className = 'home-section';
    
    const titleEl = document.createElement('div');
    titleEl.className = 'home-section-title';
    titleEl.textContent = sec.title;
    sectionEl.appendChild(titleEl);

    const scroller = document.createElement('div');
    scroller.className = 'scroller-container';
    sectionEl.appendChild(scroller);

    renderTracksForSection(sec.tracks, scroller);
    contentArea.appendChild(sectionEl);
  });
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

function renderTracksForSection(sectionTracks, container) {
  container.innerHTML = '';
  sectionTracks.forEach((track, index) => {
    const card = document.createElement('div');
    const currentTrack = playlist[currentTrackIndex];
    const isActive = currentTrack && track.id === currentTrack.id;
    card.className = `track-card ${isActive ? 'active' : ''}`;
    card.dataset.index = index;
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

    const artistHTML = track.artistId && track.source === 'soundcloud'
      ? `<span class="artist-link" data-artist-id="${track.artistId}">${trackArtist}</span>`
      : `<span>${trackArtist}</span>`;

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
          <span class="badge ${track.source}">${track.source}</span>
          <span class="card-meta-right" style="display: flex; align-items: center; gap: 8px;">
            ${playsHTML}
            <span class="card-duration">${track.duration}</span>
          </span>
        </div>
      </div>
      <button class="playlist-add-btn" title="Add to Playlist">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>
      <button class="like-btn ${isLiked ? 'liked' : ''}">${heartIcon}</button>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.like-btn') || e.target.closest('.playlist-add-btn') || e.target.closest('.artist-link')) return;
      
      const currentTrack = playlist[currentTrackIndex];
      const isCurrent = currentTrack && track.id === currentTrack.id;
      if (isCurrent) {
        togglePlay();
      } else {
        playlist = sectionTracks;
        playTrack(index);
      }
    });

    card.querySelector('.like-btn').addEventListener('click', (e) => {
      toggleLike(e, track);
    });

    card.querySelector('.playlist-add-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      showPlaylistMenu(e, track);
    });

    const artistLink = card.querySelector('.artist-link');
    if (artistLink) {
      artistLink.addEventListener('click', (e) => {
        e.stopPropagation();
        loadArtistView(track.artistId);
      });
    }

    container.appendChild(card);
  });
}

// --- Step 3 Artist Profile View Loader ---

async function loadArtistView(artistId) {
  activeView = 'artist';
  welcomeScreen.classList.add('hidden');
  tracksContainer.classList.add('hidden');
  loadingIndicator.classList.remove('hidden');

  try {
    const response = await fetch(`${BACKEND_URL}/search/artist/${artistId}`);
    const data = await response.json();
    loadingIndicator.classList.add('hidden');

    if (data.status === 'success' && data.results) {
      renderArtistProfile(data.results);
      tracksContainer.classList.remove('hidden');
    } else {
      tracksContainer.innerHTML = '<div class="welcome-state"><h2>Артист не найден</h2><p>Не удалось получить данные профиля</p></div>';
      tracksContainer.classList.remove('hidden');
    }
    updateActiveTab('artist');
  } catch (error) {
    console.error('[Renderer] Failed to load artist view:', error);
    loadingIndicator.classList.add('hidden');
    tracksContainer.innerHTML = '<div class="welcome-state"><h2>Ошибка сети</h2><p>Не удалось подключиться к серверу</p></div>';
    tracksContainer.classList.remove('hidden');
    updateActiveTab('artist');
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
      <button id="source-yt" class="source-pill ${activeSources.youtube ? 'active' : ''}" title="YouTube">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
      </button>
    </div>
  `;

  searchHistoryDropdown.appendChild(sourcesContainer);

  // Bind click events on the dynamic source pills
  const newSourceScBtn = sourcesContainer.querySelector('#source-sc');
  const newSourceYtBtn = sourcesContainer.querySelector('#source-yt');
  
  [newSourceScBtn, newSourceYtBtn].forEach(btn => {
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // Keep dropdown open
        
        const sourceName = btn.id === 'source-sc' ? 'soundcloud' : 'youtube';
        const activeCount = Object.values(activeSources).filter(Boolean).length;
        
        if (activeCount === 1 && activeSources[sourceName]) {
          return; // Prevent deselecting last active source
        }
        
        activeSources[sourceName] = !activeSources[sourceName];
        btn.classList.toggle('active', activeSources[sourceName]);
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

function renderSettings() {
  loadingIndicator.classList.add('hidden');
  tracksContainer.innerHTML = '';

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
  viewHeader.innerHTML = `
    <div class="view-header-title">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
      <span>Профиль и Настройки</span>
    </div>
  `;
  tracksContainer.appendChild(viewHeader);

  // Profile Section container
  const profileSection = document.createElement('div');
  profileSection.id = 'profile-section-container';
  tracksContainer.appendChild(profileSection);

  renderProfileContainer();

  const panel = document.createElement('div');
  panel.className = 'settings-panel';
  
  const currentTheme = localStorage.getItem('gp_theme') || 'theme-dark-glass';

  panel.innerHTML = `
    <div class="settings-section">
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
      </div>
    </div>

    <div class="settings-section" style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 20px;">
      <h3>Конструктор темы</h3>
      
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 15px;">
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Цвет фона:</span>
          <input type="color" id="theme-bg-color" value="${customTheme.bgColor}" style="width: 100%; height: 36px; border: none; border-radius: 6px; background: transparent; cursor: pointer;">
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
        <div style="display: flex; flex-direction: column; gap: 6px; grid-column: span 2;">
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
            <span style="color: rgba(255,255,255,0.5);">Прозрачность панелей:</span>
            <span id="opacity-val-text" style="color: #fff;">${Math.round(customTheme.opacity * 100)}%</span>
          </div>
          <input type="range" id="theme-opacity-slider" min="0" max="100" value="${Math.round(customTheme.opacity * 100)}" style="width: 100%; accent-color: #30d158; cursor: pointer;">
        </div>
      </div>

      <div style="display: flex; gap: 10px; margin-top: 15px;">
        <button id="theme-export-btn" class="view-btn" style="flex: 1; justify-content: center;">
          <span>Скопировать код темы</span>
        </button>
      </div>

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

    <div class="settings-section">
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

    <div class="settings-section">
      <h3>Аудиоэффекты</h3>
      
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

    <div class="settings-section">
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

    <div class="settings-section">
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

  const btns = panel.querySelectorAll('.theme-option-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selectedTheme = e.currentTarget.dataset.theme;
      applyTheme(selectedTheme);
      btns.forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
    });
  });

  // Custom Theme Constructor bindings
  const themeBgInput = panel.querySelector('#theme-bg-color');
  const themeTextInput = panel.querySelector('#theme-text-color');
  const themePlayerInput = panel.querySelector('#theme-player-color');
  const themeCardInput = panel.querySelector('#theme-card-color');
  const themeAccentInput = panel.querySelector('#theme-accent-color');
  const themeBlurSlider = panel.querySelector('#theme-blur-slider');
  const themeOpacitySlider = panel.querySelector('#theme-opacity-slider');
  
  function updateCustomThemeFromUI() {
    const customThemeVal = {
      bgColor: themeBgInput.value,
      textColor: themeTextInput.value,
      playerBg: themePlayerInput.value,
      cardBg: themeCardInput.value,
      accentColor: themeAccentInput.value,
      blur: parseInt(themeBlurSlider.value, 10),
      opacity: parseFloat(themeOpacitySlider.value) / 100
    };
    
    panel.querySelector('#blur-val-text').textContent = `${customThemeVal.blur}px`;
    panel.querySelector('#opacity-val-text').textContent = `${Math.round(customThemeVal.opacity * 100)}%`;
    
    applyCustomTheme(customThemeVal);
    localStorage.setItem('gp_custom_theme', JSON.stringify(customThemeVal));
    localStorage.setItem('gp_theme', 'custom');
    
    btns.forEach(b => b.classList.remove('active'));
  }
  
  themeBgInput.addEventListener('input', updateCustomThemeFromUI);
  themeTextInput.addEventListener('input', updateCustomThemeFromUI);
  themePlayerInput.addEventListener('input', updateCustomThemeFromUI);
  themeCardInput.addEventListener('input', updateCustomThemeFromUI);
  themeAccentInput.addEventListener('input', updateCustomThemeFromUI);
  themeBlurSlider.addEventListener('input', updateCustomThemeFromUI);
  themeOpacitySlider.addEventListener('input', updateCustomThemeFromUI);

  panel.querySelector('#theme-export-btn').addEventListener('click', () => {
    const customThemeVal = {
      bgColor: themeBgInput.value,
      textColor: themeTextInput.value,
      playerBg: themePlayerInput.value,
      cardBg: themeCardInput.value,
      accentColor: themeAccentInput.value,
      blur: parseInt(themeBlurSlider.value, 10),
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

  panel.querySelector('#theme-import-btn').addEventListener('click', () => {
    const input = panel.querySelector('#theme-import-input');
    const code = input.value.trim();
    if (!code) return;
    try {
      const decoded = JSON.parse(atob(code));
      if (decoded.bgColor && decoded.textColor && decoded.blur !== undefined && decoded.opacity !== undefined) {
        if (!decoded.playerBg) decoded.playerBg = '#050505';
        if (!decoded.cardBg) decoded.cardBg = '#ffffff';
        if (!decoded.accentColor) decoded.accentColor = decoded.textColor || '#ffffff';

        applyCustomTheme(decoded);
        localStorage.setItem('gp_custom_theme', JSON.stringify(decoded));
        localStorage.setItem('gp_theme', 'custom');
        input.value = '';
        alert('Тема успешно импортирована!');
        renderSettings();
      } else {
        alert('Некорректный код темы');
      }
    } catch (err) {
      console.error(err);
      alert('Не удалось расшифровать код темы');
    }
  });

  // Interface Effects bindings
  const dynamicCoverCheckbox = panel.querySelector('#dynamic-cover-checkbox');
  const visualizerCheckbox = panel.querySelector('#visualizer-checkbox');

  dynamicCoverCheckbox.addEventListener('change', (e) => {
    localStorage.setItem('gp_dynamic_cover', e.target.checked);
    if (e.target.checked) {
      applyDynamicCoverColor();
    } else {
      resetAccentColor();
    }
  });

  visualizerCheckbox.addEventListener('change', (e) => {
    localStorage.setItem('gp_visualizer', e.target.checked);
    if (e.target.checked) {
      initAudioEffects();
      startVisualizer();
    } else {
      stopVisualizer();
    }
  });

  // Audio Effects bindings
  const bassboostCheckbox = panel.querySelector('#effect-bassboost-checkbox');
  const speedSlider = panel.querySelector('#effect-speed-slider');
  const pitchSlider = panel.querySelector('#effect-pitch-slider');
  const pitchLinkedCheckbox = panel.querySelector('#effect-pitch-linked-checkbox');

  bassboostCheckbox.addEventListener('change', (e) => {
    localStorage.setItem('gp_effect_bassboost', e.target.checked);
    initAudioEffects();
    if (bassFilter) {
      bassFilter.gain.value = e.target.checked ? 10 : 0;
    }
  });

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

  tracksContainer.classList.remove('hidden');
  updateActiveTab('settings');
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

function applyCustomTheme(theme) {
  const root = document.documentElement;
  root.style.setProperty('--text-color', theme.textColor);
  root.style.setProperty('--blur-value', `blur(${theme.blur}px)`);
  
  const textDim = hexToRgba(theme.textColor, 0.55);
  root.style.setProperty('--text-dim', textDim);
  root.style.setProperty('--bg-gradient', theme.bgColor);
  
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
  
  const isDarkBg = isColorDark(theme.bgColor);
  if (isDarkBg) {
    root.style.setProperty('--panel-bg', `rgba(0, 0, 0, ${theme.opacity * 0.4})`);
  } else {
    root.style.setProperty('--panel-bg', `rgba(255, 255, 255, ${theme.opacity * 0.4})`);
  }
  root.style.setProperty('--accent-color', accentColorHex);
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
}

// Startup Initialization
loadProfiles();
initAuth();
initEditProfileEventListeners();
loadHomeView();

// Apply Saved Theme on Startup
const savedTheme = localStorage.getItem('gp_theme') || 'theme-dark-glass';
applyTheme(savedTheme);

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

if (window.electronAPI && window.electronAPI.onUpdateStatus) {
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
  if (!window.electronAPI || !window.electronAPI.updatePresence) return;

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
});

audioPlayer.addEventListener('pause', () => {
  sendDiscordPresence();
});

// --- Mini-Player Window Mode listener ---
if (window.electronAPI && window.electronAPI.onMiniPlayerToggled) {
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
if (window.electronAPI && window.electronAPI.onWindowMaximizedStatus) {
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
      const g = imgData[i+1];
      const b = imgData[i+2];
      const a = imgData[i+3];
      
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
        sumG += imgData[i+1];
        sumB += imgData[i+2];
        count++;
      }
      if (count > 0) {
        return `rgb(${Math.round(sumR/count)}, ${Math.round(sumG/count)}, ${Math.round(sumB/count)})`;
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
      currentCover.onload = function() {
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

// --- Audio Visualizer Loop ---
let visualizerAnimationId = null;
const visualizerCanvas = document.getElementById('visualizer-canvas');

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

  visualizerCanvas.classList.remove('hidden');
  resizeCanvas();

  const ctx = visualizerCanvas.getContext('2d');

  function draw() {
    if (localStorage.getItem('gp_visualizer') !== 'true') {
      stopVisualizer();
      return;
    }

    visualizerAnimationId = requestAnimationFrame(draw);

    const width = visualizerCanvas.width;
    const height = visualizerCanvas.height;

    ctx.clearRect(0, 0, width, height);

    if (!analyser || audioPlayer.paused) {
      const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#ffffff';
      ctx.shadowBlur = 0;
      ctx.fillStyle = accentColor;
      ctx.globalAlpha = 0.15;
      
      const numBars = 30;
      const barSpacing = width / numBars;
      const barWidth = barSpacing * 0.4;
      
      for (let i = 0; i < numBars; i++) {
        const x = i * barSpacing + (barSpacing - barWidth) / 2;
        drawRoundedRect(ctx, x, height - 2, barWidth, 2, 1);
      }
      return;
    }

    analyser.getByteFrequencyData(dataArray);

    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#ffffff';

    const numBars = 30;
    const barSpacing = width / numBars;
    const barWidth = barSpacing * 0.4;

    ctx.shadowBlur = 8;
    ctx.shadowColor = accentColor;
    ctx.fillStyle = accentColor;

    for (let i = 0; i < numBars; i++) {
      const dataIndex = Math.floor((i / numBars) * (bufferLength * 0.6));
      const value = dataArray[dataIndex] || 0;

      const percent = value / 255;
      const barHeight = Math.max(2, percent * height * 0.95);

      const x = i * barSpacing + (barSpacing - barWidth) / 2;
      const y = height - barHeight;

      ctx.globalAlpha = 0.25 + percent * 0.55;

      drawRoundedRect(ctx, x, y, barWidth, barHeight, barWidth / 2);
    }
  }

  visualizerAnimationId = requestAnimationFrame(draw);
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

function stopVisualizer() {
  if (visualizerAnimationId) {
    cancelAnimationFrame(visualizerAnimationId);
    visualizerAnimationId = null;
  }
  if (visualizerCanvas) {
    visualizerCanvas.classList.add('hidden');
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
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
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
    const res = await fetch(`${BACKEND_URL}/auth/sync-playlists`, {
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

