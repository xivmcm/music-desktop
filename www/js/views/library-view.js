/**
 * GlassPlayer - Library, Favorites, Local Collection & History View Module
 * Namespace: window.GP.Views.Library
 * Handles Favorites (liked tracks), Local Device Library (IndexedDB/MP3s),
 * Playback History, and Library subtabs.
 */

(function (window) {
  'use strict';

  // Ensure namespaces
  window.GP = window.GP || {};
  window.GP.Views = window.GP.Views || {};

  // Reactive state
  let _likedTrackIds = new Set();
  if (!Object.getOwnPropertyDescriptor(window, 'likedTrackIds')) {
    Object.defineProperty(window, 'likedTrackIds', {
      get: () => _likedTrackIds,
      set: (val) => {
        if (val instanceof Set || (val && typeof val.has === 'function')) {
          _likedTrackIds = val;
        } else if (Array.isArray(val)) {
          _likedTrackIds = new Set(val);
        } else {
          _likedTrackIds = new Set();
        }
      },
      configurable: true
    });
  }

  let _currentLibrarySubTab = 'favorites';
  if (!Object.getOwnPropertyDescriptor(window, 'currentLibrarySubTab')) {
    Object.defineProperty(window, 'currentLibrarySubTab', {
      get: () => _currentLibrarySubTab,
      set: (val) => { _currentLibrarySubTab = val; },
      configurable: true
    });
  }

  // --- Storage Key Helpers ---

  function getStorageSuffix() {
    if (typeof window !== 'undefined' && typeof window.getStorageOwnerSuffix === 'function') {
      return window.getStorageOwnerSuffix();
    }
    if (typeof window !== 'undefined' && window.currentUser) {
      const id = window.currentUser.id || window.currentUser._id || window.currentUser.username;
      return `account_${String(id || 'unknown').replace(/[^a-z0-9_-]/gi, '_')}`;
    }
    return (typeof window !== 'undefined' && window.currentProfile) || 'Default';
  }

  function getLikesStorageKey() {
    if (typeof window !== 'undefined' && typeof window.getStorageKey === 'function') {
      return window.getStorageKey('likes');
    }
    return `gp_likes_${getStorageSuffix()}`;
  }

  function getHistoryStorageKey() {
    if (typeof window !== 'undefined' && typeof window.getStorageKey === 'function') {
      return window.getStorageKey('history');
    }
    return `gp_history_${getStorageSuffix()}`;
  }

  function escapeHTML(str) {
    if (typeof window !== 'undefined' && typeof window.escapeHTML === 'function') {
      return window.escapeHTML(str);
    }
    if (window.GP && window.GP.Utils && typeof window.GP.Utils.escapeHTML === 'function') {
      return window.GP.Utils.escapeHTML(str);
    }
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTrackCount(count) {
    if (window.GP && window.GP.Utils && typeof window.GP.Utils.formatTrackCount === 'function') {
      return window.GP.Utils.formatTrackCount(count);
    }
    if (typeof window.formatTrackCount === 'function') {
      return window.formatTrackCount(count);
    }
    return `${count} треков`;
  }

  function showToast(msg, type, title) {
    const toast = typeof window !== 'undefined' && window.showToastNotification;
    if (typeof toast === 'function') {
      toast(msg, type, title);
    } else {
      console.log(`[Toast ${type || 'info'}]: ${title ? title + ' - ' : ''}${msg}`);
    }
  }

  // --- Liked Tracks Storage Accessors ---

  function getLikedTracks() {
    const key = getLikesStorageKey();
    const data = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    try {
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  function saveLikedTracks(tracks) {
    const key = getLikesStorageKey();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(tracks));
    }
  }

  async function loadLikedTracks() {
    const currentUser = typeof window !== 'undefined' && window.currentUser;
    if (currentUser) {
      const cloudLikes = Array.isArray(currentUser.likedTracks) ? currentUser.likedTracks : [];
      saveLikedTracks(cloudLikes);
      _likedTrackIds = new Set(cloudLikes.map(t => t.id));
    } else {
      const likes = getLikedTracks();
      _likedTrackIds = new Set(likes.map(t => t.id));
    }
    if (typeof window !== 'undefined') {
      window.likedTrackIds = _likedTrackIds;
    }
    return Array.from(_likedTrackIds);
  }

  // --- Like UI State Synchronization ---

  function updateLikeUI(trackId) {
    const isLiked = _likedTrackIds.has(trackId);
    const heartSvgEmpty = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
    const heartSvgFilled = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>`;

    if (typeof document === 'undefined') return;

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
    const playlist = (typeof window !== 'undefined' && window.playlist) || [];
    const currentTrackIndex = (typeof window !== 'undefined' && typeof window.currentTrackIndex === 'number') ? window.currentTrackIndex : -1;
    const playingTrack = playlist[currentTrackIndex];

    if (playerLikeBtn && playingTrack && playingTrack.id === trackId) {
      if (isLiked) {
        playerLikeBtn.classList.add('liked');
        playerLikeBtn.innerHTML = heartSvgFilled;
      } else {
        playerLikeBtn.classList.remove('liked');
        playerLikeBtn.innerHTML = heartSvgEmpty;
      }
    }

    // 3. Update mini-player like button
    const miniLikeButton = document.getElementById('mini-like-btn');
    if (miniLikeButton && playingTrack && playingTrack.id === trackId) {
      miniLikeButton.classList.toggle('liked', isLiked);
      miniLikeButton.setAttribute('aria-pressed', String(isLiked));
      miniLikeButton.setAttribute('aria-label', isLiked ? 'Убрать из избранного' : 'Добавить в избранное');
      miniLikeButton.innerHTML = isLiked ? heartSvgFilled : heartSvgEmpty;
    }
  }

  function isTrackLiked(trackId) {
    return _likedTrackIds.has(trackId);
  }

  function toggleLike(e, track) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (!track || !track.id) return;

    const isLiked = _likedTrackIds.has(track.id);
    let likes = getLikedTracks();

    if (isLiked) {
      likes = likes.filter(t => t.id !== track.id);
      _likedTrackIds.delete(track.id);
    } else {
      likes.unshift({
        id: track.id,
        title: track.title,
        artist: track.artist,
        source: track.source,
        thumbnail: track.thumbnail,
        duration: track.duration
      });
      _likedTrackIds.add(track.id);
    }

    saveLikedTracks(likes);

    if (typeof window.invalidateHomeRecommendations === 'function') {
      window.invalidateHomeRecommendations();
    }

    const currentUser = typeof window !== 'undefined' && window.currentUser;
    const token = typeof window !== 'undefined' && window.token;
    if (currentUser && token) {
      currentUser.likedTracks = likes;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('auth_user', JSON.stringify(currentUser));
      }
      if (typeof window.syncLikesWithBackend === 'function') {
        window.syncLikesWithBackend(likes);
      } else if (window.GP && window.GP.Social && window.GP.Social.Auth && typeof window.GP.Social.Auth.syncLikesWithBackend === 'function') {
        window.GP.Social.Auth.syncLikesWithBackend(likes);
      }
    }

    updateLikeUI(track.id);

    const activeView = (typeof window !== 'undefined' && window.activeView) || '';
    if (activeView === 'library') {
      loadFavorites(_currentLibrarySubTab);
    }
  }

  // --- Favorites & Local Collection View ---

  function bindLibrarySubTabEvents() {
    const btnFavs = document.getElementById('lib-subtab-favs');
    const btnLocal = document.getElementById('lib-subtab-local');
    if (btnFavs) btnFavs.addEventListener('click', () => loadFavorites('favorites'));
    if (btnLocal) btnLocal.addEventListener('click', () => loadFavorites('local'));
  }

  async function loadFavorites(subTab = 'favorites') {
    _currentLibrarySubTab = subTab;
    if (typeof window !== 'undefined') {
      window.currentLibrarySubTab = subTab;
      window.activeView = 'library';
    }

    const searchInput = document.getElementById('search-input');
    const welcomeScreen = document.getElementById('welcome-screen');
    const tracksContainer = document.getElementById('tracks-container');
    const loadingIndicator = document.getElementById('loading-indicator');

    if (searchInput) searchInput.value = '';
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    if (tracksContainer) tracksContainer.classList.add('hidden');
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

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
      if (loadingIndicator) loadingIndicator.classList.add('hidden');
      if (!tracksContainer) return;

      tracksContainer.innerHTML = subTabsHeader;
      bindLibrarySubTabEvents();

      const favsGrid = document.createElement('div');
      favsGrid.className = 'tracks-layout-grid';
      tracksContainer.appendChild(favsGrid);

      if (likes && likes.length > 0) {
        if (typeof window !== 'undefined') window.playlist = likes;
        if (typeof window.renderTracks === 'function') {
          window.renderTracks(likes, favsGrid);
        }
      } else {
        if (typeof window !== 'undefined') window.playlist = [];
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'welcome-state';
        emptyDiv.innerHTML = '<h2>Избранное пусто</h2><p>Нажмите сердечко на любом треке, чтобы добавить его сюда</p>';
        tracksContainer.appendChild(emptyDiv);
      }
      tracksContainer.classList.remove('hidden');
    } else {
      let localTracks = [];
      if (window.GP && window.GP.LocalDB && typeof window.GP.LocalDB.getLocalTracks === 'function') {
        localTracks = await window.GP.LocalDB.getLocalTracks();
      } else if (typeof window.getLocalTracks === 'function') {
        localTracks = await window.getLocalTracks();
      }

      if (loadingIndicator) loadingIndicator.classList.add('hidden');
      if (!tracksContainer) return;

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
        const query = (localSearch?.value || '').trim().toLocaleLowerCase('ru');
        const sortMode = localSort?.value || 'recent';
        const filtered = localTracks.filter((track) => {
          const searchable = `${track.title || ''} ${track.artist || ''}`.toLocaleLowerCase('ru');
          return !query || searchable.includes(query);
        });
        filtered.sort((a, b) => {
          if (sortMode === 'title') return (a.title || '').localeCompare(b.title || '', 'ru');
          if (sortMode === 'artist') return (a.artist || '').localeCompare(b.artist || '', 'ru');
          return (b.addedAt || 0) - (a.addedAt || 0);
        });
        if (localCount) localCount.textContent = formatTrackCount(filtered.length);
        if (typeof window !== 'undefined') window.playlist = filtered;
        renderLocalTracks(filtered, query ? 'По вашему запросу ничего не найдено' : 'На устройстве пока нет музыки');
      };

      if (uploadBtn && filePicker) {
        uploadBtn.addEventListener('click', () => filePicker.click());
      }
      if (localSearch) localSearch.addEventListener('input', renderLocalCollection);
      if (localSort) localSort.addEventListener('change', renderLocalCollection);

      if (filePicker) {
        filePicker.addEventListener('change', async (e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) {
            if (uploadBtn) uploadBtn.disabled = true;
            showToast(`Обрабатываем файлов: ${files.length}`, 'info', 'Медиатека');
            try {
              if (window.GP && window.GP.LocalDB && typeof window.GP.LocalDB.importLocalAudioFiles === 'function') {
                await window.GP.LocalDB.importLocalAudioFiles(files);
              } else if (typeof window.importLocalAudioFiles === 'function') {
                await window.importLocalAudioFiles(files);
              }
              await loadFavorites('local');
            } finally {
              if (uploadBtn) uploadBtn.disabled = false;
              filePicker.value = '';
            }
          }
        });
      }

      renderLocalCollection();
      tracksContainer.classList.remove('hidden');
    }

    if (typeof window.updateActiveTab === 'function') {
      window.updateActiveTab('library');
    }
  }

  function renderLocalTracks(tracks, emptyMessage = 'На устройстве пока нет музыки') {
    const tracksContainer = document.getElementById('tracks-container');
    if (!tracksContainer) return;

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
    if (typeof window.renderTracks === 'function') {
      window.renderTracks(tracks, gridContainer);
    }
    tracksContainer.appendChild(gridContainer);
  }

  // --- Playback History Logic ---

  function getPlayHistory() {
    const key = getHistoryStorageKey();
    const data = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    try {
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  function savePlayHistory(tracks) {
    const key = getHistoryStorageKey();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(tracks));
    }
  }

  function addToHistory(track) {
    if (!track || !track.id) return;
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

    if (typeof window.invalidateHomeRecommendations === 'function') {
      window.invalidateHomeRecommendations();
    }

    const activeView = (typeof window !== 'undefined' && window.activeView) || '';
    if (activeView === 'history') {
      const playlist = (typeof window !== 'undefined' && window.playlist) || [];
      const isPlayingFromHistoryQueue = playlist.some(t => t && t.id === track.id);
      if (!isPlayingFromHistoryQueue) {
        renderHistory();
      }
    }
  }

  function clearHistory() {
    savePlayHistory([]);
    const activeView = (typeof window !== 'undefined' && window.activeView) || '';
    if (activeView === 'history') {
      renderHistory();
    }
    showToast('История воспроизведения очищена.', 'info', 'История');
  }

  function loadHistoryView() {
    if (typeof window !== 'undefined') window.activeView = 'history';
    const searchInput = document.getElementById('search-input');
    const welcomeScreen = document.getElementById('welcome-screen');
    const tracksContainer = document.getElementById('tracks-container');
    const loadingIndicator = document.getElementById('loading-indicator');

    if (searchInput) searchInput.value = '';
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    if (tracksContainer) tracksContainer.classList.add('hidden');
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    setTimeout(() => {
      renderHistory();
    }, 200);
  }

  function renderHistory() {
    const loadingIndicator = document.getElementById('loading-indicator');
    const tracksContainer = document.getElementById('tracks-container');

    if (loadingIndicator) loadingIndicator.classList.add('hidden');
    if (!tracksContainer) return;

    tracksContainer.innerHTML = '';
    const history = getPlayHistory();

    const viewHeader = document.createElement('div');
    viewHeader.className = 'view-header';
    viewHeader.innerHTML = `
      <div class="view-header-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        <span>История воспроизведения</span>
      </div>
      ${history && history.length > 0 ? `
      <div class="view-header-actions">
        <button id="clear-history-btn" class="view-btn danger" style="padding: 4px 10px; font-size: 11px; height: auto;">
          <span>Очистить историю</span>
        </button>
      </div>` : ''}
    `;
    tracksContainer.appendChild(viewHeader);

    const clearBtn = document.getElementById('clear-history-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        clearHistory();
      });
    }

    if (history && history.length > 0) {
      if (typeof window !== 'undefined') window.playlist = history;
      const historyGrid = document.createElement('div');
      historyGrid.className = 'tracks-layout-grid';
      tracksContainer.appendChild(historyGrid);

      if (typeof window.renderTracks === 'function') {
        window.renderTracks(history, historyGrid);
      }
      tracksContainer.classList.remove('hidden');
    } else {
      if (typeof window !== 'undefined') window.playlist = [];
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'welcome-state';
      emptyDiv.innerHTML = '<h2>История прослушиваний пуста</h2><p>Воспроизведите треки, чтобы сформировать историю</p>';
      tracksContainer.appendChild(emptyDiv);
      tracksContainer.classList.remove('hidden');
    }

    if (typeof window.updateActiveTab === 'function') {
      window.updateActiveTab('history');
    }
  }

  // Bind navigation button listeners
  function bindLibraryNavListeners() {
    if (typeof document === 'undefined') return;
    const favoritesBtn = document.getElementById('favorites-button');
    const historyBtn = document.getElementById('history-button');

    if (favoritesBtn && !favoritesBtn.dataset.gpLibBound) {
      favoritesBtn.dataset.gpLibBound = '1';
      favoritesBtn.addEventListener('click', () => loadFavorites(_currentLibrarySubTab));
    }
    if (historyBtn && !historyBtn.dataset.gpHistBound) {
      historyBtn.dataset.gpHistBound = '1';
      historyBtn.addEventListener('click', loadHistoryView);
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindLibraryNavListeners);
    } else {
      bindLibraryNavListeners();
    }
  }

  // Register on window.GP.Views.Library
  window.GP.Views.Library = {
    getLikedTracks,
    saveLikedTracks,
    loadLikedTracks,
    toggleLike,
    updateLikeUI,
    isTrackLiked,
    loadFavorites,
    renderFavoritesView: loadFavorites,
    renderLocalTracks,
    getPlayHistory,
    savePlayHistory,
    addToHistory,
    clearHistory,
    loadHistoryView,
    renderHistory,
    getHistory: getPlayHistory,
    getCurrentLibrarySubTab: () => _currentLibrarySubTab,
    setCurrentLibrarySubTab: (tab) => { _currentLibrarySubTab = tab; if (typeof window !== 'undefined') window.currentLibrarySubTab = tab; }
  };

  // Direct aliases on window for 100% backward compatibility
  window.getLikedTracks = getLikedTracks;
  window.saveLikedTracks = saveLikedTracks;
  window.loadLikedTracks = loadLikedTracks;
  window.toggleLike = toggleLike;
  window.updateLikeUI = updateLikeUI;
  window.isTrackLiked = isTrackLiked;
  window.loadFavorites = loadFavorites;
  window.renderFavoritesView = loadFavorites;
  window.renderLocalCollection = loadFavorites;
  window.renderLocalTracks = renderLocalTracks;
  window.getPlayHistory = getPlayHistory;
  window.savePlayHistory = savePlayHistory;
  window.addToHistory = addToHistory;
  window.clearHistory = clearHistory;
  window.loadHistoryView = loadHistoryView;
  window.renderHistory = renderHistory;

})(typeof window !== 'undefined' ? window : global);
