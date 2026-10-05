/**
 * GlassPlayer - Authentication & User Profiles Module
 * Namespace: window.GP.Social.Auth
 * Manages user authentication, profile switching, local/cloud synchronization, and avatar uploads.
 */

(function (window) {
  'use strict';

  let currentUser = null;
  let token = null;
  let tempAvatarBase64 = '';
  let isRegistering = false;

  let currentProfile = (typeof localStorage !== 'undefined' && localStorage.getItem('gp_active_profile')) || 'Default';
  let profiles = (typeof localStorage !== 'undefined' && JSON.parse(localStorage.getItem('gp_profiles') || '["Default"]')) || ['Default'];

  const DEFAULT_AVATAR_100 = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#333"/><path d="M50 44a12 12 0 1 0 0-24 12 12 0 0 0 0 24zm0 8c-16 0-22 10-22 18v4h44v-4c0-8-6-18-22-18z" fill="#666"/></svg>');

  function getBackendUrl() {
    return (typeof window !== 'undefined' && window.BACKEND_URL) ||
      (typeof window !== 'undefined' && window.API_URL ? `${window.API_URL}/api` : 'https://music-backend-iyni.onrender.com/api');
  }

  function getFetchWithTimeout() {
    return (typeof window !== 'undefined' && window.fetchWithTimeout) ||
      (window.GP && window.GP.Utils && window.GP.Utils.fetchWithTimeout) ||
      fetch;
  }

  function showToast(msg, type, title) {
    const toast = typeof window !== 'undefined' && window.showToastNotification;
    if (typeof toast === 'function') toast(msg, type, title);
  }

  // Update Active Account Display in Header
  function updateHeaderProfileUI() {
    if (typeof document === 'undefined') return;
    const activeProfileName = document.getElementById('active-profile-name');
    if (activeProfileName) {
      if (currentUser) {
        activeProfileName.textContent = currentUser.displayName;
      } else {
        activeProfileName.textContent = currentProfile || 'Default';
      }
    }
  }

  // Auth Initialization
  async function initAuth() {
    if (typeof localStorage === 'undefined') return;
    token = localStorage.getItem('auth_token');
    currentUser = localStorage.getItem('auth_user') ? JSON.parse(localStorage.getItem('auth_user')) : null;

    if (token) {
      try {
        const fetchFn = getFetchWithTimeout();
        const res = await fetchFn(`${getBackendUrl()}/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }, 4500);

        if (res.status === 200) {
          const data = await res.json();
          if (data.status === 'success') {
            const previousOwner = typeof window !== 'undefined' && typeof window.getStorageOwnerSuffix === 'function' ? window.getStorageOwnerSuffix() : null;
            currentUser = data.user;
            if (previousOwner && typeof window.getStorageOwnerSuffix === 'function' && previousOwner !== window.getStorageOwnerSuffix()) {
              if (typeof window.invalidateHomeRecommendations === 'function') window.invalidateHomeRecommendations();
            }
            localStorage.setItem('auth_user', JSON.stringify(currentUser));
            updateHeaderProfileUI();
            if (typeof window !== 'undefined' && typeof window.loadLikedTracks === 'function') {
              await window.loadLikedTracks();
            }
            if (currentUser.playlists && typeof window !== 'undefined' && typeof window.mergeAndSyncPlaylists === 'function') {
              window.mergeAndSyncPlaylists(currentUser.playlists);
            }
            const connect = (window.GP && window.GP.Social && window.GP.Social.connectWS) || (typeof window !== 'undefined' && window.connectWS);
            if (typeof connect === 'function') connect();
          } else {
            handleLogout();
          }
        } else if (res.status === 401 || res.status === 403) {
          handleLogout();
        } else {
          console.warn('[Auth Auto-login] Server returned error status, keeping offline session:', res.status);
          updateHeaderProfileUI();
          if (typeof window !== 'undefined' && typeof window.loadLikedTracks === 'function') window.loadLikedTracks();
        }
      } catch (err) {
        console.warn('[Auth Auto-login Error] Backend offline, using offline auth state:', err);
        updateHeaderProfileUI();
        if (typeof window !== 'undefined' && typeof window.loadLikedTracks === 'function') window.loadLikedTracks();
      }
    } else {
      updateHeaderProfileUI();
      if (typeof window !== 'undefined' && typeof window.loadLikedTracks === 'function') window.loadLikedTracks();
    }
  }

  // Handle Authentication Submission
  async function handleAuthSubmit() {
    if (typeof document === 'undefined') return;
    const usernameEl = document.getElementById('auth-username');
    const passwordEl = document.getElementById('auth-password');
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.classList.add('hidden');

    const username = usernameEl ? usernameEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';

    if (!username || !password) {
      if (errorEl) {
        errorEl.textContent = 'Заполните имя пользователя и пароль';
        errorEl.classList.remove('hidden');
      }
      return;
    }

    const payload = { username, password };
    let url = `${getBackendUrl()}/auth/login`;

    if (isRegistering) {
      const displayNameEl = document.getElementById('auth-displayname');
      const displayName = displayNameEl ? displayNameEl.value.trim() : '';
      if (!displayName) {
        if (errorEl) {
          errorEl.textContent = 'Заполните имя профиля';
          errorEl.classList.remove('hidden');
        }
        return;
      }
      payload.displayName = displayName;
      url = `${getBackendUrl()}/auth/register`;
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
        if (typeof window !== 'undefined' && typeof window.invalidateHomeRecommendations === 'function') {
          window.invalidateHomeRecommendations();
        }
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('auth_token', token);
          localStorage.setItem('auth_user', JSON.stringify(currentUser));
        }

        if (typeof window !== 'undefined' && typeof window.loadLikedTracks === 'function') {
          await window.loadLikedTracks();
        }
        if (currentUser.playlists && typeof window !== 'undefined' && typeof window.mergeAndSyncPlaylists === 'function') {
          window.mergeAndSyncPlaylists(currentUser.playlists);
        }

        showToast(isRegistering ? 'Регистрация успешна!' : 'Успешный вход!');
        if (typeof window !== 'undefined' && typeof window.renderProfileContainer === 'function') {
          window.renderProfileContainer();
        }
        updateHeaderProfileUI();
        if (typeof window !== 'undefined' && window.activeView === 'home' && typeof window.loadHomeView === 'function') {
          window.loadHomeView({ forceRefresh: true });
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
        submitBtn.textContent = isRegistering ? 'Создать аккаунт' : 'Войти';
      }
    }
  }

  // Handle Logout
  function handleLogout() {
    currentUser = null;
    token = null;
    if (typeof window !== 'undefined' && typeof window.invalidateHomeRecommendations === 'function') {
      window.invalidateHomeRecommendations();
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    }

    if (typeof window !== 'undefined' && typeof window.loadLikedTracks === 'function') window.loadLikedTracks();
    updateHeaderProfileUI();
    if (typeof window !== 'undefined' && typeof window.renderProfileContainer === 'function') window.renderProfileContainer();
    showToast('Вы вышли из аккаунта');

    if (typeof window !== 'undefined') {
      if (window.activeView === 'settings' && typeof window.renderSettings === 'function') {
        window.renderSettings();
      } else if (window.activeView === 'home' && typeof window.loadHomeView === 'function') {
        window.loadHomeView();
      }
    }
  }

  // User Profiles Manager
  function loadProfiles() {
    if (typeof localStorage === 'undefined') return;
    const savedProfiles = localStorage.getItem('gp_profiles');
    if (savedProfiles) {
      try {
        profiles = JSON.parse(savedProfiles);
      } catch (e) {
        profiles = ['Default'];
      }
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

    updateHeaderProfileUI();
    if (typeof window !== 'undefined' && typeof window.loadLikedTracks === 'function') {
      window.loadLikedTracks();
    }
  }

  // Profiles Dropdown Management
  function renderProfilesDropdown() {
    if (typeof document === 'undefined') return;
    const profilesList = document.getElementById('profiles-list');
    const createProfileBtn = document.getElementById('create-profile-btn');
    const profileDropdown = document.getElementById('profile-dropdown');
    if (!profilesList) return;

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
        if (profileDropdown) profileDropdown.classList.add('hidden');
      });

      profilesList.appendChild(item);
    });

    if (createProfileBtn) {
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
  }

  async function switchUserProfile(profileName) {
    currentProfile = profileName;
    if (typeof window !== 'undefined') {
      window.cachedForYouData = null;
      if (window.spotifyMoodCache && typeof window.spotifyMoodCache.clear === 'function') {
        window.spotifyMoodCache.clear();
      }
      if (typeof window.spotifyMoodLoadVersion === 'number') window.spotifyMoodLoadVersion += 1;
      window.cachedSoundCloudDynamicTracks = null;
      window.cachedSoundCloudDynamicAt = 0;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gp_active_profile', currentProfile);
    }
    const activeProfileName = typeof document !== 'undefined' ? document.getElementById('active-profile-name') : null;
    if (activeProfileName) activeProfileName.textContent = currentProfile;

    if (typeof window !== 'undefined' && typeof window.loadLikedTracks === 'function') {
      await window.loadLikedTracks();
    }

    if (typeof window !== 'undefined') {
      if (window.currentTrackIndex !== -1 && window.playlist && window.playlist[window.currentTrackIndex]) {
        if (typeof window.updateLikeUI === 'function') window.updateLikeUI(window.playlist[window.currentTrackIndex].id);
      } else {
        const playerLikeBtn = typeof document !== 'undefined' ? document.getElementById('player-like-btn') : null;
        if (playerLikeBtn) {
          playerLikeBtn.classList.remove('liked');
          playerLikeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
        }
      }
    }

    renderProfilesDropdown();

    if (typeof window !== 'undefined') {
      if (window.activeView === 'home' && typeof window.loadHomeView === 'function') {
        window.loadHomeView();
      } else if (window.activeView === 'settings' && typeof window.renderSettings === 'function') {
        window.renderSettings();
      } else if (window.activeView === 'library' && typeof window.loadFavorites === 'function') {
        window.loadFavorites();
      } else if (window.activeView === 'history' && typeof window.loadHistoryView === 'function') {
        window.loadHistoryView();
      } else if ((window.activeView === 'playlists' || window.activeView === 'playlist-tracks') && typeof window.loadPlaylistsView === 'function') {
        window.loadPlaylistsView();
      } else if (typeof window.renderTracks === 'function' && window.playlist) {
        window.renderTracks(window.playlist);
      }
    }
  }

  function createUserProfile(name) {
    const cleanedName = (name || '').trim();
    if (!cleanedName) return;

    if (profiles.includes(cleanedName)) {
      showToast('Профиль с таким именем уже существует.', 'warning', 'Профили');
      return;
    }

    profiles.push(cleanedName);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gp_profiles', JSON.stringify(profiles));
    }
    switchUserProfile(cleanedName);
  }

  async function deleteUserProfile(profileName) {
    if (profileName === 'Default') return;
    const confirmFn = typeof window !== 'undefined' && window.showConfirmDialog;
    if (typeof confirmFn === 'function') {
      const confirmed = await confirmFn({
        title: 'Удалить локальный профиль?',
        message: `Лайки, история и плейлисты профиля «${profileName}» будут удалены с этого устройства.`,
        confirmLabel: 'Удалить профиль',
        danger: true
      });
      if (!confirmed) return;
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`gp_likes_${profileName}`);
      localStorage.removeItem(`gp_history_${profileName}`);
      localStorage.removeItem(`gp_playlists_${profileName}`);
      localStorage.removeItem(`gp_stats_counts_${profileName}`);
      localStorage.removeItem(`gp_followed_artists_${profileName}`);
      localStorage.removeItem(`gp_home_feed_v2_${profileName}_soundcloud`);
      localStorage.removeItem(`gp_home_feed_v2_${profileName}_spotify`);
    }

    profiles = profiles.filter(p => p !== profileName);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gp_profiles', JSON.stringify(profiles));
    }

    if (currentProfile === profileName) {
      switchUserProfile('Default');
    } else {
      renderProfilesDropdown();
    }
  }

  // Profile Modal Interactions
  function openEditProfileModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('edit-profile-modal');
    if (!modal || !currentUser) return;

    const nameInput = document.getElementById('edit-display-name-input');
    const bioInput = document.getElementById('edit-bio-input');
    const preview = document.getElementById('edit-avatar-preview');

    if (nameInput) nameInput.value = currentUser.displayName || '';
    if (bioInput) bioInput.value = currentUser.bio || '';
    if (preview) preview.src = currentUser.avatarBase64 || DEFAULT_AVATAR_100;

    tempAvatarBase64 = currentUser.avatarBase64 || '';
    modal.classList.remove('hidden');
  }

  function closeEditProfileModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('edit-profile-modal');
    if (modal) modal.classList.add('hidden');
  }

  function compressAndPreviewAvatar(file) {
    if (typeof FileReader === 'undefined') return;
    const reader = new FileReader();
    reader.onload = function (event) {
      const img = new Image();
      img.onload = function () {
        if (typeof document === 'undefined') return;
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const size = Math.min(img.width, img.height);
        const xOffset = (img.width - size) / 2;
        const yOffset = (img.height - size) / 2;

        ctx.drawImage(img, xOffset, yOffset, size, size, 0, 0, 100, 100);

        const base64Str = canvas.toDataURL('image/jpeg', 0.7);
        const preview = document.getElementById('edit-avatar-preview');
        if (preview) preview.src = base64Str;
        tempAvatarBase64 = base64Str;
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  async function saveProfileChanges() {
    if (typeof document === 'undefined') return;
    const nameEl = document.getElementById('edit-display-name-input');
    const bioEl = document.getElementById('edit-bio-input');
    const displayName = nameEl ? nameEl.value.trim() : '';
    const bio = bioEl ? bioEl.value.trim() : '';

    if (!displayName) {
      showToast('Имя профиля не может быть пустым');
      return;
    }

    const saveBtn = document.getElementById('save-edit-profile-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Сохранение...';
    }

    try {
      const response = await fetch(`${getBackendUrl()}/auth/profile`, {
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
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('auth_user', JSON.stringify(currentUser));
        }

        showToast('Профиль обновлен!');
        closeEditProfileModal();
        if (typeof window !== 'undefined' && typeof window.renderProfileContainer === 'function') {
          window.renderProfileContainer();
        }
        updateHeaderProfileUI();
      } else {
        showToast(data.message || 'Ошибка обновления профиля');
      }
    } catch (err) {
      console.error(err);
      showToast('Не удалось соединиться с сервером');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Сохранить';
      }
    }
  }

  function initEditProfileEventListeners() {
    if (typeof document === 'undefined') return;
    const selectBtn = document.getElementById('select-avatar-btn');
    const fileInput = document.getElementById('edit-avatar-input');

    if (selectBtn && fileInput) {
      selectBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) compressAndPreviewAvatar(file);
      });
    }

    const cancelBtn = document.getElementById('cancel-edit-profile-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeEditProfileModal);

    const saveBtn = document.getElementById('save-edit-profile-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveProfileChanges);
  }

  // Synchronise cloud likes list
  async function syncLikesWithBackend(likes) {
    if (!token) return;
    try {
      const res = await fetch(`${getBackendUrl()}/auth/sync-likes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ likedTracks: likes })
      });
      const data = await res.json();
      if (data.status === 'success' && currentUser) {
        currentUser.likedTracks = data.likedTracks;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('auth_user', JSON.stringify(currentUser));
        }
      }
    } catch (error) {
      console.error('[Sync Likes Error]:', error);
    }
  }

  // Synchronise cloud playlists list
  async function syncPlaylistsWithBackend(playlists) {
    if (!token) return;
    try {
      const res = await fetch(`${getBackendUrl()}/users/sync-playlists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ playlists })
      });
      const data = await res.json();
      if (data.status === 'success' && currentUser) {
        currentUser.playlists = data.playlists;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('auth_user', JSON.stringify(currentUser));
        }
      }
    } catch (error) {
      console.error('[Sync Playlists Error]:', error);
    }
  }

  // --- Auth Modal Controller ---
  let isModalRegistering = false;

  function openAuthModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('auth-modal');
    if (!modal) return;

    // Reset inputs
    const usernameInput = document.getElementById('auth-modal-username');
    const displaynameInput = document.getElementById('auth-modal-displayname');
    const passwordInput = document.getElementById('auth-modal-password');
    const errorEl = document.getElementById('auth-modal-error');

    if (usernameInput) usernameInput.value = '';
    if (displaynameInput) displaynameInput.value = '';
    if (passwordInput) passwordInput.value = '';
    if (errorEl) errorEl.classList.add('hidden');

    isModalRegistering = false;
    updateAuthModalState();

    modal.classList.remove('hidden');
  }

  function updateAuthModalState() {
    if (typeof document === 'undefined') return;
    const titleEl = document.getElementById('auth-modal-title');
    const displaynameInput = document.getElementById('auth-modal-displayname');
    const submitBtn = document.getElementById('auth-modal-submit-btn');
    const switchPromptText = document.getElementById('auth-modal-switch-prompt-text');
    const switchBtn = document.getElementById('auth-modal-switch-btn');

    if (isModalRegistering) {
      if (titleEl) titleEl.textContent = 'Регистрация';
      if (displaynameInput) displaynameInput.classList.remove('hidden');
      if (submitBtn) submitBtn.textContent = 'Создать аккаунт';
      if (switchPromptText) switchPromptText.textContent = 'Уже есть аккаунт?';
      if (switchBtn) switchBtn.textContent = 'Войти';
    } else {
      if (titleEl) titleEl.textContent = 'Вход в аккаунт';
      if (displaynameInput) displaynameInput.classList.add('hidden');
      if (submitBtn) submitBtn.textContent = 'Войти';
      if (switchPromptText) switchPromptText.textContent = 'Нет аккаунта?';
      if (switchBtn) switchBtn.textContent = 'Зарегистрироваться';
    }
  }

  async function handleModalAuthSubmit() {
    if (typeof document === 'undefined') return;
    const usernameEl = document.getElementById('auth-modal-username');
    const passwordEl = document.getElementById('auth-modal-password');
    const displaynameEl = document.getElementById('auth-modal-displayname');
    const errorEl = document.getElementById('auth-modal-error');
    const submitBtn = document.getElementById('auth-modal-submit-btn');

    const username = usernameEl ? usernameEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';
    if (errorEl) errorEl.classList.add('hidden');

    if (!username || !password) {
      if (errorEl) {
        errorEl.textContent = 'Заполните имя пользователя и пароль';
        errorEl.classList.remove('hidden');
      }
      return;
    }

    const payload = { username, password };
    let endpoint = '/auth/login';

    if (isModalRegistering) {
      const displayName = displaynameEl ? displaynameEl.value.trim() : '';
      if (!displayName) {
        if (errorEl) {
          errorEl.textContent = 'Заполните имя профиля';
          errorEl.classList.remove('hidden');
        }
        return;
      }
      payload.displayName = displayName;
      endpoint = '/auth/register';
    }

    const url = `${getBackendUrl()}${endpoint}`;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Загрузка...';
    }

    try {
      let data = null;
      let isSuccess = false;

      // 1. Electron bridge path if available
      if (typeof window !== 'undefined' && window.electron && typeof window.electron.proxyRequest === 'function') {
        const res = await window.electron.proxyRequest({
          url,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          timeoutMs: 50000
        });
        if (res && res.data) {
          data = res.data;
          isSuccess = Boolean(res.ok && data.status === 'success');
        } else {
          throw new Error(res?.error || 'Сервер не отвечает');
        }
      } else {
        // 2. Standard fetch with timeout for mobile/web
        const fetchFn = getFetchWithTimeout();
        const res = await fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }, 45000);
        data = await res.json();
        isSuccess = Boolean(res.ok && data.status === 'success');
      }

      if (isSuccess && data && data.user) {
        token = data.token;
        currentUser = data.user;
        if (typeof window !== 'undefined' && typeof window.invalidateHomeRecommendations === 'function') {
          window.invalidateHomeRecommendations();
        }
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('auth_token', token);
          localStorage.setItem('auth_user', JSON.stringify(currentUser));
        }

        if (typeof window !== 'undefined' && typeof window.loadLikedTracks === 'function') {
          await window.loadLikedTracks();
        }
        if (currentUser.playlists && typeof window !== 'undefined' && typeof window.mergeAndSyncPlaylists === 'function') {
          window.mergeAndSyncPlaylists(currentUser.playlists);
        }
        const connect = (window.GP && window.GP.Social && window.GP.Social.connectWS) || (typeof window !== 'undefined' && window.connectWS);
        if (typeof connect === 'function') connect();

        showToast(isModalRegistering ? 'Регистрация успешна!' : 'Успешный вход!');
        updateHeaderProfileUI();
        const modal = document.getElementById('auth-modal');
        if (modal) modal.classList.add('hidden');

        if (typeof window !== 'undefined') {
          if (window.activeView === 'settings' && typeof window.renderSettings === 'function') {
            window.renderSettings();
          } else if (window.activeView === 'home' && typeof window.loadHomeView === 'function') {
            window.loadHomeView();
          }
        }
      } else {
        if (errorEl) {
          errorEl.textContent = data?.message || 'Неверный логин или пароль';
          errorEl.classList.remove('hidden');
        }
      }
    } catch (err) {
      console.error('[Auth Error]:', err);
      if (errorEl) {
        errorEl.textContent = 'Сервер недоступен или пробуждается. Попробуйте еще раз через несколько секунд.';
        errorEl.classList.remove('hidden');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        updateAuthModalState();
      }
    }
  }

  function initAuthModalEventListeners() {
    if (typeof document === 'undefined') return;

    const headerAuthBtn = document.getElementById('header-auth-btn');
    if (headerAuthBtn) {
      headerAuthBtn.addEventListener('click', openAuthModal);
    }

    const closeAuthModalBtn = document.getElementById('close-auth-modal-btn');
    if (closeAuthModalBtn) {
      closeAuthModalBtn.addEventListener('click', () => {
        const authModal = document.getElementById('auth-modal');
        if (authModal) authModal.classList.add('hidden');
      });
    }

    const authModalSwitchBtn = document.getElementById('auth-modal-switch-btn');
    if (authModalSwitchBtn) {
      authModalSwitchBtn.addEventListener('click', () => {
        isModalRegistering = !isModalRegistering;
        updateAuthModalState();
      });
    }

    const authModalSubmitBtn = document.getElementById('auth-modal-submit-btn');
    if (authModalSubmitBtn) {
      authModalSubmitBtn.addEventListener('click', handleModalAuthSubmit);
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initAuthModalEventListeners);
    } else {
      initAuthModalEventListeners();
    }
  }

  // --- Namespace & Export ---
  window.GP = window.GP || {};
  window.GP.Social = window.GP.Social || {};
  window.GP.Social.Auth = {
    initAuth,
    handleAuthSubmit,
    handleLogout,
    updateHeaderProfileUI,
    loadProfiles,
    renderProfilesDropdown,
    switchUserProfile,
    createUserProfile,
    deleteUserProfile,
    openEditProfileModal,
    closeEditProfileModal,
    compressAndPreviewAvatar,
    saveProfileChanges,
    initEditProfileEventListeners,
    syncLikesWithBackend,
    syncPlaylistsWithBackend,
    openAuthModal,
    updateAuthModalState,
    handleModalAuthSubmit,
    getCurrentUser: () => currentUser,
    getToken: () => token,
    getCurrentProfile: () => currentProfile,
    getProfiles: () => profiles
  };

  // Direct aliases on GP.Social
  Object.assign(window.GP.Social, window.GP.Social.Auth);

  // Backward compatibility global exports
  window.initAuth = initAuth;
  window.handleAuthSubmit = handleAuthSubmit;
  window.handleLogout = handleLogout;
  window.updateHeaderProfileUI = updateHeaderProfileUI;
  window.loadProfiles = loadProfiles;
  window.renderProfilesDropdown = renderProfilesDropdown;
  window.switchUserProfile = switchUserProfile;
  window.createUserProfile = createUserProfile;
  window.deleteUserProfile = deleteUserProfile;
  window.openEditProfileModal = openEditProfileModal;
  window.closeEditProfileModal = closeEditProfileModal;
  window.compressAndPreviewAvatar = compressAndPreviewAvatar;
  window.saveProfileChanges = saveProfileChanges;
  window.initEditProfileEventListeners = initEditProfileEventListeners;
  window.syncLikesWithBackend = syncLikesWithBackend;
  window.syncPlaylistsWithBackend = syncPlaylistsWithBackend;
  window.openAuthModal = openAuthModal;
  window.updateAuthModalState = updateAuthModalState;
  window.handleModalAuthSubmit = handleModalAuthSubmit;

  Object.defineProperty(window, 'currentUser', {
    get: () => currentUser,
    set: (val) => { currentUser = val; },
    configurable: true
  });

  Object.defineProperty(window, 'token', {
    get: () => token,
    set: (val) => { token = val; },
    configurable: true
  });

  Object.defineProperty(window, 'tempAvatarBase64', {
    get: () => tempAvatarBase64,
    set: (val) => { tempAvatarBase64 = val; },
    configurable: true
  });

  Object.defineProperty(window, 'isRegistering', {
    get: () => isRegistering,
    set: (val) => { isRegistering = val; },
    configurable: true
  });

  Object.defineProperty(window, 'isModalRegistering', {
    get: () => isModalRegistering,
    set: (val) => { isModalRegistering = val; },
    configurable: true
  });

  Object.defineProperty(window, 'currentProfile', {
    get: () => currentProfile,
    set: (val) => { currentProfile = val; },
    configurable: true
  });

  Object.defineProperty(window, 'profiles', {
    get: () => profiles,
    set: (val) => { profiles = val; },
    configurable: true
  });

})(typeof window !== 'undefined' ? window : global);
