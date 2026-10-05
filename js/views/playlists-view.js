/**
 * GlassPlayer - Playlists & Collections View Module
 * Namespace: window.GP.Views.Playlists
 * Handles user playlists (CRUD), track assignment, playlist playback queue integration,
 * collaborative playlists, and friend playlist profiles.
 */

(function (window) {
  'use strict';

  // Ensure namespaces
  window.GP = window.GP || {};
  window.GP.Views = window.GP.Views || {};

  // Reactive state
  let _activePlaylistId = null;
  if (!Object.getOwnPropertyDescriptor(window, 'activePlaylistId')) {
    Object.defineProperty(window, 'activePlaylistId', {
      get: () => _activePlaylistId,
      set: (val) => { _activePlaylistId = val; },
      configurable: true
    });
  }

  let _selectedTrackForPlaylist = null;
  if (!Object.getOwnPropertyDescriptor(window, 'selectedTrackForPlaylist')) {
    Object.defineProperty(window, 'selectedTrackForPlaylist', {
      get: () => _selectedTrackForPlaylist,
      set: (val) => { _selectedTrackForPlaylist = val; },
      configurable: true
    });
  }

  const DEFAULT_AVATAR_100 = (typeof window !== 'undefined' && window.DEFAULT_AVATAR_100) ||
    ('data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#333"/><path d="M50 44a12 12 0 1 0 0-24 12 12 0 0 0 0 24zm0 8c-16 0-22 10-22 18v4h44v-4c0-8-6-18-22-18z" fill="#666"/></svg>'));

  function getBackendUrl() {
    return (typeof window !== 'undefined' && window.BACKEND_URL) ||
      (typeof window !== 'undefined' && window.API_URL ? `${window.API_URL}/api` : 'https://music-backend-iyni.onrender.com/api');
  }

  function getPlaylistsStorageKey() {
    if (typeof window !== 'undefined' && typeof window.getStorageKey === 'function') {
      return window.getStorageKey('playlists');
    }
    const suffix = (typeof window !== 'undefined' && typeof window.getStorageOwnerSuffix === 'function')
      ? window.getStorageOwnerSuffix()
      : ((typeof window !== 'undefined' && window.currentUser) ? `account_${String(window.currentUser.id || window.currentUser.username || 'unknown').replace(/[^a-z0-9_-]/gi, '_')}` : ((typeof window !== 'undefined' && window.currentProfile) || 'Default'));
    return `gp_playlists_${suffix}`;
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

  function showToast(msg, type, title) {
    const toast = typeof window !== 'undefined' && window.showToastNotification;
    if (typeof toast === 'function') {
      toast(msg, type, title);
    } else {
      console.log(`[Toast ${type || 'info'}]: ${title ? title + ' - ' : ''}${msg}`);
    }
  }

  // --- Storage Accessors ---

  function getPlaylists() {
    const key = getPlaylistsStorageKey();
    const data = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    try {
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  function savePlaylists(playlists, sync = true) {
    const key = getPlaylistsStorageKey();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(playlists));
    }
    const currentUser = typeof window !== 'undefined' && window.currentUser;
    const token = typeof window !== 'undefined' && window.token;
    if (sync && currentUser && token) {
      if (typeof window.syncPlaylistsWithBackend === 'function') {
        window.syncPlaylistsWithBackend(playlists);
      } else if (window.GP && window.GP.Social && window.GP.Social.Auth && typeof window.GP.Social.Auth.syncPlaylistsWithBackend === 'function') {
        window.GP.Social.Auth.syncPlaylistsWithBackend(playlists);
      }
    }
  }

  // --- View Loaders ---

  function loadPlaylistsView() {
    if (typeof window !== 'undefined') {
      window.activeView = 'playlists';
      if (window.GP?.NavigationHistory?.push) {
        window.GP.NavigationHistory.push({ view: 'playlists' });
      }
    }
    const searchInput = document.getElementById('search-input');
    const welcomeScreen = document.getElementById('welcome-screen');
    const tracksContainer = document.getElementById('tracks-container');
    const loadingIndicator = document.getElementById('loading-indicator');

    if (searchInput) searchInput.value = '';
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    if (tracksContainer) tracksContainer.classList.add('hidden');
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    setTimeout(() => {
      renderPlaylists();
    }, 200);
  }

  function closePlaylist() {
    loadPlaylistsView();
  }

  // --- Playlists View Rendering ---

  function renderPlaylists() {
    const loadingIndicator = document.getElementById('loading-indicator');
    const tracksContainer = document.getElementById('tracks-container');
    const playlistModal = document.getElementById('playlist-modal');
    const newPlaylistInput = document.getElementById('new-playlist-input');

    if (loadingIndicator) loadingIndicator.classList.add('hidden');
    if (!tracksContainer) return;

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

    const addBtn = document.getElementById('add-playlist-btn-view');
    if (addBtn && playlistModal) {
      addBtn.addEventListener('click', () => {
        playlistModal.classList.remove('hidden');
        if (newPlaylistInput) newPlaylistInput.focus();
      });
    }

    if (playlists && playlists.length > 0) {
      const grid = document.createElement('div');
      grid.className = 'tracks-layout-grid';

      const friendStatuses = (typeof window !== 'undefined' && window.friendStatuses) ||
        (window.GP && window.GP.Social && window.GP.Social.Socket && window.GP.Social.Socket.friendStatuses) ||
        new Map();

      playlists.forEach(pl => {
        const isCollab = pl.isCollaborative || false;
        let isFriendListening = false;
        if (isCollab && friendStatuses instanceof Map) {
          for (const [, status] of friendStatuses.entries()) {
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
          <div class="playlist-card-title">${escapeHTML(pl.name)}</div>
          <div class="playlist-card-count">${pl.tracks ? pl.tracks.length : 0} tracks</div>
          <button class="playlist-delete-btn" title="Delete Playlist">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        `;

        card.addEventListener('click', (e) => {
          if (e.target.closest('.playlist-delete-btn')) return;
          openPlaylist(pl.id);
        });

        const delBtn = card.querySelector('.playlist-delete-btn');
        if (delBtn) {
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deletePlaylist(pl.id);
          });
        }

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
    if (typeof window.updateActiveTab === 'function') {
      window.updateActiveTab('playlists');
    }
  }

  // --- Playlist Tracks View ---

  function openPlaylist(playlistId) {
    if (typeof window !== 'undefined') {
      window.activeView = 'playlist-tracks';
      window.activePlaylistId = playlistId;
      if (window.GP?.NavigationHistory?.push) {
        window.GP.NavigationHistory.push({ view: 'playlists', playlistId });
      }
    }
    _activePlaylistId = playlistId;

    const tracksContainer = document.getElementById('tracks-container');
    if (!tracksContainer) return;

    const playlists = getPlaylists();
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;

    tracksContainer.innerHTML = '';

    const currentUser = (typeof window !== 'undefined' && window.currentUser) || null;
    const mutualFriends = (typeof window !== 'undefined' && window.mutualFriends) || [];
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
          <div class="collab-avatar-item" style="display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; color: #fff; background: #3a3f50; border: 2px solid var(--player-bg); border-radius: 50%; width: 26px; height: 26px;" title="${escapeHTML(name)}">
            ${initial}
          </div>
        `;
      });
      avatarsStackHtml += `</div>`;
    }

    const hasTracks = pl.tracks && pl.tracks.length > 0;
    const playAllBtnHtml = hasTracks ? `
      <button id="playlist-play-all-btn" class="view-btn primary" style="height: 34px; padding: 0 14px; font-size: 12px; gap: 6px; display: inline-flex; align-items: center;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        <span>Слушать все</span>
      </button>
    ` : '';

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
          <span style="font-size: 20px; font-weight: 600;">${escapeHTML(pl.name)}</span>
          <span class="view-header-subtitle" style="margin-left: 6px;">(${pl.tracks ? pl.tracks.length : 0} tracks)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${playAllBtnHtml}
          ${collabBtnHtml}
        </div>
      </div>
      ${avatarsStackHtml}
    `;
    tracksContainer.appendChild(viewHeader);

    const backBtn = document.getElementById('back-to-playlists');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        loadPlaylistsView();
      });
    }

    const playAllBtn = document.getElementById('playlist-play-all-btn');
    if (playAllBtn) {
      playAllBtn.addEventListener('click', () => {
        playPlaylist(playlistId, 0);
      });
    }

    if (isOwner) {
      const makeCollabBtn = document.getElementById('make-collab-btn');
      if (makeCollabBtn) {
        makeCollabBtn.addEventListener('click', () => {
          if (typeof window.openCollabModal === 'function') {
            window.openCollabModal(playlistId);
          } else if (window.GP && window.GP.Social && window.GP.Social.Friends && typeof window.GP.Social.Friends.openCollabModal === 'function') {
            window.GP.Social.Friends.openCollabModal(playlistId);
          }
        });
      }
    }

    if (hasTracks) {
      if (typeof window !== 'undefined') {
        window.playlist = pl.tracks;
      }

      const listGrid = document.createElement('div');
      listGrid.className = 'tracks-layout-grid';
      tracksContainer.appendChild(listGrid);

      if (typeof window.renderTracks === 'function') {
        window.renderTracks(pl.tracks, listGrid);
      }
    } else {
      if (typeof window !== 'undefined') {
        window.playlist = [];
      }
      const emptyState = document.createElement('div');
      emptyState.className = 'welcome-state';
      emptyState.innerHTML = '<h2>This playlist is empty</h2><p>Add tracks here using the "+" button on search results</p>';
      tracksContainer.appendChild(emptyState);
    }

    tracksContainer.classList.remove('hidden');
    if (typeof window.updateActiveTab === 'function') {
      window.updateActiveTab('playlists');
    }
  }

  // Play entire playlist starting at index
  function playPlaylist(playlistId, startIndex = 0) {
    const playlists = getPlaylists();
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl || !pl.tracks || pl.tracks.length === 0) return;

    if (typeof window !== 'undefined') {
      window.playlist = pl.tracks;
    }

    if (window.GP && window.GP.Player && typeof window.GP.Player.playTrack === 'function') {
      window.GP.Player.playTrack(startIndex);
    } else if (typeof window.playTrack === 'function') {
      window.playTrack(startIndex);
    }
  }

  // --- CRUD Operations ---

  function addTrackToPlaylistId(playlistId, track) {
    if (!track || !track.id) return;
    let playlists = getPlaylists();
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;

    pl.tracks = pl.tracks || [];
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
    if (!pl || !pl.tracks) return;

    pl.tracks = pl.tracks.filter(t => t.id !== trackId);
    savePlaylists(playlists);
  }

  function removeTrackFromPlaylist(trackId) {
    const currentView = (typeof window !== 'undefined' && window.activeView) || '';
    const currentId = (typeof window !== 'undefined' && window.activePlaylistId) || _activePlaylistId;
    if (currentView !== 'playlist-tracks' || !currentId) return;
    removeTrackFromPlaylistId(currentId, trackId);
    openPlaylist(currentId);
  }

  function deletePlaylist(playlistId) {
    let playlists = getPlaylists();
    playlists = playlists.filter(p => p.id !== playlistId);
    savePlaylists(playlists);
    renderPlaylists();
  }

  function createPlaylist(name) {
    const cleanedName = (name || '').trim();
    if (!cleanedName) return;

    let playlists = getPlaylists();

    if (playlists.some(p => p.name.toLowerCase() === cleanedName.toLowerCase())) {
      showToast('Плейлист с таким именем уже существует.', 'warning', 'Плейлисты');
      return;
    }

    const newPl = {
      id: 'pl_' + Date.now(),
      name: cleanedName,
      tracks: []
    };

    playlists.push(newPl);
    savePlaylists(playlists);

    const selectedTrack = (typeof window !== 'undefined' && window.selectedTrackForPlaylist) || _selectedTrackForPlaylist;
    if (selectedTrack) {
      addTrackToPlaylistId(newPl.id, selectedTrack);
      if (typeof window !== 'undefined') {
        window.selectedTrackForPlaylist = null;
      }
      _selectedTrackForPlaylist = null;
    }

    const currentView = (typeof window !== 'undefined' && window.activeView) || '';
    if (currentView === 'playlists') {
      renderPlaylists();
    }
  }

  function renamePlaylist(playlistId, newName) {
    const cleanedName = (newName || '').trim();
    if (!cleanedName) return false;
    let playlists = getPlaylists();
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return false;

    pl.name = cleanedName;
    savePlaylists(playlists);

    const currentView = (typeof window !== 'undefined' && window.activeView) || '';
    const currentId = (typeof window !== 'undefined' && window.activePlaylistId) || _activePlaylistId;

    if (currentView === 'playlists') {
      renderPlaylists();
    } else if (currentView === 'playlist-tracks' && currentId === playlistId) {
      openPlaylist(playlistId);
    }
    showToast(`Плейлист переименован в "${cleanedName}"`, 'success', 'Плейлисты');
    return true;
  }

  // --- Context Menu for Adding Tracks ---

  function showPlaylistMenu(e, track) {
    if (typeof window !== 'undefined') {
      window.selectedTrackForPlaylist = track;
    }
    _selectedTrackForPlaylist = track;

    const rect = e.currentTarget.getBoundingClientRect();
    const playlists = getPlaylists();
    const playlistMenu = document.getElementById('playlist-menu');
    const playlistMenuList = document.getElementById('playlist-menu-list');
    const playlistModal = document.getElementById('playlist-modal');
    const newPlaylistInput = document.getElementById('new-playlist-input');

    if (!playlistMenuList || !playlistMenu) return;

    playlistMenuList.innerHTML = '<div class="playlist-menu-title">Add to Playlist</div>';

    if (playlists && playlists.length > 0) {
      playlists.forEach(pl => {
        const item = document.createElement('button');
        item.className = 'playlist-menu-item';

        const containsTrack = pl.tracks && pl.tracks.some(t => t.id === track.id);

        item.innerHTML = `
          <span>${escapeHTML(pl.name)}</span>
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
      noPlaylists.className = 'playlist-menu-item playlist-menu-empty';
      noPlaylists.innerHTML = '<span>No Playlists</span>';
      playlistMenuList.appendChild(noPlaylists);
    }

    const createNewItem = document.createElement('button');
    createNewItem.className = 'playlist-menu-item playlist-menu-create';
    createNewItem.innerHTML = '<span>+ New Playlist</span>';
    createNewItem.addEventListener('click', () => {
      playlistMenu.classList.add('hidden');
      if (playlistModal) {
        playlistModal.classList.remove('hidden');
        if (newPlaylistInput) newPlaylistInput.focus();
      }
    });
    playlistMenuList.appendChild(createNewItem);

    if (typeof window.appendShareItemToTrackMenu === 'function') {
      window.appendShareItemToTrackMenu(track);
    }

    playlistMenu.style.top = `${rect.bottom + (window.scrollY || 0) + 6}px`;
    playlistMenu.style.left = `${Math.min(rect.left + (window.scrollX || 0), (window.innerWidth || 1000) - 200)}px`;
    playlistMenu.classList.remove('hidden');
  }

  // --- Collaborative & Friend Playlists Logic ---

  function mergeAndSyncPlaylists(cloudPlaylists) {
    const localPlaylists = getPlaylists();
    const merged = [...(cloudPlaylists || [])];

    for (const localPl of localPlaylists) {
      const exists = merged.some(cloudPl => cloudPl.id === localPl.id || cloudPl.name.toLowerCase() === localPl.name.toLowerCase());
      if (!exists) {
        merged.push(localPl);
      }
    }

    localStorage.setItem(getPlaylistsStorageKey(), JSON.stringify(merged));

    const currentUser = typeof window !== 'undefined' && window.currentUser;
    const token = typeof window !== 'undefined' && window.token;
    if (merged.length > (cloudPlaylists ? cloudPlaylists.length : 0) && currentUser && token) {
      if (typeof window.syncPlaylistsWithBackend === 'function') {
        window.syncPlaylistsWithBackend(merged);
      } else if (window.GP && window.GP.Social && window.GP.Social.Auth && typeof window.GP.Social.Auth.syncPlaylistsWithBackend === 'function') {
        window.GP.Social.Auth.syncPlaylistsWithBackend(merged);
      }
    }
  }

  async function loadFriendProfile(userId) {
    if (typeof window !== 'undefined') window.activeView = 'friend-profile';
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    const usersContainer = document.getElementById('users-search-results');
    if (usersContainer) usersContainer.classList.add('hidden');

    const welcomeScreen = document.getElementById('welcome-screen');
    const tracksContainer = document.getElementById('tracks-container');
    const loadingIndicator = document.getElementById('loading-indicator');

    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    if (tracksContainer) tracksContainer.classList.add('hidden');
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    const existingBtn = document.getElementById('load-more-btn');
    if (existingBtn) existingBtn.remove();
    const existingMsg = document.getElementById('load-more-limit-msg');
    if (existingMsg) existingMsg.remove();

    try {
      const response = await fetch(`${getBackendUrl()}/users/${userId}`);
      const data = await response.json();

      if (loadingIndicator) loadingIndicator.classList.add('hidden');

      if (data.status === 'success' && data.user) {
        const friend = data.user;
        if (tracksContainer) tracksContainer.innerHTML = '';

        const avatarSrc = friend.avatarBase64 || DEFAULT_AVATAR_100;
        const friendStatuses = (typeof window !== 'undefined' && window.friendStatuses) ||
          (window.GP && window.GP.Social && window.GP.Social.Socket && window.GP.Social.Socket.friendStatuses) ||
          new Map();
        const liveStatus = friendStatuses instanceof Map ? friendStatuses.get(friend.id) : null;
        const isOnline = liveStatus ? Boolean(liveStatus.isOnline) : Boolean(friend.isOnline);
        const lastSeen = (liveStatus && liveStatus.lastSeen) || friend.lastSeen;

        const getFullDateTooltip = (window.GP && window.GP.Utils && window.GP.Utils.getFullDateTooltip) || window.getFullDateTooltip || ((d) => String(d || ''));
        const formatLastSeen = (window.GP && window.GP.Utils && window.GP.Utils.formatLastSeen) || window.formatLastSeen || ((d) => String(d || ''));
        const formatUsername = (window.GP && window.GP.Utils && window.GP.Utils.formatUsername) || window.formatUsername || ((u) => '@' + String(u || ''));

        const fullDate = getFullDateTooltip(lastSeen);
        const presenceHtml = isOnline
          ? '<div class="friend-profile-presence online"><span class="presence-dot"></span><span>В сети</span></div>'
          : `<div class="friend-profile-presence offline" title="${escapeHTML(fullDate)}"><span class="presence-dot"></span><span>${escapeHTML(formatLastSeen(lastSeen))}</span></div>`;

        const headerCard = document.createElement('div');
        headerCard.className = 'friend-profile-banner';
        headerCard.innerHTML = `
          <img class="friend-profile-avatar" src="${avatarSrc}" alt="Avatar">
          <h2 class="friend-profile-name">${escapeHTML(friend.displayName)}</h2>
          <p class="friend-profile-username">${formatUsername(escapeHTML(friend.username))}</p>
          <div class="friend-profile-presence-wrap">${presenceHtml}</div>
          <p class="friend-profile-bio">${escapeHTML(friend.bio || 'Нет описания')}</p>
          <div class="friend-profile-stats">
            <span><strong>${friend.likedTracks ? friend.likedTracks.length : 0}</strong> лайков</span>
            <span><strong>${friend.playlists ? friend.playlists.length : 0}</strong> плейлистов</span>
          </div>
        `;
        tracksContainer.appendChild(headerCard);

        const playlistsSection = document.createElement('div');
        playlistsSection.className = 'friend-playlists-section';

        const pHeader = document.createElement('h3');
        pHeader.textContent = 'Плейлисты и Избранное';
        playlistsSection.appendChild(pHeader);

        const pRow = document.createElement('div');
        pRow.className = 'friend-playlists-row';

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
          if (typeof window !== 'undefined') window.playlist = friend.likedTracks;
          if (typeof window.renderTracks === 'function') window.renderTracks(friend.likedTracks, gridContainer, true);
        } else {
          const noTracksMsg = document.createElement('div');
          noTracksMsg.className = 'welcome-state';
          noTracksMsg.style.minHeight = '150px';
          noTracksMsg.style.marginTop = '10px';
          noTracksMsg.innerHTML = '<p>В избранном пока нет треков</p>';
          gridContainer.appendChild(noTracksMsg);
        }

        tracksContainer.classList.remove('hidden');
        if (typeof window.updateActiveTab === 'function') {
          window.updateActiveTab(null);
        }
      } else {
        if (tracksContainer) {
          tracksContainer.innerHTML = `<div class="welcome-state"><h2>Ошибка</h2><p>${data.message || 'Не удалось загрузить профиль пользователя'}</p></div>`;
          tracksContainer.classList.remove('hidden');
        }
      }
    } catch (error) {
      console.error('Error loading friend profile:', error);
      if (loadingIndicator) loadingIndicator.classList.add('hidden');
      if (tracksContainer) {
        tracksContainer.innerHTML = '<div class="welcome-state"><h2>Не удалось подключиться к серверу</h2><p>Пожалуйста, проверьте подключение бэкенда</p></div>';
        tracksContainer.classList.remove('hidden');
      }
    }
  }

  function showFriendLikedTracks(friend) {
    const tracksContainer = document.getElementById('tracks-container');
    const titleText = document.getElementById('friend-tracks-title-text');
    if (titleText) titleText.textContent = 'Избранное';
    const titleIcon = document.getElementById('friend-tracks-title-icon');
    if (titleIcon) {
      titleIcon.innerHTML = `<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>`;
      titleIcon.setAttribute('fill', 'currentColor');
    }

    if (tracksContainer) {
      const gridContainer = tracksContainer.querySelector('.tracks-layout-grid');
      if (gridContainer) {
        gridContainer.innerHTML = '';
        if (friend.likedTracks && friend.likedTracks.length > 0) {
          if (typeof window !== 'undefined') window.playlist = friend.likedTracks;
          if (typeof window.renderTracks === 'function') window.renderTracks(friend.likedTracks, gridContainer, true);
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
  }

  function showFriendPlaylistTracks(friend, playlistId) {
    const tracksContainer = document.getElementById('tracks-container');
    const pl = friend.playlists ? friend.playlists.find(p => p.id === playlistId) : null;
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

    if (tracksContainer) {
      const gridContainer = tracksContainer.querySelector('.tracks-layout-grid');
      if (gridContainer) {
        gridContainer.innerHTML = '';
        if (pl.tracks && pl.tracks.length > 0) {
          if (typeof window !== 'undefined') window.playlist = pl.tracks;
          if (typeof window.renderTracks === 'function') window.renderTracks(pl.tracks, gridContainer, true);
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
  }

  // Bind playlist creation modal and floating context menu listeners
  function bindPlaylistEvents() {
    if (typeof document === 'undefined') return;

    const playlistModal = document.getElementById('playlist-modal');
    const newPlaylistInput = document.getElementById('new-playlist-input');
    const cancelPlaylistBtn = document.getElementById('cancel-playlist-btn');
    const savePlaylistBtn = document.getElementById('save-playlist-btn');

    if (cancelPlaylistBtn && !cancelPlaylistBtn.dataset.gpBound) {
      cancelPlaylistBtn.dataset.gpBound = '1';
      cancelPlaylistBtn.addEventListener('click', () => {
        if (playlistModal) playlistModal.classList.add('hidden');
        if (newPlaylistInput) newPlaylistInput.value = '';
      });
    }

    if (savePlaylistBtn && !savePlaylistBtn.dataset.gpBound) {
      savePlaylistBtn.dataset.gpBound = '1';
      savePlaylistBtn.addEventListener('click', () => {
        if (newPlaylistInput) {
          createPlaylist(newPlaylistInput.value);
          if (playlistModal) playlistModal.classList.add('hidden');
          newPlaylistInput.value = '';
        }
      });
    }

    if (newPlaylistInput && !newPlaylistInput.dataset.gpBound) {
      newPlaylistInput.dataset.gpBound = '1';
      newPlaylistInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          createPlaylist(newPlaylistInput.value);
          if (playlistModal) playlistModal.classList.add('hidden');
          newPlaylistInput.value = '';
        }
      });
    }

    // Close floating playlist menu on outside clicks
    document.addEventListener('click', (e) => {
      const playlistMenu = document.getElementById('playlist-menu');
      if (playlistMenu && !playlistMenu.classList.contains('hidden')) {
        if (!e.target.closest('.playlist-add-btn') && !e.target.closest('.card-add-playlist-btn') && !e.target.closest('.track-menu-btn') && !e.target.closest('#playlist-menu')) {
          playlistMenu.classList.add('hidden');
        }
      }
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindPlaylistEvents);
    } else {
      bindPlaylistEvents();
    }
  }

  // Register on window.GP.Views.Playlists
  window.GP.Views.Playlists = {
    getPlaylists,
    savePlaylists,
    loadPlaylistsView,
    renderPlaylists,
    renderPlaylistsView: renderPlaylists,
    renderPlaylistsList: renderPlaylists,
    renderPlaylistTracksView: openPlaylist,
    openPlaylist,
    closePlaylist,
    createPlaylist,
    deletePlaylist,
    renamePlaylist,
    addTrackToPlaylist: addTrackToPlaylistId,
    addTrackToPlaylistId,
    removeTrackFromPlaylist,
    removeTrackFromPlaylistId,
    playPlaylist,
    showPlaylistMenu,
    mergeAndSyncPlaylists,
    loadFriendProfile,
    showFriendLikedTracks,
    showFriendPlaylistTracks
  };

  // Direct aliases on window for 100% backward compatibility
  window.getPlaylists = getPlaylists;
  window.savePlaylists = savePlaylists;
  window.loadPlaylistsView = loadPlaylistsView;
  window.renderPlaylists = renderPlaylists;
  window.renderPlaylistsView = renderPlaylists;
  window.renderPlaylistsList = renderPlaylists;
  window.renderPlaylistTracksView = openPlaylist;
  window.openPlaylist = openPlaylist;
  window.closePlaylist = closePlaylist;
  window.createPlaylist = createPlaylist;
  window.deletePlaylist = deletePlaylist;
  window.renamePlaylist = renamePlaylist;
  window.addTrackToPlaylist = addTrackToPlaylistId;
  window.addTrackToPlaylistId = addTrackToPlaylistId;
  window.removeTrackFromPlaylist = removeTrackFromPlaylist;
  window.removeTrackFromPlaylistId = removeTrackFromPlaylistId;
  window.playPlaylist = playPlaylist;
  window.showPlaylistMenu = showPlaylistMenu;
  window.mergeAndSyncPlaylists = mergeAndSyncPlaylists;
  window.loadFriendProfile = loadFriendProfile;
  window.showFriendLikedTracks = showFriendLikedTracks;
  window.showFriendPlaylistTracks = showFriendPlaylistTracks;

})(typeof window !== 'undefined' ? window : global);
