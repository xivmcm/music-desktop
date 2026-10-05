/**
 * GlassPlayer Artist View Module
 * Handles artist profile rendering, discography, follower management,
 * artist playlists, and navigation.
 */
(function (root) {
  'use strict';

  // Ensure window.GP.Views namespace
  const GP = root.GP = root.GP || {};
  GP.Views = GP.Views || {};
  GP.Views.Artist = GP.Views.Artist || {};

  // --- Storage & Helper Functions ---

  function getStorageKey(key) {
    if (typeof root.getStorageKey === 'function') {
      return root.getStorageKey(key);
    }
    const owner = typeof root.getStorageOwnerSuffix === 'function' ? root.getStorageOwnerSuffix() : 'guest';
    return `gp_${key}_${owner}`;
  }

  function getBackendUrl() {
    return root.BACKEND_URL || root.API_URL || 'https://glassplayer-backend.onrender.com';
  }

  function getOptimalCover(rawUrl, source = 'soundcloud') {
    if (typeof root.getOptimalCoverUrl === 'function') return root.getOptimalCoverUrl(rawUrl, source);
    return rawUrl || '';
  }

  function getFallbackCover(rawUrl) {
    if (typeof root.getFallbackCoverUrl === 'function') return root.getFallbackCoverUrl(rawUrl);
    return 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'40\' fill=\'%23333\'/></svg>';
  }

  // --- Artist Follow System ---

  function getFollowedArtists() {
    const scopedKey = getStorageKey('followed_artists');
    let scoped = null;
    let legacy = null;
    try {
      scoped = localStorage.getItem(scopedKey);
      legacy = !root.currentUser && root.currentProfile === 'Default' ? localStorage.getItem('gp_followed_artists') : null;
    } catch (e) {}

    try {
      const artists = JSON.parse(scoped || legacy || '[]');
      if (!scoped && legacy) {
        try { localStorage.setItem(scopedKey, JSON.stringify(artists)); } catch (e) {}
      }
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
    if (!artistData || !artistData.id) return false;
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

    try {
      localStorage.setItem(getStorageKey('followed_artists'), JSON.stringify(list));
    } catch (e) {}

    if (typeof root.invalidateHomeRecommendations === 'function') {
      root.invalidateHomeRecommendations();
    } else if (root.GP?.Views?.Home?.invalidateHomeRecommendations) {
      root.GP.Views.Home.invalidateHomeRecommendations();
    }

    return !followed;
  }

  // --- Profile Loader & Views ---

  async function loadArtistView(artistId) {
    if (!artistId || artistId === 'undefined' || artistId === 'null' || artistId === '') {
      console.warn('[Artist View] loadArtistView called with invalid artistId:', artistId);
      const playlist = Array.isArray(root.playlist) ? root.playlist : [];
      const currentTrackIndex = typeof root.currentTrackIndex === 'number' ? root.currentTrackIndex : -1;
      const track = playlist[currentTrackIndex];
      const searchInput = document.getElementById('search-input');
      if (track && searchInput) {
        searchInput.value = track.artist;
        if (typeof root.performSearch === 'function') {
          root.performSearch();
        }
      }
      return;
    }

    if (typeof root !== 'undefined') root.activeView = 'artist';

    const welcomeScreen = document.getElementById('welcome-screen');
    const tracksContainer = document.getElementById('tracks-container');
    const loadingIndicator = document.getElementById('loading-indicator');

    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    if (tracksContainer) tracksContainer.classList.add('hidden');
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 10000) : null;

      const backendUrl = getBackendUrl();
      const response = await fetch(`${backendUrl}/search/artist/${artistId}`, {
        signal: controller ? controller.signal : undefined
      });
      if (timeoutId) clearTimeout(timeoutId);

      const data = await response.json();
      if (loadingIndicator) loadingIndicator.classList.add('hidden');

      if (data.status === 'success' && data.results) {
        renderArtistProfile(data.results);
        if (tracksContainer) tracksContainer.classList.remove('hidden');
      } else {
        renderArtistProfileError();
      }

      if (typeof root.updateActiveTab === 'function') {
        root.updateActiveTab('artist');
      }
    } catch (error) {
      console.error('[Artist View] Failed to load artist view:', error);
      if (loadingIndicator) loadingIndicator.classList.add('hidden');
      const isTimeout = error.name === 'AbortError';
      const msg = isTimeout
        ? 'Сервер не ответил вовремя. Попробуйте ещё раз.'
        : 'Не удалось загрузить профиль артиста. Проверьте соединение.';
      renderArtistProfileError(isTimeout ? 'Таймаут' : 'Ошибка загрузки', msg);

      if (typeof root.updateActiveTab === 'function') {
        root.updateActiveTab('artist');
      }
    }
  }

  function closeArtistProfile() {
    if (typeof root.loadHomeView === 'function') {
      root.loadHomeView();
    } else if (root.GP?.Views?.Home?.loadHomeView) {
      root.GP.Views.Home.loadHomeView();
    }
  }

  function renderArtistProfileError(title = 'Артист не найден', message = 'SoundCloud не отдал данные профиля.') {
    const tracksContainer = document.getElementById('tracks-container');
    if (!tracksContainer) return;

    const playlist = Array.isArray(root.playlist) ? root.playlist : [];
    const currentTrackIndex = typeof root.currentTrackIndex === 'number' ? root.currentTrackIndex : -1;
    const track = playlist[currentTrackIndex];
    const searchInput = document.getElementById('search-input');
    const artistName = track?.artist || searchInput?.value || '';

    tracksContainer.innerHTML = `
      <div class="welcome-state artist-profile-error">
        <h2>${title}</h2>
        <p>${message}</p>
        <button id="artist-global-search-btn" class="view-btn">
          <span>Искать треки артиста через глобальный поиск</span>
        </button>
      </div>
    `;
    tracksContainer.classList.remove('hidden');

    const searchBtn = document.getElementById('artist-global-search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        if (!artistName || !searchInput) return;
        searchInput.value = artistName;
        if (typeof root.performSearch === 'function') {
          root.performSearch();
        }
      });
    }
  }

  function renderArtistProfile(artistData) {
    const tracksContainer = document.getElementById('tracks-container');
    if (!tracksContainer || !artistData) return;

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
      <img class="artist-avatar" src="${artistData.avatar || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'40\' fill=\'%23333\'/></svg>'}" alt="${artistData.name || ''}">
      <div class="artist-info" style="display: flex; flex-direction: column;">
        <button id="back-to-previous" class="view-btn" style="align-self: flex-start; margin-bottom: 8px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          <span>Назад</span>
        </button>
        <h2>${artistData.name || 'Неизвестный исполнитель'}</h2>
        <span class="artist-meta">${(artistData.followers || 0).toLocaleString()} подписчиков</span>
        ${followBtnHTML}
        <p class="artist-desc" style="margin-top: 10px;">${artistData.description || 'Описание отсутствует.'}</p>
      </div>
    `;
    tracksContainer.appendChild(header);

    const followBtn = header.querySelector('#follow-artist-btn');
    if (followBtn) {
      followBtn.addEventListener('click', () => {
        const nowFollowed = toggleFollowArtist(artistData);
        const span = followBtn.querySelector('span');
        if (nowFollowed) {
          followBtn.classList.add('active');
          if (span) span.textContent = 'Отписаться';
        } else {
          followBtn.classList.remove('active');
          if (span) span.textContent = 'Подписаться';
        }
      });
    }

    const backBtn = document.getElementById('back-to-previous');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        closeArtistProfile();
      });
    }

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

      if (typeof root.renderTracks === 'function') {
        root.renderTracks(artistData.tracks, tracksGrid);
      }
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

        const plThumbnail = getOptimalCover(pl.thumbnail);
        const fallbackPlThumbnail = getFallbackCover(pl.thumbnail);

        card.innerHTML = `
          <img src="${plThumbnail}" onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='${fallbackPlThumbnail}';}" style="width:100%; height:120px; object-fit:cover; border-radius:8px;">
          <div class="playlist-card-title" style="margin-top:8px;">${pl.name || 'Плейлист'}</div>
          <div class="playlist-card-count">${pl.tracksCount || 0} треков</div>
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
    if (typeof root !== 'undefined') {
      root.activeView = 'playlist-tracks';
      root.activePlaylistId = null;
    }

    const welcomeScreen = document.getElementById('welcome-screen');
    const tracksContainer = document.getElementById('tracks-container');
    const loadingIndicator = document.getElementById('loading-indicator');

    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    if (tracksContainer) tracksContainer.classList.add('hidden');
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    try {
      const backendUrl = getBackendUrl();
      const response = await fetch(`${backendUrl}/search/playlist/${playlistId}`);
      const data = await response.json();
      if (loadingIndicator) loadingIndicator.classList.add('hidden');

      if (data.status === 'success' && data.results) {
        root.playlist = data.results;

        if (tracksContainer) {
          tracksContainer.innerHTML = '';
          const viewHeader = document.createElement('div');
          viewHeader.className = 'view-header';
          viewHeader.innerHTML = `
            <div class="view-header-title">
              <button id="back-to-artist" class="view-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                <span>Назад</span>
              </button>
              <span>${playlistName || 'Плейлист артиста'}</span>
              <span class="view-header-subtitle">(${root.playlist.length} треков)</span>
            </div>
          `;
          tracksContainer.appendChild(viewHeader);

          document.getElementById('back-to-artist')?.addEventListener('click', () => {
            const artistId = root.playlist[0]?.artistId || '';
            if (artistId) {
              loadArtistView(artistId);
            } else {
              closeArtistProfile();
            }
          });

          if (root.playlist.length > 0) {
            const listGrid = document.createElement('div');
            listGrid.className = 'tracks-layout-grid';
            tracksContainer.appendChild(listGrid);
            if (typeof root.renderTracks === 'function') {
              root.renderTracks(root.playlist, listGrid);
            }
          } else {
            const emptyState = document.createElement('div');
            emptyState.className = 'welcome-state';
            emptyState.innerHTML = '<h2>Плейлист пуст</h2>';
            tracksContainer.appendChild(emptyState);
          }
          tracksContainer.classList.remove('hidden');
        }
      } else {
        if (tracksContainer) {
          tracksContainer.innerHTML = '<div class="welcome-state"><h2>Плейлист не найден</h2></div>';
          tracksContainer.classList.remove('hidden');
        }
      }
    } catch (error) {
      console.error('[Artist View] Failed to load artist playlist:', error);
      if (loadingIndicator) loadingIndicator.classList.add('hidden');
      if (tracksContainer) {
        tracksContainer.innerHTML = '<div class="welcome-state"><h2>Ошибка сети</h2></div>';
        tracksContainer.classList.remove('hidden');
      }
    }
  }

  // --- Registration & Dual Exports ---

  GP.Views.Artist = {
    loadArtistView,
    openArtistProfile: loadArtistView,
    closeArtistProfile,
    renderArtistProfile,
    renderArtistProfileError,
    loadArtistPlaylist,
    isArtistFollowed,
    toggleFollowArtist,
    getFollowedArtists
  };

  // Direct aliases on window for 100% backward compatibility
  root.loadArtistView = loadArtistView;
  root.openArtistProfile = loadArtistView;
  root.closeArtistProfile = closeArtistProfile;
  root.renderArtistProfile = renderArtistProfile;
  root.renderArtistProfileError = renderArtistProfileError;
  root.loadArtistPlaylist = loadArtistPlaylist;
  root.isArtistFollowed = isArtistFollowed;
  root.toggleFollowArtist = toggleFollowArtist;
  root.getFollowedArtists = getFollowedArtists;

})(typeof window !== 'undefined' ? window : global);
