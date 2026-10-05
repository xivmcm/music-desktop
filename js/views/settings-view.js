/**
 * GlassPlayer - Settings & Studio Views Module
 * Namespace: window.GP.Views.Settings
 * Handles Settings, Studio (Visual Theme Constructor & Audio Effects), and Listening Analytics.
 */

(function (window) {
  'use strict';

  // Ensure namespaces
  window.GP = window.GP || {};
  window.GP.Views = window.GP.Views || {};

  // Reactive activeView on window
  let _activeView = 'home';
  if (!Object.getOwnPropertyDescriptor(window, 'activeView')) {
    Object.defineProperty(window, 'activeView', {
      get: () => _activeView,
      set: (val) => { _activeView = val; },
      configurable: true
    });
  }

  const DEFAULT_AVATAR_90 = (typeof window !== 'undefined' && window.DEFAULT_AVATAR_90) ||
    ('data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="90" height="90" viewBox="0 0 90 90"><circle cx="45" cy="45" r="43" fill="#333"/><path d="M45 40a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0 8c-14 0-20 8-20 16v3h40v-3c0-8-6-16-20-16z" fill="#666"/></svg>'));

  const DEFAULT_MIRRORS = [
    'https://music-backend-iyni.onrender.com'
  ];
  if (!window.DEFAULT_MIRRORS) {
    window.DEFAULT_MIRRORS = DEFAULT_MIRRORS;
  }

  function getAppVersion() {
    return (typeof window !== 'undefined' && window.APP_VERSION) || '1.19.0';
  }

  function getApiUrl() {
    return (typeof window !== 'undefined' && window.API_URL) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('gp_backend_url')) ||
      DEFAULT_MIRRORS[0];
  }

  function getIsElectron() {
    return Boolean(typeof window !== 'undefined' && window.electronAPI);
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

  function getProfilePlayStats() {
    if (typeof window !== 'undefined' && typeof window.getProfilePlayStats === 'function') {
      return window.getProfilePlayStats();
    }
    const suffix = (typeof window !== 'undefined' && typeof window.getStorageOwnerSuffix === 'function')
      ? window.getStorageOwnerSuffix()
      : ((typeof window !== 'undefined' && window.currentUser) ? `account_${String(window.currentUser.id || window.currentUser.username || 'unknown').replace(/[^a-z0-9_-]/gi, '_')}` : ((typeof window !== 'undefined' && window.currentProfile) || 'Default'));
    const scopedKey = `gp_stats_counts_${suffix}`;
    const scoped = typeof localStorage !== 'undefined' ? localStorage.getItem(scopedKey) : null;
    const legacy = (typeof localStorage !== 'undefined' && (!window.currentUser && (!window.currentProfile || window.currentProfile === 'Default')))
      ? localStorage.getItem('gp_stats_counts')
      : null;
    try {
      return JSON.parse(scoped || legacy || '{}');
    } catch {
      return {};
    }
  }

  function getOptimalCover(url) {
    if (typeof window !== 'undefined' && typeof window.getOptimalCoverUrl === 'function') {
      return window.getOptimalCoverUrl(url);
    }
    return url || '';
  }

  function getFallbackCover(url) {
    if (typeof window !== 'undefined' && typeof window.getFallbackCoverUrl === 'function') {
      return window.getFallbackCoverUrl(url);
    }
    return url || '';
  }

  // --- View Loaders ---

  function loadSettingsView() {
    if (typeof window !== 'undefined') window.activeView = 'settings';
    const searchInput = document.getElementById('search-input');
    const welcomeScreen = document.getElementById('welcome-screen');
    const tracksContainer = document.getElementById('tracks-container');
    const loadingIndicator = document.getElementById('loading-indicator');

    if (searchInput) searchInput.value = '';
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    if (tracksContainer) tracksContainer.classList.add('hidden');
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    setTimeout(() => {
      renderSettings();
    }, 100);
  }

  function loadStudioView(tab = 'visual') {
    if (typeof window !== 'undefined') window.activeView = 'studio';
    const searchInput = document.getElementById('search-input');
    const welcomeScreen = document.getElementById('welcome-screen');
    const tracksContainer = document.getElementById('tracks-container');
    const loadingIndicator = document.getElementById('loading-indicator');

    if (searchInput) searchInput.value = '';
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    if (tracksContainer) tracksContainer.classList.add('hidden');
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    setTimeout(() => {
      renderSettings({ scope: 'studio', studioTab: tab });
    }, 100);
  }

  function loadStatsView() {
    if (typeof window !== 'undefined') window.activeView = 'stats';
    const searchInput = document.getElementById('search-input');
    const welcomeScreen = document.getElementById('welcome-screen');
    const tracksContainer = document.getElementById('tracks-container');
    const loadingIndicator = document.getElementById('loading-indicator');

    if (searchInput) searchInput.value = '';
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    if (tracksContainer) tracksContainer.classList.add('hidden');
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    setTimeout(() => {
      renderSettings({ scope: 'stats' });
    }, 100);
  }

  function openSettings(scope = 'settings', studioTab = 'visual') {
    if (scope === 'studio') {
      loadStudioView(studioTab);
    } else if (scope === 'stats') {
      loadStatsView();
    } else {
      loadSettingsView();
    }
  }

  function closeSettings() {
    const loadHome = typeof window !== 'undefined' && (window.loadHomeView || (window.GP && window.GP.Views && window.GP.Views.Home && window.GP.Views.Home.loadHomeView));
    if (typeof loadHome === 'function') {
      loadHome();
    } else {
      const welcome = document.getElementById('welcome-screen');
      const tracks = document.getElementById('tracks-container');
      if (tracks) tracks.classList.add('hidden');
      if (welcome) welcome.classList.remove('hidden');
    }
  }

  function openSettingsModal(options = {}) {
    openSettings(options.scope || 'settings', options.studioTab || 'visual');
  }

  function closeSettingsModal() {
    closeSettings();
  }

  // Render Profile & Auth Card in Settings
  function renderProfileContainer() {
    const container = document.getElementById('profile-section-container');
    if (!container) return;

    const currentUser = (typeof window !== 'undefined' && window.currentUser) || null;
    let isRegistering = Boolean(typeof window !== 'undefined' && window.isRegistering);

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

      const switchBtn = document.getElementById('auth-switch-btn');
      if (switchBtn) {
        switchBtn.addEventListener('click', () => {
          if (typeof window !== 'undefined') {
            window.isRegistering = !window.isRegistering;
          }
          renderProfileContainer();
        });
      }

      const submitBtn = document.getElementById('auth-submit-btn');
      if (submitBtn) {
        submitBtn.addEventListener('click', (e) => {
          if (typeof window.handleAuthSubmit === 'function') {
            window.handleAuthSubmit(e);
          } else if (window.GP && window.GP.Social && window.GP.Social.Auth && typeof window.GP.Social.Auth.handleAuthSubmit === 'function') {
            window.GP.Social.Auth.handleAuthSubmit(e);
          }
        });
      }
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

      const editBtn = document.getElementById('profile-edit-btn');
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          if (typeof window.openEditProfileModal === 'function') {
            window.openEditProfileModal();
          } else if (window.GP && window.GP.Social && window.GP.Social.Auth && typeof window.GP.Social.Auth.openEditProfileModal === 'function') {
            window.GP.Social.Auth.openEditProfileModal();
          }
        });
      }

      const logoutBtn = document.getElementById('profile-logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
          if (typeof window.handleLogout === 'function') {
            window.handleLogout();
          } else if (window.GP && window.GP.Social && window.GP.Social.Auth && typeof window.GP.Social.Auth.handleLogout === 'function') {
            window.GP.Social.Auth.handleLogout();
          }
        });
      }
    }
  }

  // Backend Mirror switcher
  function switchApiMirror(newUrl) {
    if (!newUrl) return;
    let cleanUrl = newUrl.trim();
    if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gp_backend_url', cleanUrl);
    }
    if (typeof window !== 'undefined') {
      window.API_URL = cleanUrl;
      window.BACKEND_URL = `${cleanUrl}/api`;
    }
    showToast(`Сервер переключен на: ${cleanUrl}`, 'success', 'API Failover');
  }

  // Systemic cache clearing (covers, tracks, feeds, temp items)
  function clearAppCache() {
    try {
      if (typeof window !== 'undefined' && typeof window.invalidateHomeRecommendations === 'function') {
        window.invalidateHomeRecommendations();
      }
      if (window.GP && window.GP.LocalDB && typeof window.GP.LocalDB.revokeAllLocalBlobUrls === 'function') {
        window.GP.LocalDB.revokeAllLocalBlobUrls();
      }
      if (typeof localStorage !== 'undefined') {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('gp_home_feed') || k.startsWith('gp_search_history') || k.startsWith('gp_stats_counts') || k.startsWith('gp_spotify_mood'))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      }
      showToast('Кэш приложения успешно очищен.', 'success', 'Кэш');
      return true;
    } catch (err) {
      console.error('[Settings] Error clearing cache:', err);
      showToast('Ошибка при очистке кэша.', 'error', 'Кэш');
      return false;
    }
  }

  // --- Main Settings Render Function ---

  function renderSettings(options = {}) {
    const loadingIndicator = document.getElementById('loading-indicator');
    const tracksContainer = document.getElementById('tracks-container');

    if (loadingIndicator) loadingIndicator.classList.add('hidden');
    if (!tracksContainer) return;

    tracksContainer.innerHTML = '';
    const scope = options.scope || 'settings';
    const studioTab = options.studioTab || 'visual';

    const totalSeconds = (typeof localStorage !== 'undefined' && parseFloat(localStorage.getItem('gp_stats_total_seconds'))) || 0;
    const totalHours = (totalSeconds / 3600).toFixed(1);

    const stats = getProfilePlayStats();
    const topTracks = Object.values(stats)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const customTheme = (window.GP && window.GP.Theme && typeof window.GP.Theme.getStoredCustomTheme === 'function')
      ? window.GP.Theme.getStoredCustomTheme()
      : ((typeof window.getStoredCustomTheme === 'function') ? window.getStoredCustomTheme() : (window.DEFAULT_CUSTOM_THEME || {}));

    const viewHeader = document.createElement('div');
    viewHeader.className = 'view-header';
    const headerCopy = scope === 'studio'
      ? {
          title: 'Studio',
          subtitle: studioTab === 'audio' ? 'Audio effects and equalizer' : 'Visual theme constructor'
        }
      : scope === 'stats'
        ? { title: 'Stats', subtitle: 'Listening analytics' }
        : { title: 'Profile & Settings', subtitle: '' };
    const headerIcon = scope === 'studio'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h5a4 4 0 0 0 4-4c0-3.3-4-6-9-6Z"/><circle cx="7.5" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="6.7" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="7" r="1" fill="currentColor" stroke="none"/></svg>'
      : scope === 'stats'
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    viewHeader.innerHTML = `
      <div class="view-header-title">
        ${headerIcon}
        <span>${headerCopy.title}</span>
        ${headerCopy.subtitle ? `<span class="view-header-subtitle">${headerCopy.subtitle}</span>` : ``}
      </div>
    `;
    tracksContainer.appendChild(viewHeader);

    if (scope === 'settings') {
      const profileSection = document.createElement('div');
      profileSection.id = 'profile-section-container';
      tracksContainer.appendChild(profileSection);
      renderProfileContainer();
    }

    const panel = document.createElement('div');
    panel.className = 'settings-panel';

    const currentTheme = (typeof localStorage !== 'undefined' && localStorage.getItem('gp_theme')) || 'theme-dark-glass';
    const currentProfile = (typeof window !== 'undefined' && window.currentProfile) || (typeof localStorage !== 'undefined' && localStorage.getItem('gp_active_profile')) || 'Default';
    const APP_VERSION = getAppVersion();
    const API_URL = getApiUrl();
    const isElectron = getIsElectron();

    panel.innerHTML = `
      ${scope === 'studio' ? `
        <div class="studio-tabs">
          <button id="studio-visual-tab" class="studio-tab-btn ${studioTab === 'visual' ? 'active' : ''}" type="button">Visual</button>
          <button id="studio-audio-tab" class="studio-tab-btn ${studioTab === 'audio' ? 'active' : ''}" type="button">Audio</button>
        </div>
      ` : ''}
      <div class="settings-section" data-section="theme-presets">
        <h3>Тема оформления</h3>
        <div class="theme-options" role="group" aria-label="Предустановки темы">
          <button class="theme-option-btn ${currentTheme === 'theme-dark-glass' ? 'active' : ''}" data-theme="theme-dark-glass" aria-pressed="${currentTheme === 'theme-dark-glass'}">
            <span>Dark Glass</span>
            <div class="theme-preview dark"></div>
          </button>
          <button class="theme-option-btn ${currentTheme === 'theme-pink-white' ? 'active' : ''}" data-theme="theme-pink-white" aria-pressed="${currentTheme === 'theme-pink-white'}">
            <span>Pink-White Glass</span>
            <div class="theme-preview pink"></div>
          </button>
          <button class="theme-option-btn ${currentTheme === 'theme-silver-matrix' ? 'active' : ''}" data-theme="theme-silver-matrix" aria-pressed="${currentTheme === 'theme-silver-matrix'}">
            <span>Silver Matrix</span>
            <div class="theme-preview silver"></div>
          </button>
          <button class="theme-option-btn ${currentTheme === 'custom' ? 'active' : ''}" data-theme="custom" aria-pressed="${currentTheme === 'custom'}">
            <span>Custom</span>
            <div class="theme-preview custom"></div>
          </button>
        </div>
      </div>

      <div class="settings-section ${currentTheme !== 'custom' ? 'disabled-customizer' : ''}" data-section="theme-constructor" id="theme-constructor-section" style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <h3 style="margin: 0;">Конструктор темы</h3>
          <button id="theme-reset-btn" class="view-btn" style="padding: 4px 10px; font-size: 11px; height: auto;">
            <span>Сброс темы</span>
          </button>
        </div>

        <!-- Группа 1: Палитра и цвета -->
        <div class="theme-constructor-group" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px; margin-bottom: 14px;">
          <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; margin-bottom: 12px;">
            Палитра и цвета
          </div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Цвет фона 1:</span>
              <input type="color" id="theme-bg-color1" value="${customTheme.bgColor1 || '#1e1e24'}" style="width: 100%; height: 36px; border: none; border-radius: 6px; background: transparent; cursor: pointer;">
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Цвет фона 2:</span>
              <input type="color" id="theme-bg-color2" value="${customTheme.bgColor2 || '#0a0a0c'}" style="width: 100%; height: 36px; border: none; border-radius: 6px; background: transparent; cursor: pointer;">
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px; grid-column: span 2;">
              <div style="display: flex; justify-content: space-between; font-size: 12px;">
                <span style="color: rgba(255,255,255,0.5);">Угол градиента:</span>
                <span id="angle-val-text" style="color: #fff;">${customTheme.bgAngle !== undefined ? customTheme.bgAngle : 135}°</span>
              </div>
              <input type="range" id="theme-bg-angle" min="0" max="360" value="${customTheme.bgAngle !== undefined ? customTheme.bgAngle : 135}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Цвет текста:</span>
              <input type="color" id="theme-text-color" value="${customTheme.textColor || '#f5f5f7'}" style="width: 100%; height: 36px; border: none; border-radius: 6px; background: transparent; cursor: pointer;">
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Акцентный цвет:</span>
              <input type="color" id="theme-accent-color" value="${customTheme.accentColor || '#ffffff'}" style="width: 100%; height: 36px; border: none; border-radius: 6px; background: transparent; cursor: pointer;">
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
              <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Шрифт:</span>
              <select id="theme-font-family" style="width: 100%; height: 36px; padding: 0 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: #fff; font-size: 13px; cursor: pointer;">
                ${['Inter', 'Outfit', 'Montserrat', 'Fira Code', 'Playfair Display'].map(font => `
                  <option value="${font}" ${customTheme.fontFamily === font ? 'selected' : ''}>${font}</option>
                `).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- Группа 2: Стекло и прозрачность -->
        <div class="theme-constructor-group" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px; margin-bottom: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7;">
              Стекло и прозрачность (Glassmorphism)
            </div>
            <label class="switch" style="transform: scale(0.85); transform-origin: right center;">
              <input type="checkbox" id="theme-glass-enabled" ${customTheme.glassEnabled !== false ? 'checked' : ''}>
              <span class="slider round"></span>
            </label>
          </div>

          <div id="theme-glass-controls" style="display: flex; flex-direction: column; gap: 12px; transition: opacity 0.2s ease;">
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; justify-content: space-between; font-size: 12px;">
                <span style="color: rgba(255,255,255,0.5);">Размытие стекла (blur):</span>
                <span id="blur-val-text" style="color: #fff;">${customTheme.blur}px</span>
              </div>
              <input type="range" id="theme-blur-slider" min="0" max="60" value="${customTheme.blur}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
            </div>

            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; justify-content: space-between; font-size: 12px;">
                <span style="color: rgba(255,255,255,0.5);">Насыщенность под стеклом (saturation):</span>
                <span id="sat-val-text" style="color: #fff;">${customTheme.saturation || 140}%</span>
              </div>
              <input type="range" id="theme-saturation-slider" min="100" max="200" value="${customTheme.saturation || 140}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
            </div>

            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; justify-content: space-between; font-size: 12px;">
                <span style="color: rgba(255,255,255,0.5);">Прозрачность панелей (0% сплошные, 100% стекло):</span>
                <span id="transparency-val-text" style="color: #fff;">${Math.round((customTheme.panelTransparency ?? 0.55) * 100)}%</span>
              </div>
              <input type="range" id="theme-transparency-slider" min="0" max="100" value="${Math.round((customTheme.panelTransparency ?? 0.55) * 100)}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
            </div>

            <div style="display: flex; flex-direction: column; gap: 6px; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.06);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; justify-content: space-between; width: 100%; font-size: 12px;">
                  <span style="color: rgba(255,255,255,0.5);">Прозрачность мини-плеера:</span>
                  <span id="mini-transparency-val-text" style="color: #fff;">${customTheme.miniTransparency !== null && customTheme.miniTransparency !== undefined ? Math.round(customTheme.miniTransparency * 100) + '%' : 'Как у панелей'}</span>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
                <input type="checkbox" id="theme-mini-trans-sync" ${customTheme.miniTransparency === null || customTheme.miniTransparency === undefined ? 'checked' : ''} style="accent-color: var(--accent-color, #30d158); cursor: pointer;">
                <label for="theme-mini-trans-sync" style="font-size: 11px; opacity: 0.6; cursor: pointer;">Синхронизировать с основными панелями</label>
              </div>
              <input type="range" id="theme-mini-transparency-slider" min="0" max="100" value="${customTheme.miniTransparency !== null && customTheme.miniTransparency !== undefined ? Math.round(customTheme.miniTransparency * 100) : Math.round((customTheme.panelTransparency ?? 0.55) * 100)}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer; ${customTheme.miniTransparency === null || customTheme.miniTransparency === undefined ? 'opacity: 0.4; pointer-events: none;' : ''}">
            </div>

            <div style="display: flex; flex-direction: column; gap: 6px;">
              <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Стиль поверхностей:</span>
              <select id="theme-card-style" style="width: 100%; height: 36px; padding: 0 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: #fff; font-size: 13px; cursor: pointer;">
                ${[
                  { val: 'glass', text: 'Стекло (Glass — по слайдеру)' },
                  { val: 'frosted', text: 'Матовое стекло (Frosted — глубокий блюр)' },
                  { val: 'solid', text: 'Плотные панели (Solid — без блюра)' },
                  { val: 'flat', text: 'Плоский минимализм (Flat — без теней и блюра)' }
                ].map(opt => `
                  <option value="${opt.val}" ${customTheme.cardStyle === opt.val ? 'selected' : ''}>${opt.text}</option>
                `).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- Группа 3: Свечение и геометрия -->
        <div class="theme-constructor-group" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px; margin-bottom: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7;">
              Свечение и геометрия
            </div>
            <label class="switch" style="transform: scale(0.85); transform-origin: right center;">
              <input type="checkbox" id="theme-glow-enabled" ${customTheme.glowEnabled !== false ? 'checked' : ''}>
              <span class="slider round"></span>
            </label>
          </div>

          <div id="theme-glow-controls" style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; justify-content: space-between; font-size: 12px;">
                <span style="color: rgba(255,255,255,0.5);">Интенсивность свечения (glow):</span>
                <span id="glow-val-text" style="color: #fff;">${customTheme.glow !== undefined ? Math.round(customTheme.glow * 100) : 25}%</span>
              </div>
              <input type="range" id="theme-glow-slider" min="0" max="100" value="${customTheme.glow !== undefined ? Math.round(customTheme.glow * 100) : 25}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
            </div>

            <div style="display: flex; flex-direction: column; gap: 6px;">
              <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Цвет свечения:</span>
              <input type="color" id="theme-glow-color" value="${customTheme.glowColor || '#ffffff'}" style="width: 100%; height: 36px; border: none; border-radius: 6px; background: transparent; cursor: pointer;">
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.06);">
              <span style="font-size: 12px; color: rgba(255,255,255,0.7);">Объёмные тени (Shadows):</span>
              <label class="switch" style="transform: scale(0.85); transform-origin: right center;">
                <input type="checkbox" id="theme-shadows-enabled" ${customTheme.shadowsEnabled !== false ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
            </div>

            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; justify-content: space-between; font-size: 12px;">
                <span style="color: rgba(255,255,255,0.5);">Скругление углов (radius):</span>
                <span id="radius-val-text" style="color: #fff;">${customTheme.windowRadius !== undefined ? customTheme.windowRadius : 12}px</span>
              </div>
              <input type="range" id="theme-radius-slider" min="0" max="32" value="${customTheme.windowRadius !== undefined ? customTheme.windowRadius : 12}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
            </div>

            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; justify-content: space-between; font-size: 12px;">
                <span style="color: rgba(255,255,255,0.5);">Толщина границ:</span>
                <span id="border-width-val-text" style="color: #fff;">${customTheme.borderWidth !== undefined ? customTheme.borderWidth : '1px'}</span>
              </div>
              <input type="range" id="theme-border-width" min="0" max="4" step="0.5" value="${parseFloat(customTheme.borderWidth !== undefined ? customTheme.borderWidth : 1)}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
            </div>
          </div>
        </div>

        <!-- Группа 4: Фоновые эффекты и подложка -->
        <div class="theme-constructor-group" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px; margin-bottom: 14px;">
          <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; margin-bottom: 12px;">
            Фоновые эффекты и подложка
          </div>

          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Фоновый эффект:</span>
              <select id="theme-bg-effect" style="width: 100%; height: 36px; padding: 0 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: #fff; font-size: 13px; cursor: pointer;">
                ${[
                  { val: 'none', text: 'Без эффекта (Статичный)' },
                  { val: 'aurora', text: 'Северное сияние (Aurora)' },
                  { val: 'liquid', text: 'Жидкие сферы (Liquid Sphere)' },
                  { val: 'particles', text: 'Атмосферные частицы (Particles)' }
                ].map(opt => `
                  <option value="${opt.val}" ${customTheme.bgEffect === opt.val ? 'selected' : ''}>${opt.text}</option>
                `).join('')}
              </select>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 12px; color: rgba(255,255,255,0.7);">Анимация фона:</span>
              <label class="switch" style="transform: scale(0.85); transform-origin: right center;">
                <input type="checkbox" id="theme-animations-enabled" ${customTheme.animationsEnabled !== false ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
            </div>

            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; justify-content: space-between; font-size: 12px;">
                <span style="color: rgba(255,255,255,0.5);">Затемнение обоев (scrim):</span>
                <span id="scrim-val-text" style="color: #fff;">${Math.round((customTheme.wallpaperDim ?? 0.45) * 100)}%</span>
              </div>
              <input type="range" id="theme-scrim-slider" min="0" max="80" value="${Math.round((customTheme.wallpaperDim ?? 0.45) * 100)}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
            </div>
          </div>
        </div>

        <!-- Инструменты темы: экспорт, импорт, сохранение -->
        <div style="display: flex; gap: 10px; margin-top: 15px;">
          <button id="theme-export-btn" class="view-btn" style="flex: 1; justify-content: center;">
            <span>Скопировать код темы</span>
          </button>
        </div>

        <div class="saved-theme-tools">
          <input type="text" id="theme-save-name-input" class="theme-save-name-input" placeholder="Название темы">
          <button id="theme-save-btn" class="view-btn">
            <span>Сохранить</span>
          </button>
        </div>

        <div id="saved-themes-list" class="saved-themes-list"></div>

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

      <div class="settings-section ${currentTheme !== 'custom' ? 'disabled-customizer' : ''}" data-section="background-image" id="background-image-section">
        <h3>Фон интерфейса (Фото / GIF / Видео)</h3>
        <div style="font-size: 11px; opacity: 0.65; margin-bottom: 12px; line-height: 1.4;">
          Загружайте собственные фото, анимированные GIF или зацикленные видео (MP4 / WebM до 8 сек, до 25 МБ). Работает 100% локально с нулевым расходом трафика.
        </div>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; gap: 10px; align-items: center;">
            <button id="bg-image-upload-btn" class="view-btn" style="flex: 1; justify-content: center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              <span style="margin-left: 6px;">Выбрать медиа (Фото/GIF/Видео)</span>
            </button>
            <button id="bg-image-clear-btn" class="view-btn danger ${(typeof localStorage !== 'undefined' && localStorage.getItem('gp_bg_image')) ? '' : 'hidden'}" style="justify-content: center;">
              <span>Сбросить</span>
            </button>
            <input type="file" id="bg-image-file-input" accept="image/*,video/mp4,video/webm,video/quicktime,.mp4,.webm,.gif,.mov" style="display: none;">
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: rgba(255,255,255,0.5);">Видимость обоев:</span>
              <span id="bg-opacity-val-text" style="color: #fff;">${(typeof localStorage !== 'undefined' && localStorage.getItem('gp_bg_image_opacity')) || 0}%</span>
            </div>
            <input type="range" id="bg-opacity-slider" min="0" max="100" value="${(typeof localStorage !== 'undefined' && localStorage.getItem('gp_bg_image_opacity')) || 0}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
          </div>
        </div>
      </div>

      <div class="settings-section" data-section="interface-effects">
        <h3>Эффекты интерфейса</h3>
        
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px;">
          <span style="font-size: 13px; color: rgba(255,255,255,0.7);">Динамический цвет обложки</span>
          <label class="switch">
            <input type="checkbox" id="dynamic-cover-checkbox" ${(typeof localStorage !== 'undefined' && localStorage.getItem('gp_dynamic_cover') === 'true') ? 'checked' : ''}>
            <span class="slider round"></span>
          </label>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
          <span style="font-size: 13px; color: rgba(255,255,255,0.7);">Аудио-визуализатор</span>
          <label class="switch">
            <input type="checkbox" id="visualizer-checkbox" ${(typeof localStorage !== 'undefined' && localStorage.getItem('gp_visualizer') === 'true') ? 'checked' : ''}>
            <span class="slider round"></span>
          </label>
        </div>
      </div>

      <div class="settings-section" data-section="audio-effects">
        <h3>Аудиоэффекты</h3>
        
        <div class="eq-panel">
          ${[
            { hz: 60, label: '60Hz' },
            { hz: 230, label: '230Hz' },
            { hz: 910, label: '910Hz' },
            { hz: 4000, label: '4kHz' },
            { hz: 14000, label: '14kHz' }
          ].map(band => `
            <label class="eq-band">
              <span class="eq-band-value" id="eq-${band.hz}-value">${(typeof localStorage !== 'undefined' && localStorage.getItem(`gp_eq_${band.hz}`)) || '0'}dB</span>
              <input class="eq-slider" data-frequency="${band.hz}" type="range" min="-12" max="12" step="1" value="${(typeof localStorage !== 'undefined' && localStorage.getItem(`gp_eq_${band.hz}`)) || '0'}">
              <span class="eq-band-label">${band.label}</span>
            </label>
          `).join('')}
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px;">
          <span style="font-size: 13px; color: rgba(255,255,255,0.7);">Bass Boost (+10dB 100Hz)</span>
          <label class="switch">
            <input type="checkbox" id="effect-bassboost-checkbox" ${(typeof localStorage !== 'undefined' && localStorage.getItem('gp_effect_bassboost') === 'true') ? 'checked' : ''}>
            <span class="slider round"></span>
          </label>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px;">
          <span style="font-size: 13px; color: rgba(255,255,255,0.7);">Нормализация звука (Audio Normalization)</span>
          <label class="switch">
            <input type="checkbox" id="effect-normalization-checkbox" ${(typeof localStorage !== 'undefined' && localStorage.getItem('gp_effect_normalization') === 'true') ? 'checked' : ''}>
            <span class="slider round"></span>
          </label>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 15px;">
          <div style="display: flex; justify-content: space-between; font-size: 12px;">
            <span style="color: rgba(255,255,255,0.5);">Скорость воспроизведения:</span>
            <span id="speed-val-text" style="color: #fff;">${(typeof localStorage !== 'undefined' && localStorage.getItem('gp_effect_speed')) || '1.0'}x</span>
          </div>
          <input type="range" id="effect-speed-slider" min="0.5" max="2.0" step="0.05" value="${(typeof localStorage !== 'undefined' && localStorage.getItem('gp_effect_speed')) || '1.0'}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer;">
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 15px;">
          <div style="display: flex; justify-content: space-between; font-size: 12px;">
            <span style="color: rgba(255,255,255,0.5);">Тональность (Pitch Shift):</span>
            <span id="pitch-val-text" style="color: #fff;">${(typeof localStorage !== 'undefined' && localStorage.getItem('gp_effect_pitch_linked') === 'true') ? (localStorage.getItem('gp_effect_speed') || '1.0') : '1.0'}x</span>
          </div>
          <input type="range" id="effect-pitch-slider" min="0.5" max="2.0" step="0.05" value="${(typeof localStorage !== 'undefined' && localStorage.getItem('gp_effect_pitch_linked') === 'true') ? (localStorage.getItem('gp_effect_speed') || '1.0') : '1.0'}" style="width: 100%; accent-color: var(--accent-color, #30d158); cursor: pointer; ${(typeof localStorage !== 'undefined' && localStorage.getItem('gp_effect_pitch_linked') === 'true') ? '' : 'opacity: 0.5; pointer-events: none;'}">
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
          <span style="font-size: 12px; color: rgba(255,255,255,0.5);">Связать тональность со скоростью (Nightcore)</span>
          <label class="switch">
            <input type="checkbox" id="effect-pitch-linked-checkbox" ${(typeof localStorage !== 'undefined' && localStorage.getItem('gp_effect_pitch_linked') === 'true') ? 'checked' : ''}>
            <span class="slider round"></span>
          </label>
        </div>
      </div>

      <div class="settings-section" data-section="listening-stats">
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
            const trackCover = getOptimalCover(track.thumbnail);
            const fallbackTrackCover = getFallbackCover(track.thumbnail);
            return `
              <div style="display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.03); padding: 6px 10px; border-radius: 6px;">
                <div style="font-weight: bold; color: #30d158; width: 15px;">${i + 1}</div>
                <img src="${trackCover}" onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='${fallbackTrackCover}';}" style="width: 32px; height: 32px; border-radius: 4px; object-fit: cover;">
                <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  <div style="font-weight: 500; font-size: 13px; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(track.title)}</div>
                  <div style="font-size: 11px; color: rgba(255,255,255,0.5); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(track.artist)}</div>
                </div>
                <div style="font-size: 12px; color: rgba(255,255,255,0.4);">${track.count} воспр.</div>
              </div>
            `;
          }).join('') : '<div style="color: rgba(255,255,255,0.4); font-size: 12px; padding: 4px 0;">Нет данных о прослушиваниях</div>'}
        </div>
      </div>

      <div class="settings-section" data-section="user-info">
        <h3>Информация о приложении</h3>
        <div class="settings-info-row">
          <span class="settings-info-label">Активный профиль:</span>
          <span class="settings-info-value" id="settings-profile-val">${escapeHTML(currentProfile)}</span>
        </div>
        <div class="settings-info-row">
          <span class="settings-info-label">Платформа:</span>
          <span class="settings-info-value">${isElectron ? 'Electron Client' : 'Web Browser'}</span>
        </div>
        <div class="settings-info-row">
          <span class="settings-info-label">Текущая версия:</span>
          <span class="settings-info-value">${APP_VERSION}</span>
        </div>
        
        <div class="settings-info-row" style="flex-direction: column; align-items: stretch; gap: 8px; margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 15px;">
          <span class="settings-info-label" style="font-weight: 600; margin-bottom: 2px;">Адрес сервера (API URL):</span>
          <div style="display: flex; gap: 8px; width: 100%;">
            <input type="text" id="settings-backend-url-input" class="search-box" value="${API_URL}" style="flex: 1; min-height: 38px; height: 38px; padding: 0 12px; font-size: 12px; margin: 0; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #fff;">
            <button id="settings-save-backend-btn" class="view-btn" style="height: 38px; padding: 0 16px; font-size: 12px; border-radius: 10px;">
              <span>Сохранить</span>
            </button>
            <button id="settings-reset-backend-btn" class="view-btn danger" style="height: 38px; padding: 0 16px; font-size: 12px; border-radius: 10px;">
              <span>Сброс</span>
            </button>
          </div>
          <p style="font-size: 11px; color: rgba(255,255,255,0.4); margin: 4px 0 0;">Используйте зеркало, если основной сервер Render заблокирован вашим провайдером.</p>
        </div>

        <div class="settings-info-row" style="flex-direction: column; align-items: stretch; gap: 8px; margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 15px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span class="settings-info-label" style="font-weight: 600;">Управление кэшем:</span>
            <button id="settings-clear-cache-btn" class="view-btn" style="padding: 6px 14px; font-size: 12px; height: auto;">
              <span>Очистить кэш (обложки / треки)</span>
            </button>
          </div>
          <p style="font-size: 11px; color: rgba(255,255,255,0.4); margin: 2px 0 0;">Очищает кэшированные рекомендации, историю поиска и временные блобы.</p>
        </div>

        ${isElectron ? `
        <div style="margin-top: 15px; display: flex; justify-content: flex-start;">
          <button id="manual-check-updates-btn" class="view-btn" style="padding: 8px 16px; font-size: 12px; height: auto;">
            <span>Проверить обновление</span>
          </button>
        </div>
        ` : ''}
      </div>
    `;

    tracksContainer.appendChild(panel);

    const visibleSectionsByScope = {
      settings: ['interface-effects', 'user-info'],
      studio: studioTab === 'audio'
        ? ['audio-effects']
        : ['theme-presets', 'theme-constructor', 'background-image'],
      stats: ['listening-stats']
    };
    const visibleSections = visibleSectionsByScope[scope] || visibleSectionsByScope.settings;
    panel.querySelectorAll('[data-section]').forEach(section => {
      if (!visibleSections.includes(section.dataset.section)) {
        section.remove();
      }
    });

    const studioVisualTab = panel.querySelector('#studio-visual-tab');
    const studioAudioTab = panel.querySelector('#studio-audio-tab');
    if (studioVisualTab) {
      studioVisualTab.addEventListener('click', () => loadStudioView('visual'));
    }
    if (studioAudioTab) {
      studioAudioTab.addEventListener('click', () => loadStudioView('audio'));
    }

    const btns = panel.querySelectorAll('.theme-option-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const selectedTheme = e.currentTarget.dataset.theme;
        if (window.GP && window.GP.Theme && typeof window.GP.Theme.applyTheme === 'function') {
          window.GP.Theme.applyTheme(selectedTheme);
        } else if (typeof window.applyTheme === 'function') {
          window.applyTheme(selectedTheme);
        }
        btns.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        e.currentTarget.classList.add('active');
        e.currentTarget.setAttribute('aria-pressed', 'true');

        const constructorSec = panel.querySelector('#theme-constructor-section');
        const bgImageSec = panel.querySelector('#background-image-section');
        if (selectedTheme === 'custom') {
          constructorSec?.classList.remove('disabled-customizer');
          bgImageSec?.classList.remove('disabled-customizer');
        } else {
          constructorSec?.classList.add('disabled-customizer');
          bgImageSec?.classList.add('disabled-customizer');
        }
        renderSettings({ scope, studioTab });
      });
    });

    // Custom Theme Constructor bindings
    const customControlsEnabled = currentTheme === 'custom';
    ['#theme-constructor-section', '#background-image-section'].forEach((selector) => {
      const section = panel.querySelector(selector);
      if (!section) return;
      section.classList.toggle('disabled-customizer', !customControlsEnabled);
      section.toggleAttribute('inert', !customControlsEnabled);
      section.setAttribute('aria-disabled', String(!customControlsEnabled));
      section.querySelectorAll('input, select, button').forEach((control) => {
        control.disabled = !customControlsEnabled;
      });
    });

    function readThemeFromControls() {
      const stored = (window.GP && window.GP.Theme && typeof window.GP.Theme.getStoredCustomTheme === 'function')
        ? window.GP.Theme.getStoredCustomTheme()
        : ((typeof window.getStoredCustomTheme === 'function') ? window.getStoredCustomTheme() : (window.DEFAULT_CUSTOM_THEME || {}));
      
      const val = (id, fallback) => {
        const el = panel.querySelector(id);
        return el ? el.value : fallback;
      };
      const checked = (id, fallback) => {
        const el = panel.querySelector(id);
        return el ? el.checked : fallback;
      };

      const isGlass = checked('#theme-glass-enabled', stored.glassEnabled);
      const isGlow = checked('#theme-glow-enabled', stored.glowEnabled);
      const isShadows = checked('#theme-shadows-enabled', stored.shadowsEnabled);
      const isAnimations = checked('#theme-animations-enabled', stored.animationsEnabled);

      const blurVal = panel.querySelector('#theme-blur-slider') ? parseInt(panel.querySelector('#theme-blur-slider').value, 10) : stored.blur;
      const satVal = panel.querySelector('#theme-saturation-slider') ? parseInt(panel.querySelector('#theme-saturation-slider').value, 10) : (stored.saturation || 140);
      const transVal = panel.querySelector('#theme-transparency-slider') ? parseFloat(panel.querySelector('#theme-transparency-slider').value) / 100 : stored.panelTransparency;

      const syncMini = checked('#theme-mini-trans-sync', true);
      let miniTransVal = null;
      if (!syncMini && panel.querySelector('#theme-mini-transparency-slider')) {
        miniTransVal = parseFloat(panel.querySelector('#theme-mini-transparency-slider').value) / 100;
      }

      const glowVal = panel.querySelector('#theme-glow-slider') ? parseFloat(panel.querySelector('#theme-glow-slider').value) / 100 : stored.glow;
      const angleVal = panel.querySelector('#theme-bg-angle') ? parseInt(panel.querySelector('#theme-bg-angle').value, 10) : stored.bgAngle;
      const radiusVal = panel.querySelector('#theme-radius-slider') ? parseInt(panel.querySelector('#theme-radius-slider').value, 10) : stored.windowRadius;
      const borderVal = panel.querySelector('#theme-border-width') ? `${panel.querySelector('#theme-border-width').value}px` : stored.borderWidth;
      const scrimVal = panel.querySelector('#theme-scrim-slider') ? parseFloat(panel.querySelector('#theme-scrim-slider').value) / 100 : stored.wallpaperDim;

      const rawTheme = {
        version: 2,
        bgColor1: val('#theme-bg-color1', stored.bgColor1),
        bgColor2: val('#theme-bg-color2', stored.bgColor2),
        bgAngle: angleVal,
        textColor: val('#theme-text-color', stored.textColor),
        playerBg: val('#theme-player-color', stored.playerBg),
        cardBg: val('#theme-card-color', stored.cardBg),
        accentColor: val('#theme-accent-color', stored.accentColor),
        fontFamily: val('#theme-font-family', stored.fontFamily),
        glassEnabled: isGlass,
        blur: blurVal,
        saturation: satVal,
        panelTransparency: transVal,
        miniTransparency: miniTransVal,
        cardStyle: val('#theme-card-style', stored.cardStyle),
        glowEnabled: isGlow,
        glow: glowVal,
        glowColor: val('#theme-glow-color', stored.glowColor),
        shadowsEnabled: isShadows,
        windowRadius: radiusVal,
        borderWidth: borderVal,
        bgEffect: val('#theme-bg-effect', stored.bgEffect),
        animationsEnabled: isAnimations,
        wallpaperDim: scrimVal
      };

      if (window.GP && window.GP.Theme && typeof window.GP.Theme.normalizeCustomTheme === 'function') {
        return window.GP.Theme.normalizeCustomTheme(rawTheme);
      }
      if (typeof window.normalizeCustomTheme === 'function') {
        return window.normalizeCustomTheme(rawTheme);
      }
      return rawTheme;
    }

    function updateCustomThemeFromUI() {
      const theme = readThemeFromControls();

      const setText = (id, text) => {
        const el = panel.querySelector(id);
        if (el) el.textContent = text;
      };

      setText('#angle-val-text', `${theme.bgAngle}°`);
      setText('#blur-val-text', `${theme.blur}px`);
      setText('#sat-val-text', `${theme.saturation}%`);
      setText('#transparency-val-text', `${Math.round(theme.panelTransparency * 100)}%`);
      setText('#mini-transparency-val-text', theme.miniTransparency !== null ? `${Math.round(theme.miniTransparency * 100)}%` : 'Как у панелей');
      setText('#glow-val-text', `${Math.round(theme.glow * 100)}%`);
      setText('#radius-val-text', `${theme.windowRadius}px`);
      setText('#border-width-val-text', theme.borderWidth);
      setText('#scrim-val-text', `${Math.round(theme.wallpaperDim * 100)}%`);

      if (window.GP && window.GP.Theme && typeof window.GP.Theme.commitCustomTheme === 'function') {
        window.GP.Theme.commitCustomTheme(theme, { persist: true });
      } else if (typeof window.commitCustomTheme === 'function') {
        window.commitCustomTheme(theme, { persist: true });
      }

      btns.forEach(b => {
        if (b.dataset.theme === 'custom') {
          b.classList.add('active');
          b.setAttribute('aria-pressed', 'true');
        } else {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        }
      });
    }

    // Bind all constructor input controls
    const constructorInputs = panel.querySelectorAll('#theme-constructor-section input, #theme-constructor-section select');
    constructorInputs.forEach(input => {
      if (input.type === 'color' || input.type === 'range') {
        input.addEventListener('input', updateCustomThemeFromUI);
      } else if (input.type === 'checkbox' || input.tagName === 'SELECT') {
        input.addEventListener('change', updateCustomThemeFromUI);
      }
    });

    // Sync Mini Player Transparency toggle
    const themeMiniTransSyncCheck = panel.querySelector('#theme-mini-trans-sync');
    const themeMiniTransparencySlider = panel.querySelector('#theme-mini-transparency-slider');
    if (themeMiniTransSyncCheck && themeMiniTransparencySlider) {
      themeMiniTransSyncCheck.addEventListener('change', () => {
        if (themeMiniTransSyncCheck.checked) {
          themeMiniTransparencySlider.style.opacity = '0.4';
          themeMiniTransparencySlider.style.pointerEvents = 'none';
          const transSlider = panel.querySelector('#theme-transparency-slider');
          if (transSlider) themeMiniTransparencySlider.value = transSlider.value;
        } else {
          themeMiniTransparencySlider.style.opacity = '';
          themeMiniTransparencySlider.style.pointerEvents = '';
        }
        updateCustomThemeFromUI();
      });
    }

    // Reset Theme to Default
    const themeResetBtn = panel.querySelector('#theme-reset-btn');
    if (themeResetBtn) {
      themeResetBtn.addEventListener('click', () => {
        const defaultTheme = (window.GP && window.GP.Theme && window.GP.Theme.DEFAULT_CUSTOM_THEME) || window.DEFAULT_CUSTOM_THEME;
        if (window.GP && window.GP.Theme && typeof window.GP.Theme.commitCustomTheme === 'function') {
          window.GP.Theme.commitCustomTheme(defaultTheme, { persist: true });
        } else if (typeof window.commitCustomTheme === 'function') {
          window.commitCustomTheme(defaultTheme, { persist: true });
        }
        showToast('Тема сброшена к стандартной.', 'info', 'Тема оформления');
        renderSettings({ scope, studioTab });
      });
    }

    // Background Media (Image / GIF / Video) bindings
    const bgImageUploadBtn = panel.querySelector('#bg-image-upload-btn');
    const bgImageClearBtn = panel.querySelector('#bg-image-clear-btn');
    const bgImageFileInput = panel.querySelector('#bg-image-file-input');
    const bgOpacitySlider = panel.querySelector('#bg-opacity-slider');
    const bgOpacityValText = panel.querySelector('#bg-opacity-val-text');

    if (bgImageUploadBtn && bgImageFileInput) {
      bgImageUploadBtn.addEventListener('click', () => bgImageFileInput.click());
      
      bgImageFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const isVideo = file.type.startsWith('video/') || 
                        ['.mp4', '.webm', '.mov'].some(ext => file.name.toLowerCase().endsWith(ext));

        // Size check (Limit: 35 MB)
        const MAX_SIZE = 35 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
          showToast('Файл слишком большой (максимум 35 МБ)', 'warning', 'Фон');
          bgImageFileInput.value = '';
          return;
        }

        let wasAutoTrimmed = false;
        if (isVideo) {
          try {
            const duration = await new Promise((resolve, reject) => {
              const tempVideo = document.createElement('video');
              tempVideo.preload = 'metadata';
              tempVideo.onloadedmetadata = () => {
                window.URL.revokeObjectURL(tempVideo.src);
                resolve(tempVideo.duration);
              };
              tempVideo.onerror = () => reject(new Error('Не удалось прочитать видео'));
              tempVideo.src = URL.createObjectURL(file);
            });

            if (duration > 8.0) {
              wasAutoTrimmed = true;
            }
          } catch (err) {
            console.warn('[Video Check Error]:', err.message);
          }
        }
        
        const reader = new FileReader();
        reader.onload = async function(evt) {
          const base64Str = evt.target.result;
          let bgRef = base64Str;
          let isVideoSaved = isVideo;
          try {
            if (isElectron && window.electronAPI?.saveThemeBackground) {
              const saved = await window.electronAPI.saveThemeBackground({
                sourcePath: file.path,
                dataUrl: base64Str,
                name: file.name
              });
              bgRef = saved.bgUrl || saved.bgPath || base64Str;
              if (saved.isVideo !== undefined) isVideoSaved = saved.isVideo;
            }
          } catch (err) {
            console.warn('[Theme Background] Falling back to inline media:', err.message);
          }
          localStorage.setItem('gp_bg_image', bgRef);
          localStorage.setItem('gp_bg_is_video', String(isVideoSaved));

          if (window.GP && window.GP.Theme && typeof window.GP.Theme.applyBackgroundImage === 'function') {
            window.GP.Theme.applyBackgroundImage(bgRef, isVideoSaved);
          } else if (typeof window.applyBackgroundImage === 'function') {
            window.applyBackgroundImage(bgRef, isVideoSaved);
          }

          if (bgImageClearBtn) bgImageClearBtn.classList.remove('hidden');

          // If background opacity was 0% or unset, default to 65% so the user immediately sees their wallpaper
          const currentBgOpacity = localStorage.getItem('gp_bg_image_opacity');
          if (!currentBgOpacity || currentBgOpacity === '0') {
            localStorage.setItem('gp_bg_image_opacity', '65');
            document.documentElement.style.setProperty('--bg-image-opacity', '0.65');
            if (bgOpacitySlider) bgOpacitySlider.value = 65;
            if (bgOpacityValText) bgOpacityValText.textContent = '65%';
          }

          if (isVideoSaved) {
            if (wasAutoTrimmed) {
              showToast('Видео установлено и зациклено на первых 8 секундах.', 'success', 'Фон');
            } else {
              showToast('Живой видеофон установлен!', 'success', 'Фон');
            }
          } else {
            showToast('Фоновое изображение установлено!', 'success', 'Фон');
          }
        };
        reader.readAsDataURL(file);
      });
    }

    if (bgImageClearBtn) {
      bgImageClearBtn.addEventListener('click', () => {
        localStorage.removeItem('gp_bg_image');
        localStorage.removeItem('gp_bg_is_video');
        if (window.GP && window.GP.Theme && typeof window.GP.Theme.applyBackgroundImage === 'function') {
          window.GP.Theme.applyBackgroundImage(null);
        } else if (typeof window.applyBackgroundImage === 'function') {
          window.applyBackgroundImage(null);
        }
        bgImageClearBtn.classList.add('hidden');
        if (bgImageFileInput) bgImageFileInput.value = '';
        showToast('Фон сброшен');
      });
    }

    if (bgOpacitySlider && bgOpacityValText) {
      bgOpacitySlider.addEventListener('input', (e) => {
        const val = e.target.value;
        bgOpacityValText.textContent = `${val}%`;
        localStorage.setItem('gp_bg_image_opacity', val);
        document.documentElement.style.setProperty('--bg-image-opacity', parseFloat(val) / 100);
      });
    }

    const themeExportBtn = panel.querySelector('#theme-export-btn');
    if (themeExportBtn) {
      themeExportBtn.addEventListener('click', async () => {
        const customThemeVal = readThemeFromControls();
        try {
          const code = btoa(JSON.stringify(customThemeVal));
          await navigator.clipboard.writeText(code);
          showToast('Код темы скопирован в буфер обмена.', 'success', 'Тема оформления');
        } catch (err) {
          console.error(err);
          showToast('Не удалось скопировать код темы.', 'error', 'Тема оформления');
        }
      });
    }

    const themeImportBtn = panel.querySelector('#theme-import-btn');
    if (themeImportBtn) {
      themeImportBtn.addEventListener('click', () => {
        const input = panel.querySelector('#theme-import-input');
        const code = input?.value.trim();
        if (!code) return;
        try {
          const decoded = JSON.parse(atob(code));
          if (decoded && typeof decoded === 'object' && (decoded.bgColor || decoded.bgColor1 || decoded.version)) {
            const normalized = (window.GP && window.GP.Theme && typeof window.GP.Theme.normalizeCustomTheme === 'function')
              ? window.GP.Theme.normalizeCustomTheme(decoded)
              : ((typeof window.normalizeCustomTheme === 'function') ? window.normalizeCustomTheme(decoded) : decoded);

            if (window.GP && window.GP.Theme && typeof window.GP.Theme.commitCustomTheme === 'function') {
              window.GP.Theme.commitCustomTheme(normalized, { persist: true });
            } else if (typeof window.commitCustomTheme === 'function') {
              window.commitCustomTheme(normalized, { persist: true });
            }

            input.value = '';
            showToast('Тема проверена и применена.', 'success', 'Тема оформления');
            renderSettings({ scope, studioTab });
          } else {
            showToast('В коде нет обязательных параметров темы.', 'error', 'Тема оформления');
          }
        } catch (err) {
          console.error(err);
          showToast('Не удалось прочитать код темы.', 'error', 'Тема оформления');
        }
      });
    }

    function getSavedThemes() {
      try {
        return JSON.parse(localStorage.getItem('gp_saved_themes') || '[]');
      } catch {
        return [];
      }
    }

    function setSavedThemes(themes) {
      localStorage.setItem('gp_saved_themes', JSON.stringify(themes));
    }

    function renderSavedThemesList() {
      const list = panel.querySelector('#saved-themes-list');
      if (!list) return;

      const themes = getSavedThemes();
      if (!themes.length) {
        list.innerHTML = '<div class="saved-themes-empty">No saved themes yet</div>';
        return;
      }

      list.innerHTML = themes.map(theme => `
        <div class="saved-theme-item" data-theme-id="${theme.id}">
          <button class="saved-theme-activate" type="button">
            <span class="saved-theme-name">${escapeHTML(theme.name)}</span>
            <span class="saved-theme-meta">${theme.bgPath ? 'Background saved' : 'Colors only'}</span>
          </button>
          <button class="saved-theme-delete" type="button" title="Delete theme">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path></svg>
          </button>
        </div>
      `).join('');

      list.querySelectorAll('.saved-theme-activate').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.closest('.saved-theme-item')?.dataset.themeId;
          const selected = getSavedThemes().find(theme => theme.id === id);
          if (!selected) return;
          const migrated = (window.GP && window.GP.Theme && typeof window.GP.Theme.normalizeCustomTheme === 'function')
            ? window.GP.Theme.normalizeCustomTheme(selected.colors)
            : ((typeof window.normalizeCustomTheme === 'function') ? window.normalizeCustomTheme(selected.colors) : selected.colors);

          if (window.GP && window.GP.Theme && typeof window.GP.Theme.commitCustomTheme === 'function') {
            window.GP.Theme.commitCustomTheme(migrated, { persist: true });
          } else if (typeof window.commitCustomTheme === 'function') {
            window.commitCustomTheme(migrated, { persist: true });
          }

          if (selected.bgUrl || selected.bgPath) {
            const bgRef = selected.bgUrl || selected.bgPath;
            const isVideoSaved = Boolean(selected.isVideo || (selected.bgPath && selected.bgPath.match(/\.(mp4|webm|mov)$/i)));
            localStorage.setItem('gp_bg_image', bgRef);
            localStorage.setItem('gp_bg_is_video', String(isVideoSaved));
            if (window.GP && window.GP.Theme && typeof window.GP.Theme.applyBackgroundImage === 'function') {
              window.GP.Theme.applyBackgroundImage(bgRef, isVideoSaved);
            } else if (typeof window.applyBackgroundImage === 'function') {
              window.applyBackgroundImage(bgRef, isVideoSaved);
            }
          } else {
            localStorage.removeItem('gp_bg_image');
            localStorage.removeItem('gp_bg_is_video');
            if (window.GP && window.GP.Theme && typeof window.GP.Theme.applyBackgroundImage === 'function') {
              window.GP.Theme.applyBackgroundImage(null);
            } else if (typeof window.applyBackgroundImage === 'function') {
              window.applyBackgroundImage(null);
            }
          }
          showToast('Тема применена', 'success', 'Тема оформления');
          renderSettings({ scope, studioTab });
        });
      });

      list.querySelectorAll('.saved-theme-delete').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.closest('.saved-theme-item')?.dataset.themeId;
          setSavedThemes(getSavedThemes().filter(theme => theme.id !== id));
          renderSavedThemesList();
        });
      });
    }

    const themeSaveBtn = panel.querySelector('#theme-save-btn');
    const themeSaveNameInput = panel.querySelector('#theme-save-name-input');
    if (themeSaveBtn && themeSaveNameInput) {
      themeSaveBtn.addEventListener('click', () => {
        const name = themeSaveNameInput.value.trim();
        if (!name) {
          showToast('Введите название темы', 'warning', 'Тема оформления');
          return;
        }

        const id = `theme_${Date.now()}`;
        const bgRef = localStorage.getItem('gp_bg_image') || '';
        const isVideo = localStorage.getItem('gp_bg_is_video') === 'true';
        const themes = getSavedThemes();
        themes.unshift({
          id,
          name,
          bgPath: bgRef,
          bgUrl: bgRef,
          isVideo,
          colors: readThemeFromControls()
        });
        setSavedThemes(themes);
        themeSaveNameInput.value = '';
        renderSavedThemesList();
        showToast('Тема сохранена!', 'success', 'Тема оформления');
      });
      renderSavedThemesList();
    }

    // Interface Effects bindings
    const dynamicCoverCheckbox = panel.querySelector('#dynamic-cover-checkbox');
    const visualizerCheckbox = panel.querySelector('#visualizer-checkbox');

    if (dynamicCoverCheckbox) {
      dynamicCoverCheckbox.addEventListener('change', (e) => {
        localStorage.setItem('gp_dynamic_cover', e.target.checked);
        if (e.target.checked) {
          if (window.GP && window.GP.Theme && typeof window.GP.Theme.applyDynamicCoverColor === 'function') {
            window.GP.Theme.applyDynamicCoverColor();
          } else if (typeof window.applyDynamicCoverColor === 'function') {
            window.applyDynamicCoverColor();
          }
        } else {
          if (window.GP && window.GP.Theme && typeof window.GP.Theme.resetAccentColor === 'function') {
            window.GP.Theme.resetAccentColor();
          } else if (typeof window.resetAccentColor === 'function') {
            window.resetAccentColor();
          }
        }
      });
    }

    if (visualizerCheckbox) {
      visualizerCheckbox.addEventListener('change', (e) => {
        localStorage.setItem('gp_visualizer', e.target.checked);
        if (e.target.checked) {
          if (window.GP && window.GP.Audio && typeof window.GP.Audio.initAudioEffects === 'function') {
            window.GP.Audio.initAudioEffects();
          } else if (typeof window.initAudioEffects === 'function') {
            window.initAudioEffects();
          }

          if (window.GP && window.GP.Visualizer && typeof window.GP.Visualizer.startVisualizer === 'function') {
            window.GP.Visualizer.startVisualizer();
          } else if (typeof window.startVisualizer === 'function') {
            window.startVisualizer();
          }
        } else {
          if (window.GP && window.GP.Visualizer && typeof window.GP.Visualizer.stopVisualizer === 'function') {
            window.GP.Visualizer.stopVisualizer();
          } else if (typeof window.stopVisualizer === 'function') {
            window.stopVisualizer();
          }
        }
      });
    }

    // Audio Effects bindings
    const bassboostCheckbox = panel.querySelector('#effect-bassboost-checkbox');
    const normalizationCheckbox = panel.querySelector('#effect-normalization-checkbox');
    const speedSlider = panel.querySelector('#effect-speed-slider');
    const pitchSlider = panel.querySelector('#effect-pitch-slider');
    const pitchLinkedCheckbox = panel.querySelector('#effect-pitch-linked-checkbox');
    const eqSliders = panel.querySelectorAll('.eq-slider');

    eqSliders.forEach((slider, index) => {
      slider.addEventListener('input', (e) => {
        const frequency = e.target.dataset.frequency;
        const gain = parseFloat(e.target.value);
        localStorage.setItem(`gp_eq_${frequency}`, gain);
        const valueLabel = panel.querySelector(`#eq-${frequency}-value`);
        if (valueLabel) {
          valueLabel.textContent = `${gain}dB`;
        }
        if (window.GP && window.GP.Audio && typeof window.GP.Audio.initAudioEffects === 'function') {
          window.GP.Audio.initAudioEffects();
        } else if (typeof window.initAudioEffects === 'function') {
          window.initAudioEffects();
        }

        const eqFilters = (window.GP && window.GP.Audio && window.GP.Audio.eqFilters) || window.eqFilters;
        if (eqFilters && eqFilters[index]) {
          eqFilters[index].gain.value = gain;
        }
      });
    });

    if (bassboostCheckbox) {
      bassboostCheckbox.addEventListener('change', (e) => {
        localStorage.setItem('gp_effect_bassboost', e.target.checked);
        if (window.GP && window.GP.Audio && typeof window.GP.Audio.initAudioEffects === 'function') {
          window.GP.Audio.initAudioEffects();
        } else if (typeof window.initAudioEffects === 'function') {
          window.initAudioEffects();
        }

        const bassFilter = (window.GP && window.GP.Audio && window.GP.Audio.bassFilter) || window.bassFilter;
        if (bassFilter) {
          bassFilter.gain.value = e.target.checked ? 10 : 0;
        }
      });
    }

    if (normalizationCheckbox) {
      normalizationCheckbox.addEventListener('change', (e) => {
        localStorage.setItem('gp_effect_normalization', e.target.checked);
        showToast(e.target.checked ? 'Нормализация звука включена' : 'Нормализация звука выключена', 'info', 'Аудио');
      });
    }

    const audioPlayer = (typeof window !== 'undefined' && window.audioPlayer) || document.getElementById('audio-player');

    if (speedSlider && pitchSlider && pitchLinkedCheckbox) {
      speedSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        localStorage.setItem('gp_effect_speed', val);
        const speedValText = panel.querySelector('#speed-val-text');
        if (speedValText) speedValText.textContent = `${val.toFixed(2)}x`;

        if (audioPlayer) {
          audioPlayer.playbackRate = val;
          audioPlayer.defaultPlaybackRate = val;
        }

        if (pitchLinkedCheckbox.checked) {
          pitchSlider.value = val;
          const pitchValText = panel.querySelector('#pitch-val-text');
          if (pitchValText) pitchValText.textContent = `${val.toFixed(2)}x`;
        }
      });

      pitchLinkedCheckbox.addEventListener('change', (e) => {
        const checked = e.target.checked;
        localStorage.setItem('gp_effect_pitch_linked', checked);
        if (audioPlayer) {
          audioPlayer.preservesPitch = !checked;
        }

        if (checked) {
          const speedVal = parseFloat(speedSlider.value);
          pitchSlider.value = speedVal;
          const pitchValText = panel.querySelector('#pitch-val-text');
          if (pitchValText) pitchValText.textContent = `${speedVal.toFixed(2)}x`;
          pitchSlider.style.opacity = '';
          pitchSlider.style.pointerEvents = '';
        } else {
          pitchSlider.value = 1.0;
          const pitchValText = panel.querySelector('#pitch-val-text');
          if (pitchValText) pitchValText.textContent = '1.00x';
          pitchSlider.style.opacity = '0.5';
          pitchSlider.style.pointerEvents = 'none';
        }
      });

      pitchSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        pitchLinkedCheckbox.checked = true;
        localStorage.setItem('gp_effect_pitch_linked', true);
        if (audioPlayer) {
          audioPlayer.preservesPitch = false;
        }

        pitchSlider.style.opacity = '';
        pitchSlider.style.pointerEvents = '';

        speedSlider.value = val;
        const speedValText = panel.querySelector('#speed-val-text');
        const pitchValText = panel.querySelector('#pitch-val-text');
        if (speedValText) speedValText.textContent = `${val.toFixed(2)}x`;
        if (pitchValText) pitchValText.textContent = `${val.toFixed(2)}x`;

        if (audioPlayer) {
          audioPlayer.playbackRate = val;
          audioPlayer.defaultPlaybackRate = val;
        }
        localStorage.setItem('gp_effect_speed', val);
      });
    }

    const manualCheckBtn = panel.querySelector('#manual-check-updates-btn');
    if (manualCheckBtn && isElectron && window.electronAPI?.checkForUpdates) {
      manualCheckBtn.addEventListener('click', () => {
        showToast('Проверяем наличие новой версии…', 'info', 'Обновления');
        window.electronAPI.checkForUpdates();
      });
    }

    const backendInput = panel.querySelector('#settings-backend-url-input');
    const saveBackendBtn = panel.querySelector('#settings-save-backend-btn');
    const resetBackendBtn = panel.querySelector('#settings-reset-backend-btn');

    if (saveBackendBtn && backendInput) {
      saveBackendBtn.addEventListener('click', () => {
        let newUrl = backendInput.value.trim();
        if (!newUrl) {
          showToast('Введите корректный адрес сервера.', 'warning', 'Настройки');
          return;
        }
        if (newUrl.endsWith('/')) {
          newUrl = newUrl.slice(0, -1);
        }
        localStorage.setItem('gp_backend_url', newUrl);
        showToast('Адрес сервера изменен! Перезагрузка...');
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      });
    }

    if (resetBackendBtn) {
      resetBackendBtn.addEventListener('click', () => {
        localStorage.removeItem('gp_backend_url');
        showToast('Адрес сервера сброшен! Перезагрузка...');
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      });
    }

    // Clear App Cache Button
    const clearCacheBtn = panel.querySelector('#settings-clear-cache-btn');
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', () => {
        clearAppCache();
      });
    }

    tracksContainer.classList.remove('hidden');
    if (typeof window.updateActiveTab === 'function') {
      window.updateActiveTab(scope);
    }
  }

  // Bind settings navigation button listeners
  function bindSettingsNavListeners() {
    if (typeof document === 'undefined') return;
    const settingsBtn = document.getElementById('settings-button');
    const studioBtn = document.getElementById('studio-button');
    const statsBtn = document.getElementById('stats-button');

    if (settingsBtn && !settingsBtn.dataset.gpSettingsBound) {
      settingsBtn.dataset.gpSettingsBound = '1';
      settingsBtn.addEventListener('click', loadSettingsView);
    }
    if (studioBtn && !studioBtn.dataset.gpStudioBound) {
      studioBtn.dataset.gpStudioBound = '1';
      studioBtn.addEventListener('click', () => loadStudioView('visual'));
    }
    if (statsBtn && !statsBtn.dataset.gpStatsBound) {
      statsBtn.dataset.gpStatsBound = '1';
      statsBtn.addEventListener('click', loadStatsView);
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindSettingsNavListeners);
    } else {
      bindSettingsNavListeners();
    }
  }

  // Register on window.GP.Views.Settings
  window.GP.Views.Settings = {
    renderSettings,
    renderSettingsView: renderSettings,
    loadSettingsView,
    loadStudioView,
    loadStatsView,
    openSettings,
    closeSettings,
    openSettingsModal,
    closeSettingsModal,
    renderProfileContainer,
    switchApiMirror,
    clearAppCache,
    getProfilePlayStats
  };

  // Direct aliases on window for 100% backward compatibility
  window.renderSettings = renderSettings;
  window.renderSettingsView = renderSettings;
  window.loadSettingsView = loadSettingsView;
  window.loadStudioView = loadStudioView;
  window.loadStatsView = loadStatsView;
  window.openSettings = openSettings;
  window.closeSettings = closeSettings;
  window.openSettingsModal = openSettingsModal;
  window.closeSettingsModal = closeSettingsModal;
  window.renderProfileContainer = renderProfileContainer;
  window.switchApiMirror = switchApiMirror;
  window.clearAppCache = clearAppCache;

})(typeof window !== 'undefined' ? window : global);
