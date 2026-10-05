/**
 * GlassPlayer Home View, Recommendations & Carousel Module
 * Handles home screen rendering, multi-source feed (SoundCloud & Spotify),
 * personalized "For You" recommendations, horizontal carousel, genre capsules,
 * and time-of-day dynamic vibe sections.
 */
(function (root) {
  'use strict';

  // Ensure window.GP.Views namespace
  const GP = root.GP = root.GP || {};
  GP.Views = GP.Views || {};
  GP.Views.Home = GP.Views.Home || {};

  // --- Constants & Config ---
  const HOME_RECOMMENDATION_TTL = 12 * 60 * 1000;

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

  // --- Reactive & Internal State ---
  let _activeHomeSource = 'soundcloud';
  let _activeSpotifyMood = null;
  let _activeGenreChip = null;
  let _originalHomeData = null;
  let _cachedForYouData = null;
  let _homeCarouselIndex = 0;
  let _carouselTimer = null;

  const spotifyMoodCache = new Map();
  let spotifyMoodLoadVersion = 0;
  let cachedSoundCloudDynamicTracks = null;
  let cachedSoundCloudDynamicAt = 0;
  let soundCloudDynamicLoadVersion = 0;
  let homeRecommendationRotation = 0;
  let homeLoadVersion = 0;
  let forYouLoadVersion = 0;
  let genreRenderVersion = 0;

  // Define reactive properties on window
  if (!Object.getOwnPropertyDescriptor(root, 'activeHomeSource')) {
    Object.defineProperty(root, 'activeHomeSource', {
      get: () => _activeHomeSource,
      set: (val) => { _activeHomeSource = String(val || 'soundcloud'); },
      configurable: true,
      enumerable: true
    });
  }

  if (!Object.getOwnPropertyDescriptor(root, 'activeSpotifyMood')) {
    Object.defineProperty(root, 'activeSpotifyMood', {
      get: () => _activeSpotifyMood,
      set: (val) => { _activeSpotifyMood = val; },
      configurable: true,
      enumerable: true
    });
  }

  if (!Object.getOwnPropertyDescriptor(root, 'activeGenreChip')) {
    Object.defineProperty(root, 'activeGenreChip', {
      get: () => _activeGenreChip,
      set: (val) => { _activeGenreChip = val; },
      configurable: true,
      enumerable: true
    });
  }

  if (!Object.getOwnPropertyDescriptor(root, 'originalHomeData')) {
    Object.defineProperty(root, 'originalHomeData', {
      get: () => _originalHomeData,
      set: (val) => { _originalHomeData = val; },
      configurable: true,
      enumerable: true
    });
  }

  if (!Object.getOwnPropertyDescriptor(root, 'cachedForYouData')) {
    Object.defineProperty(root, 'cachedForYouData', {
      get: () => _cachedForYouData,
      set: (val) => { _cachedForYouData = val; },
      configurable: true,
      enumerable: true
    });
  }

  if (!Object.getOwnPropertyDescriptor(root, 'homeCarouselIndex')) {
    Object.defineProperty(root, 'homeCarouselIndex', {
      get: () => _homeCarouselIndex,
      set: (val) => { _homeCarouselIndex = Number(val) || 0; },
      configurable: true,
      enumerable: true
    });
  }

  // --- Internal Helper Wrappers ---

  function getOwnerSuffix() {
    if (typeof root.getStorageOwnerSuffix === 'function') {
      return root.getStorageOwnerSuffix();
    }
    if (root.currentUser) {
      const id = root.currentUser.id || root.currentUser._id || root.currentUser.username;
      return `account_${String(id || 'unknown').replace(/[^a-z0-9_-]/gi, '_')}`;
    }
    return root.currentProfile || 'Default';
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

  function formatPlayback(count) {
    if (root.GP?.Utils?.formatPlaybackCount) return root.GP.Utils.formatPlaybackCount(count);
    if (typeof root.formatPlaybackCount === 'function') return root.formatPlaybackCount(count);
    if (!count || isNaN(count)) return '0';
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
    return String(count);
  }

  function getOptimalCover(rawUrl, source = 'soundcloud') {
    if (typeof root.getOptimalCoverUrl === 'function') return root.getOptimalCoverUrl(rawUrl, source);
    if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
      return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="12" cy="12" r="4"/><line x1="8" x2="8" y1="2" y2="4"/><line x1="16" x2="16" y1="2" y2="4"/></svg>';
    }
    return rawUrl;
  }

  function getFallbackCover(rawUrl) {
    if (typeof root.getFallbackCoverUrl === 'function') return root.getFallbackCoverUrl(rawUrl);
    return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="12" cy="12" r="4"/></svg>';
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

  function getPlayHistory() {
    if (typeof root.getPlayHistory === 'function') return root.getPlayHistory();
    if (root.GP?.Views?.Library?.getPlayHistory) return root.GP.Views.Library.getPlayHistory();
    return [];
  }

  function getLikedTracks() {
    if (typeof root.getLikedTracks === 'function') return root.getLikedTracks();
    if (root.GP?.Views?.Library?.getLikedTracks) return root.GP.Views.Library.getLikedTracks();
    return [];
  }

  function getFollowedArtists() {
    if (typeof root.getFollowedArtists === 'function') return root.getFollowedArtists();
    return [];
  }

  function getSearchHistory() {
    if (typeof root.getSearchHistory === 'function') return root.getSearchHistory();
    return [];
  }

  function getProfilePlayStats() {
    if (typeof root.getProfilePlayStats === 'function') return root.getProfilePlayStats();
    return {};
  }

  function handlePlayTrack(index) {
    if (root.GP?.Player?.playTrack) {
      root.GP.Player.playTrack(index);
    } else if (typeof root.playTrack === 'function') {
      root.playTrack(index);
    }
  }

  function handleTogglePlay() {
    if (root.GP?.Player?.togglePlay) {
      root.GP.Player.togglePlay();
    } else if (typeof root.togglePlay === 'function') {
      root.togglePlay();
    }
  }

  function handleShowPlaylistMenu(e, track) {
    if (typeof root.showPlaylistMenu === 'function') {
      root.showPlaylistMenu(e, track);
    } else if (root.GP?.Views?.Playlists?.showPlaylistMenu) {
      root.GP.Views.Playlists.showPlaylistMenu(e, track);
    }
  }

  function handleToggleLike(e, track) {
    if (typeof root.toggleLike === 'function') {
      root.toggleLike(e, track);
    } else if (root.GP?.Views?.Library?.toggleLike) {
      root.GP.Views.Library.toggleLike(e, track);
    }
  }

  function isTrackLiked(trackId) {
    if (root.likedTrackIds && typeof root.likedTrackIds.has === 'function') {
      return root.likedTrackIds.has(trackId);
    }
    if (root.GP?.Views?.Library?.isTrackLiked) {
      return root.GP.Views.Library.isTrackLiked(trackId);
    }
    return false;
  }

  // --- Core Recommendation & Cache Logic ---

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

  const HOME_FEED_SECTIONS_CACHE_KEY = 'gp_home_feed_sections_cache';

  function getPersistedHomeFeed() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(HOME_FEED_SECTIONS_CACHE_KEY);
        if (raw) return JSON.parse(raw);
      }
    } catch (e) {}
    return null;
  }

  function getHomeRecommendationCacheKey() {
    return `gp_home_feed_v2_${getOwnerSuffix()}_${_activeHomeSource}`;
  }

  function invalidateHomeRecommendations({ preserveCache = false } = {}) {
    _cachedForYouData = null;
    if (typeof root !== 'undefined') root.cachedForYouData = null;
    forYouLoadVersion += 1;
    spotifyMoodCache.clear();
    spotifyMoodLoadVersion += 1;
    cachedSoundCloudDynamicTracks = null;
    cachedSoundCloudDynamicAt = 0;
    soundCloudDynamicLoadVersion += 1;
    if (!preserveCache && typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(HOME_FEED_SECTIONS_CACHE_KEY);
      } catch (e) {}
      const owner = getOwnerSuffix();
      ['soundcloud', 'spotify'].forEach((source) => {
        try {
          localStorage.removeItem(`gp_home_feed_v2_${owner}_${source}`);
        } catch (e) {}
      });
    }
  }

  function buildRecommendationSeeds() {
    const candidates = [];
    const addSeed = (seed) => {
      if (!seed?.label || (!seed.query && !seed.artistId && !seed.trackId)) return;
      candidates.push(seed);
    };

    const stats = getProfilePlayStats();
    Object.values(stats)
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
    const ownerAtRequest = getOwnerSuffix();
    const sourceAtRequest = _activeHomeSource;
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

    const backendUrl = getBackendUrl();
    const directSCEngine = getDirectSCEngine();

    const requests = selectedSeeds.map(async (seed) => {
      try {
        const params = seed.trackId
          ? `trackId=${encodeURIComponent(seed.trackId)}`
          : seed.artistId
            ? `artistId=${encodeURIComponent(seed.artistId)}`
            : `q=${encodeURIComponent(seed.query)}`;
        const response = await fetchWithTimeout(`${backendUrl}/search/related?${params}`, {}, 3500);
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'success' && Array.isArray(data.results) && data.results.length > 0) {
            return data.results;
          }
        }
      } catch (e) {}

      // Fallback to direct SoundCloud search
      try {
        if (directSCEngine && typeof directSCEngine.search === 'function') {
          const searchQuery = seed.query || seed.title || seed.artist || 'trending music';
          return await directSCEngine.search(searchQuery, 8);
        }
      } catch (err) {}
      return [];
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
    if (requestVersion === forYouLoadVersion && ownerAtRequest === getOwnerSuffix() && sourceAtRequest === _activeHomeSource) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ createdAt: Date.now(), data: payload }));
      } catch (err) {}
    }
    return payload;
  }

  // --- Main Home View Loading & Rendering ---

  async function loadHomeView({ forceRefresh = false } = {}) {
    const requestVersion = ++homeLoadVersion;
    if (typeof root !== 'undefined') root.activeView = 'home';

    const searchInput = document.getElementById('search-input');
    const welcomeScreen = document.getElementById('welcome-screen');
    const tracksContainer = document.getElementById('tracks-container');
    const loadingIndicator = document.getElementById('loading-indicator');

    if (searchInput) searchInput.value = '';
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    if (tracksContainer) {
      tracksContainer.classList.add('hidden');
      tracksContainer.setAttribute('aria-busy', 'true');
    }
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    try {
      if (!_originalHomeData) {
        const persisted = getPersistedHomeFeed();
        if (persisted && typeof persisted === 'object') {
          _originalHomeData = persisted;
          if (typeof root !== 'undefined') {
            root.originalHomeData = _originalHomeData;
          }
        }
      }

      const backendUrl = getBackendUrl();
      const homeUrl = `${backendUrl}/search/home${forceRefresh ? `?refresh=${Date.now()}` : ''}`;
      let homeRes = null;
      let forYouData = null;

      try {
        const [homeResult, forYouResult] = await Promise.allSettled([
          fetchWithTimeout(homeUrl, {}, 4500).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          }),
          loadForYouTracks({ forceRefresh })
        ]);
        homeRes = homeResult.status === 'fulfilled' ? homeResult.value : null;
        forYouData = forYouResult.status === 'fulfilled' ? forYouResult.value : _cachedForYouData;
      } catch (e) {}

      // Fallback: If backend is slow, sleeping or blocked AND no cache is available, load directly via DirectSoundCloudEngine
      const directSCEngine = getDirectSCEngine();
      if ((!homeRes || homeRes.status !== 'success' || !homeRes.results) && !_originalHomeData && directSCEngine && typeof directSCEngine.getHomeSections === 'function') {
        console.log('[Home View] Backend unavailable and no cache, loading home sections directly from SoundCloud...');
        try {
          const directSections = await directSCEngine.getHomeSections();
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

      const activeView = root.activeView || '';
      if (requestVersion !== homeLoadVersion || activeView !== 'home') return;

      if (loadingIndicator) loadingIndicator.classList.add('hidden');

      if (homeRes?.status === 'success' && homeRes.results) {
        _originalHomeData = homeRes.results;
        _cachedForYouData = forYouData;
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(HOME_FEED_SECTIONS_CACHE_KEY, JSON.stringify(homeRes.results));
          }
        } catch (e) {}
        if (typeof root !== 'undefined') {
          root.originalHomeData = _originalHomeData;
          root.cachedForYouData = _cachedForYouData;
        }
        renderHome(homeRes.results, forYouData);
        if (tracksContainer) tracksContainer.classList.remove('hidden');
      } else if (_originalHomeData) {
        _cachedForYouData = forYouData || _cachedForYouData;
        if (typeof root !== 'undefined') root.cachedForYouData = _cachedForYouData;
        renderHome(_originalHomeData, _cachedForYouData);
        if (tracksContainer) tracksContainer.classList.remove('hidden');
      } else {
        if (tracksContainer) {
          tracksContainer.innerHTML = '<div class="welcome-state"><h2>Не удалось загрузить рекомендации</h2><p>Пожалуйста, проверьте подключение к интернету</p></div>';
          tracksContainer.classList.remove('hidden');
        }
      }

      if (typeof root.updateActiveTab === 'function') {
        root.updateActiveTab('home');
      }
    } catch (error) {
      const activeView = root.activeView || '';
      if (requestVersion !== homeLoadVersion || activeView !== 'home') return;
      console.error('[Home View] Failed to load home screen recommendations:', error);
      if (loadingIndicator) loadingIndicator.classList.add('hidden');
      if (tracksContainer) {
        tracksContainer.innerHTML = '<div class="welcome-state"><h2>Не удалось загрузить рекомендации</h2><p>Проверьте соединение с интернетом</p></div>';
        tracksContainer.classList.remove('hidden');
      }
      if (typeof root.updateActiveTab === 'function') {
        root.updateActiveTab('home');
      }
    } finally {
      if (requestVersion === homeLoadVersion) {
        if (tracksContainer) tracksContainer.removeAttribute('aria-busy');
        if (typeof root.hideSplashScreen === 'function') root.hideSplashScreen();
      }
    }
  }

  function renderHome(sectionsData, forYouData) {
    const tracksContainer = document.getElementById('tracks-container');
    if (!tracksContainer) return;

    tracksContainer.innerHTML = '';
    _homeCarouselIndex = 0;
    clearInterval(_carouselTimer);

    const currentUser = root.currentUser;
    const currentProfile = root.currentProfile;
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
          <div class="capsule-active-indicator" style="left: ${_activeHomeSource === 'soundcloud' ? '4' : '44'}px;"></div>
          <button class="source-capsule-btn ${_activeHomeSource === 'soundcloud' ? 'active' : ''}" data-source="soundcloud" title="SoundCloud" aria-label="Рекомендации SoundCloud" aria-pressed="${_activeHomeSource === 'soundcloud'}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.95 14.47c0-2.45-1.92-4.44-4.29-4.44h-.35c-.48-2.61-2.73-4.6-5.46-4.6-2.58 0-4.73 1.83-5.32 4.26-.26-.06-.53-.09-.81-.09-2.58 0-4.67 2.09-4.67 4.67 0 .16.01.32.02.48C1.29 14.53 0 16.03 0 17.84c0 2.08 1.68 3.76 3.76 3.76h16.5c1.96 0 3.69-1.55 3.69-3.51 0-1.74-1.28-3.18-2.97-3.52z"/></svg>
          </button>
          <button class="source-capsule-btn ${_activeHomeSource === 'spotify' ? 'active' : ''}" data-source="spotify" title="Spotify" aria-label="Рекомендации Spotify" aria-pressed="${_activeHomeSource === 'spotify'}">
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
      btn.addEventListener('click', () => {
        const source = btn.dataset.source;
        if (_activeHomeSource === source) return;

        _activeHomeSource = source;
        if (typeof root !== 'undefined') root.activeHomeSource = source;

        // Update button active classes immediately for visual response
        welcomeHeader.querySelectorAll('.source-capsule-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.source === _activeHomeSource);
          b.setAttribute('aria-pressed', String(b.dataset.source === _activeHomeSource));
        });

        // Slide active indicator instantly
        const indicator = welcomeHeader.querySelector('.capsule-active-indicator');
        if (indicator) {
          indicator.style.left = `${_activeHomeSource === 'soundcloud' ? '4' : '44'}px`;
        }

        // Smooth switch transition delay
        setTimeout(() => {
          renderHome(_originalHomeData, _cachedForYouData);
        }, 250);
      });
    });

    // ── Spotify: Live Mood-Card Grid ─────────────────────────────────
    if (_activeHomeSource === 'spotify') {
      renderSpotifyHome();
      return;
    }

    // Filter helper based on activeHomeSource
    const filterBySource = (trackList) => {
      if (!trackList) return [];
      return trackList.filter(t => t.source === _activeHomeSource);
    };

    // 2. Render For You Banner Carousel
    const getFilteredCarousel = () => {
      let sourceTracks = [];
      if (forYouData && forYouData.tracks) {
        sourceTracks = filterBySource(forYouData.tracks);
      }
      if (sourceTracks.length === 0 && sectionsData?.trending) {
        sourceTracks = filterBySource(sectionsData.trending);
      }
      if (sourceTracks.length === 0 && sectionsData?.top) {
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
      const isActive = (_activeGenreChip === null && tag === 'All') || (_activeGenreChip === tag);
      chip.className = `genre-chip-btn ${isActive ? 'active' : ''}`;
      chip.textContent = tag;

      chip.addEventListener('click', async () => {
        if (tag === 'All') {
          _activeGenreChip = null;
          if (typeof root !== 'undefined') root.activeGenreChip = null;
          genreRenderVersion++;
          renderHome(_originalHomeData, _cachedForYouData);
        } else {
          _activeGenreChip = _activeGenreChip === tag ? null : tag;
          if (typeof root !== 'undefined') root.activeGenreChip = _activeGenreChip;
          genreRenderVersion++;
          renderHome(_originalHomeData, _cachedForYouData);
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

    if (_activeGenreChip) {
      const tag = _activeGenreChip;
      const myVersion = genreRenderVersion;
      setTimeout(async () => {
        if (genreRenderVersion !== myVersion) return;
        const currentContentArea = document.getElementById('home-content-area');
        if (currentContentArea) {
          currentContentArea.innerHTML = '<div style="display: flex; justify-content: center; padding: 50px;"><div class="spinner"></div></div>';
        }
        try {
          let scTracks = [];
          const backendUrl = getBackendUrl();
          try {
            const response = await fetchWithTimeout(`${backendUrl}/search?q=${encodeURIComponent(tag)}`, {}, 2500);
            if (response.ok) {
              const result = await response.json();
              if (result.status === 'success' && result.results) {
                scTracks = result.results.filter(t => t.source === _activeHomeSource);
              }
            }
          } catch (e) {}

          const directSCEngine = getDirectSCEngine();
          if (scTracks.length === 0 && _activeHomeSource === 'soundcloud' && directSCEngine && typeof directSCEngine.search === 'function') {
            try {
              scTracks = await directSCEngine.search(tag, 20);
            } catch (scErr) {}
          }

          const currentActiveView = root.activeView || '';
          if (genreRenderVersion !== myVersion || currentActiveView !== 'home' || _activeGenreChip !== tag || !currentContentArea?.isConnected) return;
          if (scTracks.length > 0) {
            renderGenreTracks(scTracks, tag);
          } else {
            if (currentContentArea) {
              currentContentArea.innerHTML = '<div class="inline-error-state">Не удалось загрузить треки этого жанра. Попробуйте ещё раз.</div>';
            }
          }
        } catch (err) {
          const currentActiveView = root.activeView || '';
          if (genreRenderVersion === myVersion && currentActiveView === 'home' && _activeGenreChip === tag && currentContentArea?.isConnected) {
            currentContentArea.innerHTML = '<div class="inline-error-state">Не удалось загрузить жанр. Проверьте соединение и повторите попытку.</div>';
          }
        }
      }, 50);
    } else {
      renderHomeContent(sectionsData, forYouData);
    }
  }

  function openHomeCollection(title, subtitle, tracks) {
    if (typeof root !== 'undefined') root.activeView = 'home-collection';
    clearInterval(_carouselTimer);
    const tracksContainer = document.getElementById('tracks-container');
    if (!tracksContainer) return;

    tracksContainer.innerHTML = `
      <div class="collection-view-header">
        <button class="collection-back-btn" type="button" aria-label="Вернуться на Home"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
        <div><h2>${escapeHTML(title)}</h2><p>${escapeHTML(subtitle)}</p></div>
      </div>
      <div class="tracks-layout-grid home-collection-grid"></div>
    `;
    tracksContainer.querySelector('.collection-back-btn')?.addEventListener('click', () => loadHomeView());
    root.playlist = tracks;
    if (typeof root.renderTracks === 'function') {
      root.renderTracks(tracks, tracksContainer.querySelector('.home-collection-grid'));
    }
    if (typeof root.updateActiveTab === 'function') {
      root.updateActiveTab('home');
    }
  }

  function appendHomeRail(parent, { id, title, subtitle, tracks }) {
    if (!tracks || !tracks.length || !parent) return;
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
      if (prev && scroller) prev.disabled = scroller.scrollLeft <= 4;
      if (next && scroller) next.disabled = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 4;
    };
    prev?.addEventListener('click', () => scroller?.scrollBy({ left: -Math.max(280, scroller.clientWidth * 0.72), behavior: 'smooth' }));
    next?.addEventListener('click', () => scroller?.scrollBy({ left: Math.max(280, scroller.clientWidth * 0.72), behavior: 'smooth' }));
    scroller?.addEventListener('scroll', updateArrows, { passive: true });
    section.querySelector('.see-all-link')?.addEventListener('click', () => openHomeCollection(title, subtitle, tracks));
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(updateArrows);
  }

  function renderHomeContent(sectionsData, forYouData) {
    const contentArea = document.getElementById('home-content-area');
    if (!contentArea) return;
    contentArea.innerHTML = '';

    const filterBySource = (trackList) => (trackList || []).filter((track) => track.source === _activeHomeSource);
    const trackKeys = (track) => [
      `${track.source || 'unknown'}:${track.id}`,
      `${String(track.artist || '').trim().toLocaleLowerCase('ru')}::${String(track.title || '').trim().toLocaleLowerCase('ru')}`
    ];
    const heroCandidates = filterBySource(forYouData?.tracks).length
      ? filterBySource(forYouData.tracks)
      : filterBySource(sectionsData?.trending).length
        ? filterBySource(sectionsData.trending)
        : filterBySource(sectionsData?.top);
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
    if (!personalTracks.length) personalTracks = takeUnique(sectionsData?.top, 14);
    const discoverySources = [sectionsData?.electronic || [], sectionsData?.rock || [], sectionsData?.pop || []];
    const discoveryPool = [];
    const discoveryDepth = Math.max(0, ...discoverySources.map((list) => list.length));
    for (let index = 0; index < discoveryDepth; index += 1) {
      discoverySources.forEach((list) => {
        if (list[index]) discoveryPool.push(list[index]);
      });
    }
    const discoveryTracks = takeUnique(discoveryPool, 14);
    const trendingTracks = takeUnique(sectionsData?.trending, 14);

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

  function renderTrackCardHorizontal(track, index, sectionTracks) {
    const card = document.createElement('div');
    const activePlayingTrack = root.activePlayingTrack;
    const isActive = activePlayingTrack && track.id === activePlayingTrack.id;
    card.className = `track-card-horizontal ${isActive ? 'active' : ''}`;
    card.setAttribute('role', 'article');
    card.dataset.index = index;
    card.dataset.trackId = track.id;

    const trackTitle = track.title ? track.title.trim() : "Unknown Track";
    const trackArtist = track.artist ? track.artist.trim() : "Unknown Artist";
    const coverUrl = getOptimalCover(track.thumbnail, track.source);
    const fallbackCoverUrl = getFallbackCover(track.thumbnail);
    
    const isLiked = isTrackLiked(track.id);

    const playsText = track.source === 'soundcloud' && (track.playbackCount !== undefined || track.playback_count !== undefined)
      ? `▷ ${formatPlayback(track.playbackCount || track.playback_count)}`
      : '';

    const audioPlayer = root.audioPlayer || document.getElementById('audio-player');
    const isCurrentPlaying = isActive && audioPlayer && !audioPlayer.paused;
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
              ? `<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style="margin-right:3px"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.377-1.454-5.37-1.783-8.894-.978-.335.077-.67-.134-.746-.47-.077-.335.134-.67.47-.746 3.847-.88 7.143-.51 9.814 1.127.294.18.387.563.207.857s-.563.387-.857.207zm1.225-2.72c-.227.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.082-1.182-.413.125-.847-.107-.972-.52-.125-.413.107-.847.52-.972 3.676-1.116 8.243-.57 11.348 1.337.367.227.487.707.26 1.074zm.107-2.834C14.484 8.7 8.012 8.483 4.262 9.622c-.573.173-1.182-.154-1.355-.727-.173-.573.154-1.182.727-1.355 4.3-1.305 11.442-1.055 15.534 1.373.515.305.683.97.378 1.485-.305.515-.97.683-1.485.378z"/></svg>SP`
              : `<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style="margin-right:3px"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>YT`}
          </span>
          ${playsText ? `<span>${playsText}</span><span>•</span>` : ''}
          <span>${track.duration || ''}</span>
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

    card.querySelector('.card-play-btn-horizontal')?.addEventListener('click', (e) => {
      e.stopPropagation();
      playOrToggle(track, index, sectionTracks);
    });

    card.querySelector('.card-more-btn-horizontal')?.addEventListener('click', (e) => {
      e.stopPropagation();
      handleShowPlaylistMenu(e, track);
    });

    card.querySelector('.card-like-btn-horizontal')?.addEventListener('click', (e) => {
      handleToggleLike(e, track);
    });

    return card;
  }

  function playOrToggle(track, index, sectionTracks) {
    const activePlayingTrack = root.activePlayingTrack;
    const isCurrent = activePlayingTrack && track.id === activePlayingTrack.id;
    if (isCurrent) {
      handleTogglePlay();
    } else {
      root.playlist = sectionTracks;
      handlePlayTrack(index);
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
      root.playlist = tracks;
      if (typeof root.renderTracks === 'function') {
        root.renderTracks(tracks, grid);
      }
    } else {
      grid.innerHTML = '<div class="inline-empty-state">В этом жанре пока нет доступных треков</div>';
    }

    contentArea.appendChild(sectionEl);
  }

  // --- Horizontal Carousel Banner Component ---

  function renderCarousel(carouselTracks, container = null, recommendationReason = 'Подобрано для вас') {
    clearInterval(_carouselTimer);
    _homeCarouselIndex = 0;
    if (typeof root !== 'undefined') root.homeCarouselIndex = 0;

    if (!carouselTracks || carouselTracks.length === 0) return null;

    const carouselSection = document.createElement('div');
    carouselSection.className = 'carousel-banner-section';

    let slidesHTML = '';
    let dotsHTML = '';

    carouselTracks.forEach((track, idx) => {
      const trackTitle = track.title ? track.title.trim() : "Unknown Track";
      const trackArtist = track.artist ? track.artist.trim() : "Unknown Artist";
      const coverUrl = getOptimalCover(track.thumbnail, track.source);
      const fallbackCoverUrl = getFallbackCover(track.thumbnail);
      const isLiked = isTrackLiked(track.id);

      const playsText = track.source === 'soundcloud' && (track.playbackCount !== undefined || track.playback_count !== undefined)
        ? `▷ ${formatPlayback(track.playbackCount || track.playback_count)}`
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
                <span>${track.duration || ''}</span>
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
      const artUrl = getOptimalCover(thumbnail, carouselTracks[index]?.source);
      slide.style.setProperty('--carousel-art', `url("${artUrl}")`);
    });

    const updateCarousel = (newIdx) => {
      if (!carouselTracks.length || !wrapper) return;
      _homeCarouselIndex = (newIdx + carouselTracks.length) % carouselTracks.length;
      if (typeof root !== 'undefined') root.homeCarouselIndex = _homeCarouselIndex;
      wrapper.style.transform = `translateX(-${_homeCarouselIndex * 100}%)`;
      slides.forEach((slide, slideIndex) => {
        const isActiveSlide = slideIndex === _homeCarouselIndex;
        slide.setAttribute('aria-hidden', String(!isActiveSlide));
        slide.inert = !isActiveSlide;
      });
      dots.forEach((dot, dIdx) => {
        dot.classList.toggle('active', dIdx === _homeCarouselIndex);
        dot.setAttribute('aria-current', String(dIdx === _homeCarouselIndex));
      });
    };

    const mediaMatch = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const reduceMotion = mediaMatch ? mediaMatch.matches : false;
    const hasMultipleSlides = carouselTracks.length > 1;
    let autoPlayPaused = reduceMotion;

    const updatePauseButton = () => {
      if (!pauseButton) return;
      pauseButton.setAttribute('aria-pressed', String(autoPlayPaused));
      pauseButton.setAttribute('aria-label', autoPlayPaused
        ? 'Возобновить автоматическую смену рекомендаций'
        : 'Приостановить автоматическую смену рекомендаций');
      pauseButton.innerHTML = autoPlayPaused
        ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l12-8z"/></svg>'
        : '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    };

    const startAutoSlide = () => {
      clearInterval(_carouselTimer);
      if (autoPlayPaused || reduceMotion || !hasMultipleSlides) return;
      _carouselTimer = setInterval(() => {
        updateCarousel(_homeCarouselIndex + 1);
      }, 5000);
    };

    const prevBtn = carouselSection.querySelector('#carousel-prev');
    const nextBtn = carouselSection.querySelector('#carousel-next');
    const dotsWrap = carouselSection.querySelector('.carousel-dots-wrap');

    if (prevBtn) prevBtn.hidden = !hasMultipleSlides;
    if (nextBtn) nextBtn.hidden = !hasMultipleSlides;
    if (dotsWrap) dotsWrap.hidden = !hasMultipleSlides;
    if (pauseButton) pauseButton.hidden = reduceMotion || !hasMultipleSlides;

    updateCarousel(0);
    updatePauseButton();
    startAutoSlide();

    pauseButton?.addEventListener('click', () => {
      autoPlayPaused = !autoPlayPaused;
      updatePauseButton();
      if (autoPlayPaused) clearInterval(_carouselTimer);
      else startAutoSlide();
    });

    carouselSection.addEventListener('mouseenter', () => clearInterval(_carouselTimer));
    carouselSection.addEventListener('mouseleave', startAutoSlide);
    carouselSection.addEventListener('focusin', () => clearInterval(_carouselTimer));
    carouselSection.addEventListener('focusout', (event) => {
      if (!carouselSection.contains(event.relatedTarget)) startAutoSlide();
    });

    prevBtn?.addEventListener('click', () => {
      updateCarousel(_homeCarouselIndex - 1);
    });

    nextBtn?.addEventListener('click', () => {
      updateCarousel(_homeCarouselIndex + 1);
    });

    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        updateCarousel(parseInt(dot.dataset.index, 10));
      });
    });

    carouselSection.querySelectorAll('.carousel-play-now-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        root.playlist = carouselTracks;
        handlePlayTrack(idx);
      });
    });

    carouselSection.querySelectorAll('.carousel-icon-btn.add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.dataset.index, 10);
        handleShowPlaylistMenu(e, carouselTracks[idx]);
      });
    });

    carouselSection.querySelectorAll('.carousel-icon-btn.like-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.dataset.index, 10);
        const track = carouselTracks[idx];
        handleToggleLike(e, track);
        const liked = isTrackLiked(track.id);
        btn.classList.toggle('liked', liked);
        btn.querySelector('svg')?.setAttribute('fill', liked ? 'currentColor' : 'none');
      });
    });

    return carouselSection;
  }

  // --- Spotify Moods & Sections Subsystem ---

  function getSpotifyMoodCacheKey(moodKey) {
    const hourBucket = Math.floor(new Date().getHours() / 3);
    return `${getOwnerSuffix()}:${moodKey}:${hourBucket}`;
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

  function renderSpotifyHome() {
    const tracksContainer = document.getElementById('tracks-container');
    if (!tracksContainer) return;

    const container = document.createElement('div');
    container.className = 'spotify-home-container';

    // 1. Render Carousel Placeholder at top of Spotify view
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
      card.className = `mood-card ${_activeSpotifyMood === mood.key ? 'active' : ''}`;
      card.setAttribute('aria-pressed', String(_activeSpotifyMood === mood.key));
      card.innerHTML = `
        <div class="mood-card-active-ring"></div>
        <div class="mood-card-title">${mood.title}</div>
        <div class="mood-card-sub">${mood.sub}</div>
      `;

      card.addEventListener('click', async () => {
        grid.querySelectorAll('.mood-card').forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-pressed', 'false');
        });
        card.classList.add('active');
        card.setAttribute('aria-pressed', 'true');
        _activeSpotifyMood = mood.key;
        if (typeof root !== 'undefined') root.activeSpotifyMood = mood.key;

        card.classList.add('loading');
        await loadSpotifyMoodTracks(mood.key, mood.title, container);
        if (_activeSpotifyMood === mood.key) card.classList.remove('loading');
      });

      grid.appendChild(card);
    });

    container.appendChild(grid);

    // 3. Results area
    const resultsArea = document.createElement('div');
    resultsArea.id = 'spotify-results-area';
    container.appendChild(resultsArea);

    tracksContainer.appendChild(container);

    // Auto-load default or active mood
    const defaultMood = _activeSpotifyMood || MOOD_CARDS[0].key;
    _activeSpotifyMood = defaultMood;
    if (typeof root !== 'undefined') root.activeSpotifyMood = defaultMood;

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
      const moodDef = MOOD_CARDS.find(m => m.key === defaultMood);
      const title = moodDef ? moodDef.title : defaultMood;
      if (!defaultCache) {
        defaultCard.classList.add('loading');
        loadSpotifyMoodTracks(defaultMood, title, container)
          .finally(() => defaultCard.classList.remove('loading'));
      } else {
        loadSpotifyMoodTracks(defaultMood, title, container, true);
      }
    }
  }

  async function loadSpotifyMoodTracks(moodKey, moodTitle, containerEl, useCacheOnly = false) {
    const resultsArea = containerEl?.querySelector('#spotify-results-area') ||
      document.getElementById('spotify-results-area');
    if (!resultsArea) return;

    const requestVersion = ++spotifyMoodLoadVersion;
    const ownerAtRequest = getOwnerSuffix();
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
        const backendUrl = getBackendUrl();
        
        // Fetch both requests in parallel
        const [moodRes, dynamicRes] = await Promise.all([
          fetchWithTimeout(`${backendUrl}/spotify/recommendations?mood=${encodeURIComponent(moodKey)}`),
          fetchWithTimeout(`${backendUrl}/spotify/recommendations?mood=dynamic&hour=${hour}`)
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

        if (requestVersion !== spotifyMoodLoadVersion || ownerAtRequest !== getOwnerSuffix() || _activeSpotifyMood !== moodKey || _activeHomeSource !== 'spotify') return;
        spotifyMoodCache.set(cacheKey, { createdAt: Date.now(), moodTracks, dynamicTracks });

        const carouselPlaceholder = containerEl.querySelector('#spotify-carousel-container');
        if (carouselPlaceholder) {
          carouselPlaceholder.innerHTML = '';
          renderCarousel(moodTracks.slice(0, 5), carouselPlaceholder);
        }
      } catch (err) {
        console.error('[Spotify Recommendations] Failed to load tracks:', err.message);
        if (requestVersion !== spotifyMoodLoadVersion || _activeSpotifyMood !== moodKey || _activeHomeSource !== 'spotify' || !containerEl.isConnected) return;
        resultsArea.innerHTML = `
          <div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3);">
            Не удалось загрузить рекомендации. Попробуйте еще раз.
          </div>
        `;
        return;
      }
    }

    if (requestVersion !== spotifyMoodLoadVersion || ownerAtRequest !== getOwnerSuffix() || _activeSpotifyMood !== moodKey || _activeHomeSource !== 'spotify' || !containerEl.isConnected) return;

    resultsArea.innerHTML = '';

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

    // Dynamic section
    if (dynamicTracks.length > 0) {
      const dynamicHeader = document.createElement('div');
      dynamicHeader.className = 'spotify-section-header';
      dynamicHeader.innerHTML = `
        <div class="spotify-section-title">${dynamicGreeting}</div>
        <div class="spotify-section-badge">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.377-1.454-5.37-1.783-8.894-.978-.335.077-.67-.134-.746-.47-.077-.335.134-.67.47-.746 3.847-.88 7.143-.51 9.814 1.127.294.18.387.563.207.857s-.563.387-.857.207zm1.225-2.72c-.227.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.082-1.182-.413.125-.847-.107-.972-.52-.125-.413.107-.847.52-.972 3.676-1.116 8.243-.57 11.348 1.337.367.227.487.707.26 1.074zm.107-2.834C14.484 8.7 8.012 8.483 4.262 9.622c-.573.173-1.182-.154-1.355-.727-.173-.573.154-1.182.727-1.355 4.3-1.305 11.442-1.055 15.534 1.373.515.305.683.97.378 1.485-.305.515-.97.683-1.485.378z"/>
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

      dynamicSection.querySelector('#spotify-dynamic-scroll-chevron')?.addEventListener('click', () => {
        dynamicScroller.scrollBy({ left: 300, behavior: 'smooth' });
      });
    }

    // Selected mood section
    if (moodTracks.length > 0) {
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

      const refreshBtn = vibeHeader.querySelector('#spotify-refresh-btn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
          refreshBtn.classList.add('loading');
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

      recSection.querySelector('#spotify-rec-scroll-chevron')?.addEventListener('click', () => {
        recScroller.scrollBy({ left: 300, behavior: 'smooth' });
      });

      recSection.querySelector('#see-all-spotify-rec')?.addEventListener('click', (e) => {
        e.preventDefault();
        root.playlist = recTracks;
        if (typeof root.renderTracks === 'function') {
          root.renderTracks(root.playlist);
        }
      });

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

        trendSection.querySelector('#spotify-trend-scroll-chevron')?.addEventListener('click', () => {
          trendScroller.scrollBy({ left: 300, behavior: 'smooth' });
        });

        trendSection.querySelector('#see-all-spotify-trend')?.addEventListener('click', (e) => {
          e.preventDefault();
          root.playlist = trendTracks;
          if (typeof root.renderTracks === 'function') {
            root.renderTracks(root.playlist);
          }
        });
      }
    }
  }

  // --- SoundCloud Dynamic Recommendations ---

  async function loadSoundCloudDynamicRecommendations(containerEl, forceRefresh = false) {
    if (!containerEl) return;
    const requestVersion = ++soundCloudDynamicLoadVersion;
    const ownerAtRequest = getOwnerSuffix();

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
      const backendUrl = getBackendUrl();
      try {
        const res = await fetchWithTimeout(`${backendUrl}/spotify/recommendations?mood=dynamic&hour=${hour}`, {}, 2500);
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
      const directSCEngine = getDirectSCEngine();
      if (tracks.length === 0 && directSCEngine && typeof directSCEngine.search === 'function') {
        let timeQuery = 'chill beats';
        if (hour >= 6 && hour < 12) timeQuery = 'morning acoustic chill';
        else if (hour >= 12 && hour < 18) timeQuery = 'day electronic dance hits';
        else if (hour >= 18 && hour < 24) timeQuery = 'evening chillout wave';
        else timeQuery = 'night lofi beats';
        try {
          tracks = await directSCEngine.search(timeQuery, 10);
        } catch (scErr) {}
      }

      const activeView = root.activeView || '';
      if (requestVersion !== soundCloudDynamicLoadVersion || ownerAtRequest !== getOwnerSuffix() || activeView !== 'home' || _activeHomeSource !== 'soundcloud' || !containerEl.isConnected) return;
      if (tracks.length > 0) {
        cachedSoundCloudDynamicTracks = tracks;
        cachedSoundCloudDynamicAt = Date.now();
        renderSoundCloudDynamicSection(containerEl, tracks);
      } else {
        containerEl.innerHTML = '';
      }
    } catch (err) {
      const activeView = root.activeView || '';
      if (requestVersion !== soundCloudDynamicLoadVersion || activeView !== 'home' || _activeHomeSource !== 'soundcloud' || !containerEl.isConnected) return;
      containerEl.innerHTML = '';
    }
  }

  function renderSoundCloudDynamicSection(containerEl, tracks) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    if (!tracks || tracks.length === 0) return;

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

    section.querySelector('#soundcloud-dynamic-scroll-chevron')?.addEventListener('click', () => {
      scroller.scrollBy({ left: 300, behavior: 'smooth' });
    });
  }

  // --- Registration & Dual Exports ---

  GP.Views.Home = {
    loadHomeView,
    loadHome: loadHomeView,
    renderHomeView: renderHome,
    renderHome,
    refreshHomeRecommendations: () => loadHomeView({ forceRefresh: true }),
    invalidateHomeRecommendations,
    renderCarousel,
    buildRecommendationSeeds,
    loadForYouTracks,
    getGreeting,
    openHomeCollection,
    appendHomeRail,
    renderHomeContent,
    renderGenreTracks,
    renderTrackCardHorizontal,
    playOrToggle,
    renderSpotifyHome,
    loadSpotifyMoodTracks,
    loadSoundCloudDynamicRecommendations,
    renderSoundCloudDynamicSection,
    getHomeRecommendationCacheKey,
    MOOD_CARDS,
    spotifyMoodCache,
    getActiveHomeSource: () => _activeHomeSource,
    setActiveHomeSource: (source) => { _activeHomeSource = source; },
    getActiveGenreChip: () => _activeGenreChip,
    setActiveGenreChip: (chip) => { _activeGenreChip = chip; },
    getOriginalHomeData: () => _originalHomeData,
    setOriginalHomeData: (data) => { _originalHomeData = data; },
    getCachedForYouData: () => _cachedForYouData,
    setCachedForYouData: (data) => { _cachedForYouData = data; }
  };

  // Direct aliases on window for 100% backward compatibility
  root.loadHomeView = loadHomeView;
  root.loadHome = loadHomeView;
  root.renderHome = renderHome;
  root.renderHomeView = renderHome;
  root.refreshHomeRecommendations = () => loadHomeView({ forceRefresh: true });
  root.invalidateHomeRecommendations = invalidateHomeRecommendations;
  root.renderCarousel = renderCarousel;
  root.getGreeting = getGreeting;
  root.renderTrackCardHorizontal = renderTrackCardHorizontal;
  root.openHomeCollection = openHomeCollection;
  root.appendHomeRail = appendHomeRail;
  root.renderHomeContent = renderHomeContent;
  root.renderGenreTracks = renderGenreTracks;
  root.renderSpotifyHome = renderSpotifyHome;
  root.loadSpotifyMoodTracks = loadSpotifyMoodTracks;
  root.loadSoundCloudDynamicRecommendations = loadSoundCloudDynamicRecommendations;
  root.renderSoundCloudDynamicSection = renderSoundCloudDynamicSection;
  root.MOOD_CARDS = MOOD_CARDS;

})(typeof window !== 'undefined' ? window : global);
