const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const tracksContainer = document.getElementById('tracks-container');
const welcomeScreen = document.getElementById('welcome-screen');
const loadingIndicator = document.getElementById('loading-indicator');
const favoritesButton = document.getElementById('favorites-button');

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

// Base Server API URL Configuration
const API_URL = 'https://music-backend-iyni.onrender.com';
const BACKEND_URL = `${API_URL}/api`;

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
  addToSearchHistory(query);
  searchHistoryDropdown.classList.add('hidden');

  // Toggle Loading State
  welcomeScreen.classList.add('hidden');
  tracksContainer.classList.add('hidden');
  loadingIndicator.classList.remove('hidden');

  try {
    // Refresh likes list first so search displays correct states
    await loadLikedTracks();

    const response = await fetch(`${BACKEND_URL}/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();

    loadingIndicator.classList.add('hidden');

    if (data.status === 'success' && data.results && data.results.length > 0) {
      playlist = data.results;
      renderTracks(playlist);
      tracksContainer.classList.remove('hidden');
    } else {
      playlist = [];
      tracksContainer.innerHTML = '<div class="welcome-state"><h2>No results found</h2><p>Try searching for something else</p></div>';
      tracksContainer.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Search error:', error);
    loadingIndicator.classList.add('hidden');
    tracksContainer.innerHTML = '<div class="welcome-state"><h2>Не удалось подключиться к серверу</h2><p>Проверьте соединение с интернетом</p></div>';
    tracksContainer.classList.remove('hidden');
  }
}

// 2. Render Results
function renderTracks(tracks, container = null) {
  const targetContainer = container || tracksContainer;
  targetContainer.innerHTML = '';
  
  tracks.forEach((track, index) => {
    const card = document.createElement('div');
    const currentTrack = playlist[currentTrackIndex];
    const isActive = currentTrack && track.id === currentTrack.id;
    card.className = `track-card ${isActive ? 'active' : ''}`;
    card.dataset.index = index;
    card.dataset.trackId = track.id;

    const coverUrl = track.thumbnail
      ? `${BACKEND_URL}/cover?url=${encodeURIComponent(track.thumbnail)}`
      : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23222"/><path d="M30 30 L70 50 L30 70 Z" fill="%23444"/></svg>';

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
      ? `<span class="artist-link" data-artist-id="${track.artistId}">${track.artist}</span>`
      : `<span>${track.artist}</span>`;

    card.innerHTML = `
      <img src="${coverUrl}" class="card-cover" alt="${track.title}">
      <div class="card-details">
        <div class="card-title">${track.title}</div>
        <div class="card-artist">${artistHTML}</div>
        <div class="card-meta">
          <span class="badge ${track.source}">${track.source}</span>
          <span class="card-duration">${track.duration}</span>
        </div>
      </div>
      ${actionsHTML}
      <button class="like-btn ${isLiked ? 'liked' : ''}">${heartIcon}</button>
    `;

    card.addEventListener('click', (e) => {
      // Don't play if clicking the like, playlist or artist link button itself
      if (e.target.closest('.like-btn') || e.target.closest('.playlist-add-btn') || e.target.closest('.playlist-remove-track-btn') || e.target.closest('.artist-link')) return;
      playTrack(index);
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

    targetContainer.appendChild(card);
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
  
  currentCover.src = track.thumbnail
    ? `${BACKEND_URL}/cover?url=${encodeURIComponent(track.thumbnail)}`
    : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23222"/><path d="M30 30 L70 50 L30 70 Z" fill="%23444"/></svg>';

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
  
  const playPromise = audioPlayer.play();
  currentPlayPromise = playPromise;

  playPromise
    .then(() => {
      if (currentPlayPromise === playPromise) {
        setPlayState(true);
      }
    })
    .catch(err => {
      if (err.name === 'AbortError') {
        return; // Ignore abort exceptions from consecutive clicks
      }
      console.error('Playback failed:', err);
      // Only call playNext if this is still the active track's promise
      if (currentPlayPromise === playPromise) {
        playNext();
      }
    });
}

function setPlayState(isPlaying) {
  if (isPlaying) {
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
  } else {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
  }
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

playButton.addEventListener('click', togglePlay);
nextButton.addEventListener('click', playNext);
prevButton.addEventListener('click', playPrev);

// Audio Player Events
audioPlayer.addEventListener('loadedmetadata', () => {
  progressSlider.max = 100;
});

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
  } else {
    progressSlider.value = 0;
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
  return `gp_${key}_${currentProfile}`;
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

function savePlaylists(playlists) {
  localStorage.setItem(getStorageKey('playlists'), JSON.stringify(playlists));
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

// Liked tracks services logic (using client-side localStorage)
async function loadLikedTracks() {
  const likes = getLikedTracks();
  likedTrackIds = new Set(likes.map(t => t.id));
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
    grid.className = 'tracks-grid';
    
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
    listGrid.className = 'tracks-grid';
    tracksContainer.appendChild(listGrid);
    
    renderTracks(playlist, listGrid);
  } else {
    playlist = [];
    const emptyState = document.createElement('div');
    emptyState.className = 'welcome-state';
    emptyState.innerHTML = '<h2>This playlist is empty</h2><p>Add tracks here using the "+" button on search results</p>';
    tracksContainer.appendChild(emptyState);
  }
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
    const response = await fetch(`${BACKEND_URL}/search/home`);
    const data = await response.json();
    loadingIndicator.classList.add('hidden');

    if (data.status === 'success' && data.results) {
      renderHome(data.results);
      tracksContainer.classList.remove('hidden');
    } else {
      tracksContainer.innerHTML = '<div class="welcome-state"><h2>Не удалось загрузить рекомендации</h2><p>Пожалуйста, проверьте соединение с бэкендом</p></div>';
      tracksContainer.classList.remove('hidden');
    }
  } catch (error) {
    console.error('[Renderer] Failed to load home screen recommendations:', error);
    loadingIndicator.classList.add('hidden');
    tracksContainer.innerHTML = '<div class="welcome-state"><h2>Не удалось подключиться к серверу</h2><p>Проверьте соединение с интернетом</p></div>';
    tracksContainer.classList.remove('hidden');
  }
}

function renderHome(sectionsData) {
  tracksContainer.innerHTML = '';

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
    tracksContainer.appendChild(sectionEl);
  });
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

    const coverUrl = track.thumbnail
      ? `${BACKEND_URL}/cover?url=${encodeURIComponent(track.thumbnail)}`
      : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23222"/><path d="M30 30 L70 50 L30 70 Z" fill="%23444"/></svg>';
    const isLiked = likedTrackIds.has(track.id);
    const heartIcon = isLiked 
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;

    const artistHTML = track.artistId && track.source === 'soundcloud'
      ? `<span class="artist-link" data-artist-id="${track.artistId}">${track.artist}</span>`
      : `<span>${track.artist}</span>`;

    card.innerHTML = `
      <img src="${coverUrl}" class="card-cover" alt="${track.title}">
      <div class="card-details">
        <div class="card-title">${track.title}</div>
        <div class="card-artist">${artistHTML}</div>
        <div class="card-meta">
          <span class="badge ${track.source}">${track.source}</span>
          <span class="card-duration">${track.duration}</span>
        </div>
      </div>
      <button class="playlist-add-btn" title="Add to Playlist">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>
      <button class="like-btn ${isLiked ? 'liked' : ''}">${heartIcon}</button>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.like-btn') || e.target.closest('.playlist-add-btn') || e.target.closest('.artist-link')) return;
      playlist = sectionTracks;
      playTrack(index);
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
  } catch (error) {
    console.error('[Renderer] Failed to load artist view:', error);
    loadingIndicator.classList.add('hidden');
    tracksContainer.innerHTML = '<div class="welcome-state"><h2>Ошибка сети</h2><p>Не удалось подключиться к серверу</p></div>';
    tracksContainer.classList.remove('hidden');
  }
}

