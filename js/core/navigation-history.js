/**
 * GlassPlayer Navigation History Module
 * Manages back/forward history stack across all views, search queries, profiles, and playlists.
 * Fully supports keyboard shortcuts (Alt+Left, Alt+Right) and mouse navigation buttons.
 */
(function (root) {
  'use strict';

  const GP = root.GP = root.GP || {};
  GP.NavigationHistory = GP.NavigationHistory || {};

  const MAX_HISTORY = 50;
  const stack = [];
  let currentIndex = -1;
  let isNavigating = false;
  let isInitialized = false;

  function isEqual(a, b) {
    if (!a || !b) return false;
    if (a.view !== b.view) return false;
    if (a.view === 'search') return (a.query || '').trim() === (b.query || '').trim();
    if (a.view === 'library') return (a.subTab || 'favorites') === (b.subTab || 'favorites');
    if (a.view === 'artist') return (a.artistId || '') === (b.artistId || '') && (a.artistName || '') === (b.artistName || '');
    if (a.view === 'playlists') return (a.playlistId || '') === (b.playlistId || '');
    if (a.view === 'studio') return (a.studioTab || 'visual') === (b.studioTab || 'visual');
    return true;
  }

  function updateButtons() {
    if (typeof document === 'undefined') return;
    const backBtn = document.getElementById('nav-back-btn');
    const fwdBtn = document.getElementById('nav-forward-btn');
    if (backBtn) {
      const canBack = currentIndex > 0;
      backBtn.disabled = !canBack;
      backBtn.setAttribute('aria-disabled', String(!canBack));
    }
    if (fwdBtn) {
      const canFwd = currentIndex < stack.length - 1;
      fwdBtn.disabled = !canFwd;
      fwdBtn.setAttribute('aria-disabled', String(!canFwd));
    }
  }

  function push(state) {
    if (isNavigating || !state || !state.view) return;

    // Normalize state
    const normalized = { ...state };
    if (normalized.view === 'search') {
      normalized.query = (normalized.query || '').trim();
      if (!normalized.query) return;
    }

    // Deduplicate consecutive identical states
    const current = stack[currentIndex];
    if (current && isEqual(current, normalized)) {
      return;
    }

    // Truncate any forward history
    if (currentIndex >= 0 && currentIndex < stack.length - 1) {
      stack.splice(currentIndex + 1);
    }

    stack.push(normalized);
    if (stack.length > MAX_HISTORY) {
      stack.shift();
    } else {
      currentIndex++;
    }

    updateButtons();
  }

  function canGoBack() {
    return currentIndex > 0;
  }

  function canGoForward() {
    return currentIndex < stack.length - 1;
  }

  function back() {
    if (!canGoBack()) return;
    currentIndex--;
    applyState(stack[currentIndex]);
  }

  function forward() {
    if (!canGoForward()) return;
    currentIndex++;
    applyState(stack[currentIndex]);
  }

  function applyState(state) {
    if (!state || !state.view) return;
    isNavigating = true;

    try {
      // 1. Update visual tab indicator
      if (typeof root.updateActiveTab === 'function') {
        root.updateActiveTab(state.view);
      }

      // 2. Dispatch to target view
      switch (state.view) {
        case 'home':
          if (typeof root.loadHomeView === 'function') {
            root.loadHomeView();
          } else if (GP.Views?.Home?.loadHomeView) {
            GP.Views.Home.loadHomeView();
          }
          break;

        case 'library':
          const subTab = state.subTab || 'favorites';
          if (typeof root.loadFavorites === 'function') {
            root.loadFavorites(subTab);
          } else if (GP.Views?.Library?.loadFavorites) {
            GP.Views.Library.loadFavorites(subTab);
          }
          break;

        case 'history':
          if (typeof root.loadHistoryView === 'function') {
            root.loadHistoryView();
          } else if (GP.Views?.Library?.loadHistoryView) {
            GP.Views.Library.loadHistoryView();
          }
          break;

        case 'playlists':
          if (state.playlistId && GP.Views?.Playlists?.openPlaylist) {
            GP.Views.Playlists.openPlaylist(state.playlistId);
          } else if (typeof root.loadPlaylistsView === 'function') {
            root.loadPlaylistsView();
          } else if (GP.Views?.Playlists?.loadPlaylistsView) {
            GP.Views.Playlists.loadPlaylistsView();
          }
          break;

        case 'studio':
          const studioTab = state.studioTab || 'visual';
          if (typeof root.loadStudioView === 'function') {
            root.loadStudioView(studioTab);
          } else if (GP.Views?.Settings?.loadStudioView) {
            GP.Views.Settings.loadStudioView(studioTab);
          }
          break;

        case 'stats':
          if (typeof root.loadStatsView === 'function') {
            root.loadStatsView();
          } else if (GP.Views?.Settings?.loadStatsView) {
            GP.Views.Settings.loadStatsView();
          }
          break;

        case 'settings':
          if (typeof root.loadSettingsView === 'function') {
            root.loadSettingsView();
          } else if (GP.Views?.Settings?.loadSettingsView) {
            GP.Views.Settings.loadSettingsView();
          }
          break;

        case 'artist':
          const artistKey = state.artistId || state.artistName;
          if (typeof root.openArtistProfile === 'function') {
            root.openArtistProfile(artistKey);
          } else if (GP.Views?.Artist?.openArtistProfile) {
            GP.Views.Artist.openArtistProfile(artistKey);
          }
          break;

        case 'search':
          const searchInput = document.getElementById('search-input');
          if (searchInput && state.query) {
            searchInput.value = state.query;
          }
          if (typeof root.performSearch === 'function') {
            root.performSearch(state.query);
          } else if (GP.Views?.Search?.performSearch) {
            GP.Views.Search.performSearch(state.query);
          }
          break;

        default:
          if (typeof root.loadHomeView === 'function') {
            root.loadHomeView();
          }
      }
    } finally {
      isNavigating = false;
      updateButtons();
    }
  }

  function init() {
    if (isInitialized || typeof document === 'undefined') return;
    isInitialized = true;

    const backBtn = document.getElementById('nav-back-btn');
    const fwdBtn = document.getElementById('nav-forward-btn');

    if (backBtn) {
      backBtn.addEventListener('click', () => back());
    }
    if (fwdBtn) {
      fwdBtn.addEventListener('click', () => forward());
    }

    // Keyboard Shortcuts: Alt + ArrowLeft / Alt + ArrowRight
    window.addEventListener('keydown', (e) => {
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        forward();
      }
    });

    // Mouse Navigation Buttons (Back = 3, Forward = 4)
    window.addEventListener('mouseup', (e) => {
      if (e.button === 3) {
        e.preventDefault();
        back();
      } else if (e.button === 4) {
        e.preventDefault();
        forward();
      }
    });

    // Initial root state
    if (stack.length === 0) {
      push({ view: 'home' });
    } else {
      updateButtons();
    }
  }

  // Export methods
  GP.NavigationHistory = {
    push,
    back,
    forward,
    canGoBack,
    canGoForward,
    updateButtons,
    init,
    getStack: () => stack.slice(),
    getCurrentIndex: () => currentIndex,
    isNavigating: () => isNavigating,
    clear: () => {
      stack.length = 0;
      currentIndex = -1;
      updateButtons();
    }
  };

  root.NavigationHistory = GP.NavigationHistory;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : global);
