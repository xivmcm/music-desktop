/**
 * GlassPlayer - Social Friends & Collaboration Module
 * Namespace: window.GP.Social.Friends
 * Manages friend activity feed, Listen Along (joint playback), friend search, and collaborative playlists.
 */

(function (window) {
  'use strict';

  const friendStatuses = new Map(); // friendId -> statusObject
  let mutualFriends = [];          // Mutual friends list
  let friendActivityRefreshTimer = null;

  function getBackendUrl() {
    return (typeof window !== 'undefined' && window.BACKEND_URL) ||
      (typeof window !== 'undefined' && window.API_URL ? `${window.API_URL}/api` : 'https://music-backend-iyni.onrender.com/api');
  }

  function getUser() {
    return (window.GP && window.GP.Social && window.GP.Social.Auth && window.GP.Social.Auth.getCurrentUser && window.GP.Social.Auth.getCurrentUser()) ||
      (typeof window !== 'undefined' && window.currentUser);
  }

  function getToken() {
    return (window.GP && window.GP.Social && window.GP.Social.Auth && window.GP.Social.Auth.getToken && window.GP.Social.Auth.getToken()) ||
      (typeof window !== 'undefined' && window.token);
  }

  function showToast(msg, type, title) {
    const toast = typeof window !== 'undefined' && window.showToastNotification;
    if (typeof toast === 'function') toast(msg, type, title);
  }

  function _formatLastSeen(timestamp) {
    const fn = (window.GP && window.GP.Utils && window.GP.Utils.formatLastSeen) ||
      (typeof window !== 'undefined' && window.formatLastSeen);
    if (typeof fn === 'function') return fn(timestamp);
    return 'только что';
  }

  function _getFullDateTooltip(timestamp) {
    const fn = (window.GP && window.GP.Utils && window.GP.Utils.getFullDateTooltip) ||
      (typeof window !== 'undefined' && window.getFullDateTooltip);
    if (typeof fn === 'function') return fn(timestamp);
    return '';
  }

  function _formatUsername(username) {
    const fn = (window.GP && window.GP.Utils && window.GP.Utils.formatUsername) ||
      (typeof window !== 'undefined' && window.formatUsername);
    if (typeof fn === 'function') return fn(username);
    return `@${username || ''}`;
  }

  function _escapeHTML(str) {
    const fn = (window.GP && window.GP.Utils && window.GP.Utils.escapeHTML) ||
      (typeof window !== 'undefined' && window.escapeHTML);
    return typeof fn === 'function' ? fn(str) : String(str || '').replace(/[&<>"']/g, '');
  }

  // Fetch mutual friends and update right sidebar
  async function loadMutualFriends() {
    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`${getBackendUrl()}/users/friends`, {
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

  // Search and play a friend's active track instantly
  async function playFriendTrack(trackName, artist) {
    if (!trackName) return;
    showToast(`Searching: ${trackName} - ${artist || ''}...`, 'info', 'Плеер');

    try {
      let query = `${trackName} ${artist || ''}`.trim();
      let response = await fetch(`${getBackendUrl()}/search?q=${encodeURIComponent(query)}&sources=soundcloud,youtube&page=1&limit=5`);
      if (response.status === 200) {
        let data = await response.json();
        let tracks = data.status === 'success' ? (data.results || data.tracks || []) : [];

        // Fallback: If combined search yielded no results, try searching by trackName alone
        if (tracks.length === 0 && artist) {
          query = trackName.trim();
          response = await fetch(`${getBackendUrl()}/search?q=${encodeURIComponent(query)}&sources=soundcloud,youtube&page=1&limit=5`);
          if (response.status === 200) {
            data = await response.json();
            tracks = data.status === 'success' ? (data.results || data.tracks || []) : [];
          }
        }

        if (tracks.length > 0) {
          const track = tracks[0];
          if (typeof window !== 'undefined') {
            window.playlist = [track];
            window.currentTrackIndex = 0;
            if (typeof window.playTrack === 'function') {
              window.playTrack(0);
            }
          }
          showToast(`Воспроизведение: ${track.title}`, 'success', 'Плеер');
        } else {
          showToast('Трек не найден в медиатеке', 'error', 'Ошибка');
        }
      } else {
        showToast('Не удалось найти трек', 'error', 'Ошибка');
      }
    } catch (err) {
      console.error(err);
      showToast('Ошибка при воспроизведении трека', 'error', 'Ошибка');
    }
  }

  // Render Friend Activity sidebar panel
  function renderFriendActivity() {
    if (typeof document === 'undefined') return;
    const containerEl = document.getElementById('friend-activity-list');
    if (!containerEl) return;

    const user = getUser();
    if (!user) {
      containerEl.innerHTML = '<div class="friend-activity-empty">Войдите в аккаунт, чтобы видеть активность друзей</div>';
      return;
    }

    if (mutualFriends.length === 0) {
      containerEl.innerHTML = '<div class="friend-activity-empty">У вас еще нет взаимных друзей. Нажмите кнопку "+" выше, чтобы найти пользователей.</div>';
      return;
    }

    containerEl.innerHTML = '';

    mutualFriends.forEach(friend => {
      const liveStatus = friendStatuses.get(friend.id);
      const isOnline = liveStatus ? Boolean(liveStatus.isOnline) : Boolean(friend.isOnline);
      const isPlaying = isOnline && liveStatus && liveStatus.isPlaying && liveStatus.trackName;
      const lastSeen = (liveStatus && liveStatus.lastSeen) || friend.lastSeen;
      const fullDate = _getFullDateTooltip(lastSeen);

      const item = document.createElement('div');
      item.className = 'friend-activity-item';
      item.dataset.friendId = friend.id;

      // Status avatar
      const avatarHtml = friend.avatarBase64
        ? `<img src="${friend.avatarBase64}" class="friend-avatar" alt="${_escapeHTML(friend.displayName)}" />`
        : `<div class="friend-avatar-placeholder">${(friend.displayName || 'U')[0].toUpperCase()}</div>`;

      // Status description
      let statusText = '';
      if (isOnline) {
        if (isPlaying) {
          statusText = `
            <div class="friend-marquee" title="Слушает: ${_escapeHTML(liveStatus.trackName)} — ${_escapeHTML(liveStatus.artist)} (нажмите, чтобы включить)">
              <span>Слушает: ${_escapeHTML(liveStatus.trackName)} — ${_escapeHTML(liveStatus.artist)}</span>
            </div>
          `;
        } else {
          statusText = '<span class="friend-status-badge online">В сети</span>';
        }
      } else {
        const formatted = _formatLastSeen(lastSeen);
        statusText = `<span class="friend-status-badge offline" title="${_escapeHTML(fullDate)}">${_escapeHTML(formatted)}</span>`;
      }

      item.innerHTML = `
        <div class="friend-avatar-container" title="${isOnline ? 'В сети' : (fullDate ? 'Был(а) в сети: ' + fullDate : 'Не в сети')}">
          ${avatarHtml}
          <div class="friend-status-dot ${isOnline ? 'online' : ''} ${isPlaying ? 'playing' : ''}"></div>
        </div>
        <div class="friend-info">
          <div class="friend-name" title="${_escapeHTML(friend.displayName)} (${_formatUsername(_escapeHTML(friend.username))}) — нажать для просмотра профиля">${_escapeHTML(friend.displayName)}</div>
          <div class="friend-status-text">${statusText}</div>
        </div>
      `;

      // Make clicking on avatar or name open friend's profile
      const avatarEl = item.querySelector('.friend-avatar-container');
      const nameEl = item.querySelector('.friend-name');
      const openProfile = () => {
        if (typeof window !== 'undefined' && typeof window.loadFriendProfile === 'function') {
          window.loadFriendProfile(friend.id);
        }
      };
      if (avatarEl) {
        avatarEl.style.cursor = 'pointer';
        avatarEl.addEventListener('click', openProfile);
      }
      if (nameEl) {
        nameEl.style.cursor = 'pointer';
        nameEl.addEventListener('click', openProfile);
      }

      if (isPlaying) {
        const marqueeEl = item.querySelector('.friend-marquee');
        if (marqueeEl) {
          marqueeEl.style.cursor = 'pointer';
          marqueeEl.addEventListener('click', (e) => {
            e.stopPropagation();
            playFriendTrack(liveStatus.trackName, liveStatus.artist);
          });
        }
      }

      containerEl.appendChild(item);
    });
  }

  // Sync playlist updates from server
  async function syncPlaylistsFromServer(updatedPlaylistId) {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${getBackendUrl()}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 200) {
        const data = await res.json();
        if (data.status === 'success') {
          const u = getUser();
          if (u) {
            u.playlists = data.user.playlists;
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('auth_user', JSON.stringify(u));
            }
          }

          if (typeof window !== 'undefined' && typeof window.getStorageKey === 'function') {
            localStorage.setItem(window.getStorageKey('playlists'), JSON.stringify(data.user.playlists));
          }

          if (typeof window !== 'undefined') {
            if (window.activeView === 'playlist-tracks' && window.activePlaylistId === updatedPlaylistId) {
              if (typeof window.openPlaylist === 'function') window.openPlaylist(updatedPlaylistId);
            } else if (window.activeView === 'playlists') {
              if (typeof window.renderPlaylists === 'function') window.renderPlaylists();
            }
          }
        }
      }
    } catch (err) {
      console.error('[Sync Playlists Server Error]:', err);
    }
  }

  // Search users in find friends modal
  async function searchOtherUsers(query) {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${getBackendUrl()}/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 200) {
        const data = await res.json();
        if (data.status === 'success') {
          const users = data.users || [];
          const filtered = users.filter(u =>
            (u.username && u.username.toLowerCase().includes(query.toLowerCase())) ||
            (u.displayName && u.displayName.toLowerCase().includes(query.toLowerCase()))
          );
          renderFindFriendsList(filtered);
        }
      }
    } catch (error) {
      console.error('[Search Users Error]:', error);
    }
  }

  // Render users list in find friends modal
  function renderFindFriendsList(users) {
    if (typeof document === 'undefined') return;
    const findFriendsList = document.getElementById('find-friends-list');
    if (!findFriendsList) return;

    if (users.length === 0) {
      findFriendsList.innerHTML = '<div style="text-align: center; color: var(--text-dim); font-size: 12px; padding: 20px;">Пользователи не найдены</div>';
      return;
    }

    const currentUser = getUser();
    findFriendsList.innerHTML = '';
    users.forEach(user => {
      const isFollowing = currentUser && currentUser.following && currentUser.following.includes(user.id);
      const liveStatus = friendStatuses.get(user.id);
      const isOnline = liveStatus ? Boolean(liveStatus.isOnline) : Boolean(user.isOnline);
      const lastSeen = (liveStatus && liveStatus.lastSeen) || user.lastSeen;
      const fullDate = _getFullDateTooltip(lastSeen);
      const statusHtml = isOnline
        ? '<span style="color: #30d158; font-weight: 500;">в сети</span>'
        : `<span style="opacity: 0.65;" title="${_escapeHTML(fullDate)}">${_escapeHTML(_formatLastSeen(lastSeen))}</span>`;

      const row = document.createElement('div');
      row.className = 'user-search-row';
      row.innerHTML = `
        <div class="user-search-info">
          ${user.avatarBase64 ? `<img src="${user.avatarBase64}" class="user-search-avatar" alt="">` : `<div class="user-search-avatar user-search-avatar-placeholder">${(user.displayName || 'U')[0].toUpperCase()}</div>`}
          <div class="user-search-copy">
            <span class="user-search-name">${_escapeHTML(user.displayName)}</span>
            <span class="user-search-username">${_formatUsername(_escapeHTML(user.username))} • ${statusHtml}</span>
          </div>
        </div>
        <button class="follow-btn ${isFollowing ? 'following' : ''}" data-user-id="${user.id}">
          ${isFollowing ? 'Following' : 'Follow'}
        </button>
      `;

      const followBtn = row.querySelector('.follow-btn');
      if (followBtn) {
        followBtn.addEventListener('click', async (e) => {
          const btn = e.target;
          const targetId = btn.dataset.userId;
          const token = getToken();

          try {
            const fRes = await fetch(`${getBackendUrl()}/users/follow/${targetId}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              }
            });
            if (fRes.status === 200) {
              const fData = await fRes.json();
              if (fData.status === 'success') {
                const u = getUser();
                if (u) {
                  u.following = fData.following;
                  if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('auth_user', JSON.stringify(u));
                  }
                }

                btn.classList.toggle('following', fData.isFollowing);
                btn.textContent = fData.isFollowing ? 'Following' : 'Follow';

                await loadMutualFriends();
              }
            }
          } catch (err) {
            console.error('[Toggle Follow Error]:', err);
          }
        });
      }

      findFriendsList.appendChild(row);
    });
  }

  // Collaborative Playlist Modal
  function openCollabModal(playlistId) {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('collab-modal');
    if (!modal) return;

    const friendsListContainer = document.getElementById('collab-friends-list');
    if (!friendsListContainer) return;
    friendsListContainer.innerHTML = '';

    const getPls = (typeof window !== 'undefined' && window.getPlaylists) || (() => []);
    const playlists = getPls();
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
            ${friend.avatarBase64 ? `<img src="${friend.avatarBase64}" style="width: 28px; height: 28px; border-radius:50%;" />` : `<div style="width: 28px; height: 28px; border-radius:50%; background:#3a3f50; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; color:#fff;">${(friend.displayName || 'U')[0].toUpperCase()}</div>`}
            <span style="font-size:13px; color:var(--text-color);">${_escapeHTML(friend.displayName)}</span>
          </div>
          <input type="checkbox" class="collab-friend-checkbox" data-friend-id="${friend.id}" ${isChecked ? 'checked' : ''} style="width:16px; height:16px; cursor:pointer;" />
        `;
        friendsListContainer.appendChild(row);
      });
    }

    const saveBtn = document.getElementById('save-collab-btn');
    if (saveBtn) {
      const newSaveBtn = saveBtn.cloneNode(true);
      if (saveBtn.parentNode) saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

      newSaveBtn.addEventListener('click', () => {
        const checkboxes = friendsListContainer.querySelectorAll('.collab-friend-checkbox');
        const selectedIds = [];
        checkboxes.forEach(cb => {
          if (cb.checked) selectedIds.push(cb.dataset.friendId);
        });

        pl.isCollaborative = selectedIds.length > 0;
        pl.collaborators = selectedIds;

        if (typeof window !== 'undefined' && typeof window.savePlaylists === 'function') {
          window.savePlaylists(playlists, true);
        }
        modal.classList.add('hidden');
        showToast('Настройки доступа сохранены', 'success', 'Совместные плейлисты');
        if (typeof window !== 'undefined' && typeof window.openPlaylist === 'function') {
          window.openPlaylist(playlistId);
        }
      });
    }

    modal.classList.remove('hidden');
  }

  // Bind Listeners
  function initSocialUIEventListeners() {
    if (typeof document === 'undefined') return;

    // Collaborative Modal Close Button
    const closeCollabBtn = document.getElementById('close-collab-modal-btn');
    if (closeCollabBtn) {
      closeCollabBtn.addEventListener('click', () => {
        const modal = document.getElementById('collab-modal');
        if (modal) modal.classList.add('hidden');
      });
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

    if (findFriendsBtn) {
      findFriendsBtn.addEventListener('click', () => {
        if (!getUser()) {
          showToast('Войдите в аккаунт для поиска друзей');
          return;
        }
        if (findFriendsModal) findFriendsModal.classList.remove('hidden');
        if (findFriendsSearchInput) findFriendsSearchInput.value = '';
        searchOtherUsers('');
      });
    }

    if (closeFindFriendsBtn && findFriendsModal) {
      closeFindFriendsBtn.addEventListener('click', () => {
        findFriendsModal.classList.add('hidden');
      });
    }

    if (findFriendsSearchInput) {
      findFriendsSearchInput.addEventListener('input', (e) => {
        searchOtherUsers(e.target.value.trim());
      });
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSocialUIEventListeners);
    } else {
      initSocialUIEventListeners();
    }
  }

  // Periodic refresh for friend timestamps (30s)
  if (typeof window !== 'undefined') {
    if (friendActivityRefreshTimer) clearInterval(friendActivityRefreshTimer);
    friendActivityRefreshTimer = setInterval(() => {
      if (getUser() && mutualFriends && mutualFriends.length > 0) {
        renderFriendActivity();
      }
    }, 30000);
  }

  // --- Namespace & Export ---
  window.GP = window.GP || {};
  window.GP.Social = window.GP.Social || {};
  window.GP.Social.Friends = {
    loadMutualFriends,
    renderFriendActivity,
    playFriendTrack,
    openCollabModal,
    syncPlaylistsFromServer,
    searchOtherUsers,
    renderFindFriendsList,
    getStatuses: () => friendStatuses,
    getMutualFriends: () => mutualFriends
  };

  // Direct aliases on GP.Social
  Object.assign(window.GP.Social, window.GP.Social.Friends);

  // Backward compatibility global exports
  window.loadMutualFriends = loadMutualFriends;
  window.renderFriendActivity = renderFriendActivity;
  window.playFriendTrack = playFriendTrack;
  window.openCollabModal = openCollabModal;
  window.syncPlaylistsFromServer = syncPlaylistsFromServer;
  window.searchOtherUsers = searchOtherUsers;
  window.renderFindFriendsList = renderFindFriendsList;

  Object.defineProperty(window, 'friendStatuses', {
    get: () => friendStatuses,
    configurable: true
  });

  Object.defineProperty(window, 'mutualFriends', {
    get: () => mutualFriends,
    set: (val) => { mutualFriends = val; },
    configurable: true
  });

})(typeof window !== 'undefined' ? window : global);