function renderArtistProfile(artistData) {
  tracksContainer.innerHTML = '';
  
  const header = document.createElement('div');
  header.className = 'artist-header';
  header.innerHTML = `
    <img class="artist-avatar" src="${artistData.avatar || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'40\' fill=\'%23333\'/></svg>'}" alt="${artistData.name}">
    <div class="artist-info">
      <button id="back-to-previous" class="view-btn" style="align-self: flex-start; margin-bottom: 8px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        <span>Назад</span>
      </button>
      <h2>${artistData.name}</h2>
      <span class="artist-meta">${artistData.followers.toLocaleString()} подписчиков</span>
      <p class="artist-desc">${artistData.description || 'Описание отсутствует.'}</p>
    </div>
  `;
  tracksContainer.appendChild(header);
  
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
    tracksGrid.className = 'tracks-grid';
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
        listGrid.className = 'tracks-grid';
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
  if (history.length === 0 || searchInput.value.trim() !== '') {
    searchHistoryDropdown.classList.add('hidden');
    return;
  }

  searchHistoryDropdown.innerHTML = `
    <div class="search-history-header">
      <span>История поиска</span>
      <span class="search-history-clear" id="clear-history-btn">Очистить</span>
    </div>
  `;

  history.forEach(q => {
    const item = document.createElement('div');
    item.className = 'search-history-item';
    item.innerHTML = `
      <span class="history-query-text">${q}</span>
      <span class="search-history-delete" data-query="${q}">✕</span>
    `;

    item.querySelector('.history-query-text').addEventListener('click', () => {
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

  document.getElementById('clear-history-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    clearSearchHistory();
  });

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

  const viewHeader = document.createElement('div');
  viewHeader.className = 'view-header';
  viewHeader.innerHTML = `
    <div class="view-header-title">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
      <span>Настройки</span>
    </div>
  `;
  tracksContainer.appendChild(viewHeader);

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

  tracksContainer.classList.remove('hidden');
}

function applyTheme(themeName) {
  document.body.classList.remove('theme-dark-glass', 'theme-pink-white', 'theme-silver-matrix');
  document.body.classList.add(themeName);
  localStorage.setItem('gp_theme', themeName);
}

// Startup Initialization
loadProfiles();
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
