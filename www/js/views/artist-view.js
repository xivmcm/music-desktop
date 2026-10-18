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
    const owner = typeof root.getStorageOwnerSuffix === 'function' ? root.getStorageOwnerSuffix() : 'Default';
    return `gp_${key}_${owner}`;
  }

  function getBackendUrl() {
    return root.BACKEND_URL || root.API_URL || 'https://glassplayer-backend.onrender.com';
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

  function isArtistFollowed(artistIdentifier, artistName) {
    const list = getFollowedArtists();
    const cleanId = String(artistIdentifier || '').trim();
    const cleanName = String(artistName || '').trim().toLowerCase();
    return list.some(a => {
      if (cleanId && String(a.id) === cleanId) return true;
      if (cleanName && a.name && String(a.name).trim().toLowerCase() === cleanName) return true;
      return false;
    });
  }

  async function syncFollowedArtistsWithBackend(list) {
    if (!root.currentUser) return;
    const token = typeof root.getAuthToken === 'function' ? root.getAuthToken() : (root.authToken || localStorage.getItem('gp_auth_token'));
    if (!token) return;

    try {
      const backendUrl = getBackendUrl();
      await fetch(`${backendUrl}/api/auth/sync-followed-artists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ followedArtists: list })
      });
    } catch (e) {
      console.warn('[Artist View] Failed to sync followed artists with cloud:', e.message);
    }
  }

  function toggleFollowArtist(artistData) {
    if (!artistData) return false;
    const artistId = String(artistData.id || artistData.artistId || '').trim();
    const artistName = String(artistData.name || artistData.artist || '').trim();
    if (!artistId && !artistName) return false;

    let list = getFollowedArtists();
    const followed = isArtistFollowed(artistId, artistName);

    if (followed) {
      list = list.filter(a => {
        if (artistId && String(a.id) === artistId) return false;
        if (artistName && a.name && String(a.name).trim().toLowerCase() === artistName.toLowerCase()) return false;
        return true;
      });
    } else {
      list.push({
        id: artistId || `artist_${Date.now()}`,
        name: artistName || 'Unknown Artist',
        avatar: artistData.avatar || artistData.thumbnail || ''
      });
    }

    try {
      localStorage.setItem(getStorageKey('followed_artists'), JSON.stringify(list));
    } catch (e) {}

    // Cloud sync for authenticated user
    syncFollowedArtistsWithBackend(list);

    if (typeof root.showToastNotification === 'function') {
      root.showToastNotification(!followed ? `Вы подписались на ${artistName}` : `Вы отписались от ${artistName}`, 'info');
    }

    try {
      window.dispatchEvent(new CustomEvent('gp:followed-artists-changed', { detail: { list } }));
    } catch (e) {}

    if (typeof root.invalidateHomeRecommendations === 'function') {
      root.invalidateHomeRecommendations();
    } else if (root.GP?.Views?.Home?.invalidateHomeRecommendations) {
      root.GP.Views.Home.invalidateHomeRecommendations();
    }

    return !followed;
  }

  // --- Profile Loader & Views ---

  async function loadArtistView(artistIdentifier, fallbackArtistName) {
    const artistKey = String(artistIdentifier || fallbackArtistName || '').trim();
    if (!artistKey || artistKey === 'undefined' || artistKey === 'null') {
      console.warn('[Artist View] loadArtistView called with invalid artist identifier');
      return;
    }

    if (typeof root !== 'undefined') {
      root.activeView = 'artist';
      if (root.GP?.NavigationHistory?.push) {
        root.GP.NavigationHistory.push({ view: 'artist', artistId: artistKey });
      }
    }

    const welcomeScreen = document.getElementById('welcome-screen');
    const tracksContainer = document.getElementById('tracks-container');
    const loadingIndicator = document.getElementById('loading-indicator');

    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    if (tracksContainer) tracksContainer.classList.add('hidden');
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    let artistData = null;

    // 1. First attempt: Backend artist endpoint (resolves numeric ID or username)
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 7000) : null;

      const backendUrl = getBackendUrl();
      const response = await fetch(`${backendUrl}/search/artist/${encodeURIComponent(artistKey)}`, {
        signal: controller ? controller.signal : undefined
      });
      if (timeoutId) clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && data.results) {
          artistData = data.results;
        }
      }
    } catch (error) {
      console.warn('[Artist View] Backend artist fetch failed, falling back to direct engine:', error.message);
    }

    // 2. DirectSoundCloudEngine fallback (offline or sleeping backend)
    if (!artistData) {
      const directSCEngine = root.DirectSoundCloudEngine || (typeof DirectSoundCloudEngine !== 'undefined' ? DirectSoundCloudEngine : null);
      if (directSCEngine && typeof directSCEngine.getArtistProfile === 'function') {
        try {
          artistData = await directSCEngine.getArtistProfile(artistKey);
        } catch (scErr) {
          console.warn('[Artist View] Direct SC engine profile fetch failed:', scErr.message);
        }
      }
    }

    if (loadingIndicator) loadingIndicator.classList.add('hidden');

    if (artistData) {
      renderArtistProfile(artistData);
      if (tracksContainer) tracksContainer.classList.remove('hidden');
    } else {
      renderArtistProfileError('Артист не найден', `Не удалось загрузить данные артиста «${escapeHTML(fallbackArtistName || artistKey)}».`, fallbackArtistName || artistKey);
    }

    if (typeof root.updateActiveTab === 'function') {
      root.updateActiveTab('artist');
    }
  }

  function closeArtistProfile() {
    if (root.GP?.NavigationHistory?.canGoBack && root.GP.NavigationHistory.canGoBack()) {
      root.GP.NavigationHistory.back();
    } else if (typeof root.loadHomeView === 'function') {
      root.loadHomeView();
    } else if (root.GP?.Views?.Home?.loadHomeView) {
      root.GP.Views.Home.loadHomeView();
    }
  }

  function renderArtistProfileError(title = 'Артист не найден', message = 'SoundCloud не отдал данные профиля.', fallbackName = '') {
    const tracksContainer = document.getElementById('tracks-container');
    if (!tracksContainer) return;

    const playlist = Array.isArray(root.playlist) ? root.playlist : [];
    const currentTrackIndex = typeof root.currentTrackIndex === 'number' ? root.currentTrackIndex : -1;
    const track = playlist[currentTrackIndex];
    const searchInput = document.getElementById('search-input');
    const artistName = fallbackName || track?.artist || searchInput?.value || '';

    tracksContainer.innerHTML = `
      <div class="welcome-state artist-profile-error" style="padding: 40px 20px;">
        <button id="back-to-previous" class="artist-back-btn" type="button" style="margin-bottom: 20px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
          <span>Назад</span>
        </button>
        <h2 style="font-size: 22px; margin-bottom: 8px;">${escapeHTML(title)}</h2>
        <p style="color: var(--text-dim); margin-bottom: 20px;">${escapeHTML(message)}</p>
        <button id="artist-global-search-btn" class="view-btn">
          <span>Искать «${escapeHTML(artistName)}» в поиске</span>
        </button>
      </div>
    `;
    tracksContainer.classList.remove('hidden');

    document.getElementById('back-to-previous')?.addEventListener('click', () => {
      closeArtistProfile();
    });

    const searchBtn = document.getElementById('artist-global-search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        if (!artistName || !searchInput) return;
        searchInput.value = artistName;
        if (typeof root.performSearch === 'function') {
          root.performSearch();
        } else if (root.GP?.Views?.Search?.performSearch) {
          root.GP.Views.Search.performSearch();
        }
      });
    }
  }

  function renderArtistProfile(artistData) {
    const tracksContainer = document.getElementById('tracks-container');
    if (!tracksContainer || !artistData) return;

    tracksContainer.innerHTML = '';

    const followed = isArtistFollowed(artistData.id, artistData.name);
    const avatarUrl = artistData.avatar || getFallbackCover('');
    const fallbackAvatar = getFallbackCover('');

    const header = document.createElement('div');
    header.className = 'artist-header';
    header.innerHTML = `
      <div class="artist-avatar-wrap">
        <img class="artist-avatar" src="${avatarUrl}" alt="${escapeHTML(artistData.name || '')}" onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='${fallbackAvatar}';}">
      </div>
      <div class="artist-info">
        <button id="back-to-previous" class="artist-back-btn" type="button">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
          <span>Назад</span>
        </button>
        <h2>${escapeHTML(artistData.name || 'Неизвестный исполнитель')}</h2>
        <div class="artist-meta">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          <span>${(artistData.followers || 0).toLocaleString('ru-RU')} подписчиков</span>
        </div>
        <button id="follow-artist-btn" class="artist-follow-btn ${followed ? 'active' : ''}" type="button">
          <svg class="follow-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${followed 
              ? '<polyline points="20 6 9 17 4 12"></polyline>' 
              : '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>'
            }
          </svg>
          <span class="follow-text">${followed ? 'Подписан' : 'Подписаться'}</span>
        </button>
        ${artistData.description ? `<p class="artist-desc">${escapeHTML(artistData.description)}</p>` : ''}
      </div>
    `;
    tracksContainer.appendChild(header);

    const followBtn = header.querySelector('#follow-artist-btn');
    if (followBtn) {
      const updateButtonVisuals = (isFollowed, isHovered = false) => {
        const textSpan = followBtn.querySelector('.follow-text');
        const iconSvg = followBtn.querySelector('.follow-icon');
        if (isFollowed) {
          followBtn.classList.add('active');
          if (isHovered) {
            if (textSpan) textSpan.textContent = 'Отписаться';
            if (iconSvg) iconSvg.innerHTML = '<line x1="5" y1="12" x2="19" y2="12"></line>';
          } else {
            if (textSpan) textSpan.textContent = 'Подписан';
            if (iconSvg) iconSvg.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
          }
        } else {
          followBtn.classList.remove('active');
          if (textSpan) textSpan.textContent = 'Подписаться';
          if (iconSvg) iconSvg.innerHTML = '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>';
        }
      };

      followBtn.addEventListener('click', () => {
        const nowFollowed = toggleFollowArtist(artistData);
        updateButtonVisuals(nowFollowed, false);
      });

      followBtn.addEventListener('mouseenter', () => {
        if (followBtn.classList.contains('active')) {
          updateButtonVisuals(true, true);
        }
      });

      followBtn.addEventListener('mouseleave', () => {
        if (followBtn.classList.contains('active')) {
          updateButtonVisuals(true, false);
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

    // 1. Popular Tracks Section
    const popular = (artistData.popularTracks && artistData.popularTracks.length > 0)
      ? artistData.popularTracks
      : (artistData.tracks || []).slice(0, 10);

    if (popular.length > 0) {
      const popularSection = document.createElement('div');
      popularSection.className = 'home-section';
      popularSection.innerHTML = '<div class="home-section-title">Популярные треки</div>';

      const popGrid = document.createElement('div');
      popGrid.className = 'tracks-layout-grid';
      popularSection.appendChild(popGrid);

      sections.appendChild(popularSection);

      if (typeof root.renderTracks === 'function') {
        root.renderTracks(popular, popGrid);
      }
    }

    // 2. All Releases / Chronological Tracks Section (from newest to oldest)
    const allTracks = (artistData.allTracks && artistData.allTracks.length > 0)
      ? artistData.allTracks
      : (artistData.tracks || []);

    if (allTracks.length > 0) {
      const allSection = document.createElement('div');
      allSection.className = 'home-section';
      allSection.innerHTML = '<div class="home-section-title">Все релизы и треки</div>';

      const allGrid = document.createElement('div');
      allGrid.className = 'tracks-layout-grid';
      allSection.appendChild(allGrid);

      const PAGE_SIZE = 12;
      let displayedCount = Math.min(PAGE_SIZE, allTracks.length);

      if (typeof root.renderTracks === 'function') {
        root.renderTracks(allTracks.slice(0, displayedCount), allGrid);
      }

      if (allTracks.length > displayedCount) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.className = 'view-btn';
        loadMoreBtn.style.margin = '16px auto 0';
        loadMoreBtn.style.display = 'inline-flex';
        loadMoreBtn.style.alignItems = 'center';
        loadMoreBtn.style.gap = '8px';
        loadMoreBtn.style.padding = '8px 20px';
        loadMoreBtn.style.borderRadius = '12px';
        loadMoreBtn.innerHTML = `
          <span>Показать ещё</span>
          <span style="opacity: 0.6; font-size: 11px;">(${allTracks.length - displayedCount})</span>
        `;

        loadMoreBtn.addEventListener('click', () => {
          const nextCount = Math.min(displayedCount + 15, allTracks.length);
          const chunk = allTracks.slice(displayedCount, nextCount);
          displayedCount = nextCount;

          if (typeof root.renderTracks === 'function') {
            root.renderTracks(chunk, allGrid, true);
          }

          if (displayedCount >= allTracks.length) {
            loadMoreBtn.remove();
          } else {
            loadMoreBtn.innerHTML = `
              <span>Показать ещё</span>
              <span style="opacity: 0.6; font-size: 11px;">(${allTracks.length - displayedCount})</span>
            `;
          }
        });

        const btnContainer = document.createElement('div');
        btnContainer.style.textAlign = 'center';
        btnContainer.style.width = '100%';
        btnContainer.appendChild(loadMoreBtn);
        allSection.appendChild(btnContainer);
      }

      sections.appendChild(allSection);
    } else if (popular.length === 0) {
      const emptyTracksSection = document.createElement('div');
      emptyTracksSection.className = 'home-section';
      emptyTracksSection.innerHTML = `
        <div class="home-section-title">Популярные треки</div>
        <div class="welcome-state" style="padding: 24px 16px; margin-top: 8px;">
          <p style="color: var(--text-dim); margin: 0;">У этого исполнителя пока нет опубликованных треков.</p>
        </div>
      `;
      sections.appendChild(emptyTracksSection);
    }

    // 3. Playlists & Albums Section
    if (artistData.playlists && artistData.playlists.length > 0) {
      const playlistsSection = document.createElement('div');
      playlistsSection.className = 'home-section';
      playlistsSection.innerHTML = '<div class="home-section-title">Альбомы и сборники</div>';

      const scroller = document.createElement('div');
      scroller.className = 'scroller-container';
      playlistsSection.appendChild(scroller);

      artistData.playlists.forEach(pl => {
        const card = document.createElement('div');
        card.className = 'album-card-horizontal';
        card.style.cursor = 'pointer';

        const plThumbnail = getOptimalCover(pl.thumbnail);
        const fallbackPlThumbnail = getFallbackCover(pl.thumbnail);

        card.innerHTML = `
          <div class="album-card-cover-wrap">
            <img class="album-card-cover" src="${plThumbnail}" onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='${fallbackPlThumbnail}';}">
          </div>
          <div class="album-card-title">${escapeHTML(pl.name || 'Альбом')}</div>
          <div class="album-card-author">${pl.tracksCount || 0} треков</div>
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
      let results = [];
      try {
        const backendUrl = getBackendUrl();
        const response = await fetch(`${backendUrl}/search/playlist/${playlistId}`);
        if (response.ok) {
          const data = await response.json();
          if (data && data.status === 'success' && Array.isArray(data.results)) {
            results = data.results;
          }
        }
      } catch (e) {
        console.warn('[Artist View] Backend playlist fetch failed, trying direct engine:', e.message);
      }

      if (results.length === 0 && root.DirectSoundCloudEngine?.getPlaylist) {
        results = await root.DirectSoundCloudEngine.getPlaylist(playlistId);
      }

      if (loadingIndicator) loadingIndicator.classList.add('hidden');

      if (results && results.length > 0) {
        root.playlist = results;

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
              <span>${escapeHTML(playlistName || 'Плейлист артиста')}</span>
              <span class="view-header-subtitle">(${root.playlist.length} треков)</span>
            </div>
          `;
          tracksContainer.appendChild(viewHeader);

          document.getElementById('back-to-artist')?.addEventListener('click', () => {
            const artistId = root.playlist[0]?.artistId || root.playlist[0]?.artist || '';
            if (artistId) {
              loadArtistView(artistId);
            } else {
              closeArtistProfile();
            }
          });

          const listGrid = document.createElement('div');
          listGrid.className = 'tracks-layout-grid';
          tracksContainer.appendChild(listGrid);
          if (typeof root.renderTracks === 'function') {
            root.renderTracks(root.playlist, listGrid);
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
    getFollowedArtists,
    syncFollowedArtistsWithBackend
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
  root.syncFollowedArtistsWithBackend = syncFollowedArtistsWithBackend;

})(typeof window !== 'undefined' ? window : global);
