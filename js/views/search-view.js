/**
 * GlassPlayer Search View Module
 * Handles search queries, SoundCloud/Spotify multi-source results,
 * search history autocomplete dropdown, pagination, and infinite scrolling.
 */
(function (root) {
  'use strict';

  // Ensure window.GP.Views namespace
  const GP = root.GP = root.GP || {};
  GP.Views = GP.Views || {};
  GP.Views.Search = GP.Views.Search || {};

  const DEFAULT_AVATAR_54 = 'data:image/svg+xml;base64,' + (typeof btoa !== 'undefined'
    ? btoa('<svg xmlns="http://www.w3.org/2000/svg" width="54" height="54" viewBox="0 0 54 54"><circle cx="27" cy="27" r="25" fill="#333"/><path d="M27 24a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0 4c-8 0-11 5-11 9v2h22v-2c0-4-3-9-11-9z" fill="#666"/></svg>')
    : '');

  // --- State Variables ---
  let _activeSources = { soundcloud: true, spotify: false };
  let _currentSearchPage = 1;
  let _isLoadingMore = false;
  const DEFAULT_MAX_TRACKS = 80;

  // Define reactive properties on window
  if (!Object.getOwnPropertyDescriptor(root, 'activeSources')) {
    Object.defineProperty(root, 'activeSources', {
      get: () => _activeSources,
      set: (val) => {
        if (val && typeof val === 'object') {
          _activeSources = val;
        }
      },
      configurable: true,
      enumerable: true
    });
  }

  if (!Object.getOwnPropertyDescriptor(root, 'currentSearchPage')) {
    Object.defineProperty(root, 'currentSearchPage', {
      get: () => _currentSearchPage,
      set: (val) => { _currentSearchPage = Number(val) || 1; },
      configurable: true,
      enumerable: true
    });
  }

  // --- Helpers ---

  function getStorageKey(key) {
    if (typeof root.getStorageKey === 'function') {
      return root.getStorageKey(key);
    }
    const owner = typeof root.getStorageOwnerSuffix === 'function' ? root.getStorageOwnerSuffix() : 'guest';
    return `gp_${key}_${owner}`;
  }

  function escapeHTML(str) {
    if (root.GP?.Utils?.escapeHtml) return root.GP.Utils.escapeHtml(str);
    if (typeof root.escapeHTML === 'function') return root.escapeHTML(str);
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getBackendUrl() {
    return root.BACKEND_URL || root.API_URL || 'https://glassplayer-backend.onrender.com';
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
    if (typeof root.fetchWithTimeout === 'function') {
      return root.fetchWithTimeout(url, options, timeoutMs);
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const fetchOpts = controller ? { ...options, signal: controller.signal } : options;
      return await fetch(url, fetchOpts);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function getDirectSCEngine() {
    return root.DirectSoundCloudEngine || (typeof DirectSoundCloudEngine !== 'undefined' ? DirectSoundCloudEngine : null);
  }

  // --- Search History Logic ---

  function getSearchHistory() {
    try {
      const data = localStorage.getItem(getStorageKey('search_history'));
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function saveSearchHistory(history) {
    try {
      localStorage.setItem(getStorageKey('search_history'), JSON.stringify(history));
    } catch (e) {}
  }

  function addToSearchHistory(query) {
    const cleaned = String(query || '').trim();
    if (!cleaned) return;

    let history = getSearchHistory();
    history = history.filter(q => q.toLowerCase() !== cleaned.toLowerCase());
    history.unshift(cleaned);
    if (history.length > 5) {
      history = history.slice(0, 5);
    }
    saveSearchHistory(history);

    if (typeof root.invalidateHomeRecommendations === 'function') {
      root.invalidateHomeRecommendations();
    } else if (root.GP?.Views?.Home?.invalidateHomeRecommendations) {
      root.GP.Views.Home.invalidateHomeRecommendations();
    }
  }

  function deleteSearchHistoryItem(query) {
    let history = getSearchHistory();
    history = history.filter(q => q !== query);
    saveSearchHistory(history);
    showSearchHistory();
  }

  function clearSearchHistory() {
    saveSearchHistory([]);
    const searchHistoryDropdown = document.getElementById('search-history-dropdown');
    if (searchHistoryDropdown) searchHistoryDropdown.classList.add('hidden');
  }

  function showSearchHistory() {
    const searchHistoryDropdown = document.getElementById('search-history-dropdown');
    const searchInput = document.getElementById('search-input');
    if (!searchHistoryDropdown) return;

    const history = getSearchHistory();
    if (searchInput && searchInput.value.trim() !== '') {
      searchHistoryDropdown.classList.add('hidden');
      return;
    }

    searchHistoryDropdown.innerHTML = '';

    // 1. Sources Selection Row
    const sourcesContainer = document.createElement('div');
    sourcesContainer.className = 'dropdown-sources-container';
    sourcesContainer.innerHTML = `
      <div class="search-history-header">Источники поиска</div>
      <div class="dropdown-sources-row">
        <button id="source-sc" class="source-pill ${_activeSources.soundcloud ? 'active' : ''}" title="SoundCloud">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.95 14.47c0-2.45-1.92-4.44-4.29-4.44h-.35c-.48-2.61-2.73-4.6-5.46-4.6-2.58 0-4.73 1.83-5.32 4.26-.26-.06-.53-.09-.81-.09-2.58 0-4.67 2.09-4.67 4.67 0 .16.01.32.02.48C1.29 14.53 0 16.03 0 17.84c0 2.08 1.68 3.76 3.76 3.76h16.5c1.96 0 3.69-1.55 3.69-3.51 0-1.74-1.28-3.18-2.97-3.52z"/></svg>
        </button>
        <button id="source-sp" class="source-pill ${_activeSources.spotify ? 'active' : ''}" title="Spotify">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.377-1.454-5.37-1.783-8.894-.978-.335.077-.67-.134-.746-.47-.077-.335.134-.67.47-.746 3.847-.88 7.143-.51 9.814 1.127.294.18.387.563.207.857s-.563.387-.857.207zm1.225-2.72c-.227.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.082-1.182-.413.125-.847-.107-.972-.52-.125-.413.107-.847.52-.972 3.676-1.116 8.243-.57 11.348 1.337.367.227.487.707.26 1.074zm.107-2.834C14.484 8.7 8.012 8.483 4.262 9.622c-.573.173-1.182-.154-1.355-.727-.173-.573.154-1.182.727-1.355 4.3-1.305 11.442-1.055 15.534 1.373.515.305.683.97.378 1.485-.305.515-.97.683-1.485.378z"/></svg>
        </button>
      </div>
    `;
    searchHistoryDropdown.appendChild(sourcesContainer);

    const sourceScBtn = sourcesContainer.querySelector('#source-sc');
    const sourceSpBtn = sourcesContainer.querySelector('#source-sp');

    [
      { btn: sourceScBtn, name: 'soundcloud' },
      { btn: sourceSpBtn, name: 'spotify' }
    ].forEach(({ btn, name }) => {
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const activeCount = Object.values(_activeSources).filter(Boolean).length;
          if (activeCount === 1 && _activeSources[name]) {
            return; // Prevent deselecting last source
          }
          _activeSources[name] = !_activeSources[name];
          if (typeof root !== 'undefined') root.activeSources = _activeSources;
          btn.classList.toggle('active', _activeSources[name]);
        });
      }
    });

    // 2. Query History List
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
          <span class="history-query-text">${escapeHTML(q)}</span>
          <span class="search-history-delete" data-query="${escapeHTML(q)}">✕</span>
        `;

        item.addEventListener('click', (e) => {
          if (e.target.closest('.search-history-delete')) return;
          if (searchInput) searchInput.value = q;
          searchHistoryDropdown.classList.add('hidden');
          performSearch(q);
        });

        item.querySelector('.search-history-delete')?.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteSearchHistoryItem(q);
        });

        searchHistoryDropdown.appendChild(item);
      });

      historyHeader.querySelector('#clear-history-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        clearSearchHistory();
      });
    }

    searchHistoryDropdown.classList.remove('hidden');
  }

  // --- Search Execution & Pagination Engine ---

  async function performSearch(customQuery) {
    const searchInput = document.getElementById('search-input');
    const query = (typeof customQuery === 'string' ? customQuery : (searchInput ? searchInput.value : '')).trim();
    if (!query) return;

    if (typeof root !== 'undefined') root.activeView = 'search';
    _currentSearchPage = 1;
    if (typeof root !== 'undefined') root.currentSearchPage = 1;
    addToSearchHistory(query);

    const searchHistoryDropdown = document.getElementById('search-history-dropdown');
    if (searchHistoryDropdown) searchHistoryDropdown.classList.add('hidden');

    const welcomeScreen = document.getElementById('welcome-screen');
    const tracksContainer = document.getElementById('tracks-container');
    const loadingIndicator = document.getElementById('loading-indicator');

    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    if (tracksContainer) tracksContainer.classList.add('hidden');
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    // Remove existing Load More elements
    const existingBtn = document.getElementById('load-more-btn');
    if (existingBtn) existingBtn.remove();
    const existingMsg = document.getElementById('load-more-limit-msg');
    if (existingMsg) existingMsg.remove();

    const sources = [];
    if (_activeSources.soundcloud) sources.push('soundcloud');
    if (_activeSources.spotify) sources.push('spotify');
    const sourcesStr = sources.join(',');

    try {
      if (typeof root.loadLikedTracks === 'function') {
        await root.loadLikedTracks();
      } else if (root.GP?.Views?.Library?.loadLikedTracks) {
        await root.GP.Views.Library.loadLikedTracks();
      }

      let results = [];
      let users = [];

      const backendUrl = getBackendUrl();
      try {
        const response = await fetchWithTimeout(`${backendUrl}/search?q=${encodeURIComponent(query)}&sources=${sourcesStr}&page=1&limit=20`, {}, 1800);
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

      const directSCEngine = getDirectSCEngine();
      if (results.length === 0 && _activeSources.soundcloud && directSCEngine && typeof directSCEngine.search === 'function') {
        try {
          console.log('[Search] Querying DirectSoundCloudEngine for:', query);
          results = await directSCEngine.search(query, 20, 0);
        } catch (scErr) {
          console.error('[Search] DirectSoundCloudEngine search failed:', scErr.message);
        }
      }

      if (loadingIndicator) loadingIndicator.classList.add('hidden');

      renderSearchResults({ query, results, users });

      if (typeof root.updateActiveTab === 'function') {
        root.updateActiveTab('search');
      }
    } catch (error) {
      console.error('Search error:', error);
      if (loadingIndicator) loadingIndicator.classList.add('hidden');
      if (tracksContainer) {
        tracksContainer.innerHTML = '<div class="welcome-state"><h2>Ошибка поиска</h2><p>Не удалось получить результаты. Проверьте подключение.</p></div>';
        tracksContainer.classList.remove('hidden');
      }
      if (typeof root.updateActiveTab === 'function') {
        root.updateActiveTab('search');
      }
    }
  }

  function renderSearchResults({ query, results = [], users = [] }) {
    const tracksContainer = document.getElementById('tracks-container');

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
            if (typeof root.loadFriendProfile === 'function') {
              root.loadFriendProfile(user._id || user.id);
            } else if (root.GP?.Views?.Playlists?.loadFriendProfile) {
              root.GP.Views.Playlists.loadFriendProfile(user._id || user.id);
            }
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
      root.playlist = results;
      if (typeof root.renderTracks === 'function') {
        root.renderTracks(root.playlist);
      }
      if (tracksContainer) tracksContainer.classList.remove('hidden');
      updateLoadMoreButton(results.length);
    } else {
      root.playlist = [];
      if (tracksContainer) {
        tracksContainer.innerHTML = '<div class="welcome-state"><h2>Ничего не найдено</h2><p>Попробуйте изменить поисковый запрос</p></div>';
        tracksContainer.classList.remove('hidden');
      }
    }
  }

  function updateLoadMoreButton(resultsCount) {
    const tracksContainer = document.getElementById('tracks-container');
    if (!tracksContainer) return;

    const existingBtn = document.getElementById('load-more-btn');
    if (existingBtn) existingBtn.remove();
    const existingMsg = document.getElementById('load-more-limit-msg');
    if (existingMsg) existingMsg.remove();

    const currentTracks = Array.isArray(root.playlist) ? root.playlist : [];
    const maxLimit = root.maxTracksLimit || DEFAULT_MAX_TRACKS;

    if (currentTracks.length >= maxLimit) {
      const msg = document.createElement('div');
      msg.id = 'load-more-limit-msg';
      msg.className = 'load-more-limit-msg';
      msg.textContent = 'Достигнут предел результатов';
      tracksContainer.appendChild(msg);
      return;
    }

    if (_activeSources.soundcloud && resultsCount >= 20) {
      const btn = document.createElement('button');
      btn.id = 'load-more-btn';
      btn.className = 'load-more-btn';
      btn.textContent = 'Показать еще';
      btn.addEventListener('click', loadMoreTracks);
      tracksContainer.appendChild(btn);
    }
  }

  async function loadMoreTracks() {
    if (_isLoadingMore) return;
    const searchInput = document.getElementById('search-input');
    const query = searchInput ? searchInput.value.trim() : '';
    if (!query) return;

    _isLoadingMore = true;
    const btn = document.getElementById('load-more-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner banner-spinner" style="width:12px; height:12px; border-width:1.5px; display:inline-block; vertical-align:middle; margin-right:8px;"></span>Загрузка...';
    }

    _currentSearchPage += 1;
    if (typeof root !== 'undefined') root.currentSearchPage = _currentSearchPage;

    const sources = [];
    if (_activeSources.soundcloud) sources.push('soundcloud');
    if (_activeSources.spotify) sources.push('spotify');
    const sourcesStr = sources.join(',');

    let newTracks = [];
    try {
      const backendUrl = getBackendUrl();
      const response = await fetchWithTimeout(`${backendUrl}/search?q=${encodeURIComponent(query)}&sources=${sourcesStr}&page=${_currentSearchPage}&limit=20`, {}, 4500);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && data.results && data.results.length > 0) {
          newTracks = data.results;
        }
      }
    } catch (e) {
      console.warn('[Search] Backend load more failed, falling back to DirectSoundCloudEngine:', e.message);
    }

    const currentTracks = Array.isArray(root.playlist) ? root.playlist : [];
    const directSCEngine = getDirectSCEngine();
    if (newTracks.length === 0 && _activeSources.soundcloud && directSCEngine && typeof directSCEngine.search === 'function') {
      try {
        newTracks = await directSCEngine.search(query, 20, currentTracks.length);
      } catch (err) {}
    }

    if (btn) btn.remove();
    _isLoadingMore = false;

    if (newTracks && newTracks.length > 0) {
      root.playlist = currentTracks.concat(newTracks);
      if (typeof root.renderTracks === 'function') {
        root.renderTracks(newTracks, null, true);
      }
      updateLoadMoreButton(newTracks.length);
    } else {
      updateLoadMoreButton(0);
    }
  }

  // --- Registration & Dual Exports ---

  GP.Views.Search = {
    performSearch,
    renderSearchResults,
    loadMoreTracks,
    updateLoadMoreButton,
    getSearchHistory,
    saveSearchHistory,
    addToSearchHistory,
    showSearchHistory,
    clearSearchHistory,
    deleteSearchHistoryItem,
    getActiveSources: () => ({ ..._activeSources }),
    setActiveSources: (sources) => { _activeSources = { ...sources }; }
  };

  // Direct aliases on window for 100% backward compatibility
  root.performSearch = performSearch;
  root.renderSearchResults = renderSearchResults;
  root.loadMoreTracks = loadMoreTracks;
  root.updateLoadMoreButton = updateLoadMoreButton;
  root.getSearchHistory = getSearchHistory;
  root.saveSearchHistory = saveSearchHistory;
  root.addToSearchHistory = addToSearchHistory;
  root.showSearchHistory = showSearchHistory;
  root.clearSearchHistory = clearSearchHistory;
  root.deleteSearchHistoryItem = deleteSearchHistoryItem;

})(typeof window !== 'undefined' ? window : global);
