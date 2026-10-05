/**
 * GlassPlayer Track Card Component Module
 * Handles rendering the interactive track list/grid with cover art, playback controls,
 * artist profile links, favorites toggle, and playlist/library actions.
 */
(function (root) {
  'use strict';

  // Ensure window.GP.Components namespace
  const GP = root.GP = root.GP || {};
  GP.Components = GP.Components || {};
  GP.Components.TrackCard = GP.Components.TrackCard || {};

  const DEFAULT_TRACK_COVER_SVG = 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'><rect width=\'100\' height=\'100\' fill=\'%23222\'/><path d=\'M30 30 L70 50 L30 70 Z\' fill=\'%23444\'/></svg>';

  // --- Helper Functions ---

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
    return DEFAULT_TRACK_COVER_SVG;
  }

  function formatPlays(count) {
    if (root.GP?.Utils?.formatPlaybackCount) return root.GP.Utils.formatPlaybackCount(count);
    if (typeof root.formatPlaybackCount === 'function') return root.formatPlaybackCount(count);
    if (!count || isNaN(count)) return '';
    const num = Number(count);
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return String(num);
  }

  // --- Render Tracks List & Grid ---

  function renderTracks(tracks, container = null, append = false) {
    if (!Array.isArray(tracks)) return;

    const tracksContainer = container || document.getElementById('tracks-container');
    if (!tracksContainer) return;

    let gridContainer;
    const defaultContainer = document.getElementById('tracks-container');
    if (tracksContainer === defaultContainer) {
      gridContainer = tracksContainer.querySelector('.tracks-layout-grid');
      if (!gridContainer || !append) {
        tracksContainer.innerHTML = '';
        gridContainer = document.createElement('div');
        gridContainer.className = 'tracks-layout-grid';
        tracksContainer.appendChild(gridContainer);
      }
    } else {
      gridContainer = tracksContainer;
      if (!append) {
        gridContainer.innerHTML = '';
      }
    }

    const playlist = Array.isArray(root.playlist) ? root.playlist : [];
    const activePlayingTrack = root.activePlayingTrack || null;
    const audioPlayer = document.getElementById('audio-player');

    // Sync currentTrackIndex with activePlayingTrack in the current playlist
    if (activePlayingTrack) {
      root.currentTrackIndex = playlist.findIndex(t => t.id === activePlayingTrack.id);
    } else {
      root.currentTrackIndex = -1;
    }

    const likedTrackIds = root.likedTrackIds || (root.GP?.Views?.Library?.getLikedTrackIds ? root.GP.Views.Library.getLikedTrackIds() : new Set());
    const activeView = root.activeView || '';
    const currentLibrarySubTab = root.currentLibrarySubTab || 'all';
    const activePlaylistId = root.activePlaylistId || null;

    tracks.forEach((track, index) => {
      if (!track) return;

      const card = document.createElement('div');
      const isActive = activePlayingTrack && track.id === activePlayingTrack.id;
      card.className = `track-card ${isActive ? 'active' : ''}`;
      card.setAttribute('role', 'article');

      // Correct playlist index so click events play the correct track
      const overallIndex = append ? playlist.length - tracks.length + index : index;
      card.dataset.index = overallIndex;
      card.dataset.trackId = track.id;

      // Strict validation and fallbacks
      const trackTitle = track.title ? track.title.trim() : 'Unknown Track';
      const trackArtist = track.artist ? track.artist.trim() : 'Unknown Artist';
      card.setAttribute('aria-label', `${trackTitle} — ${trackArtist}`);

      const defaultSvgCover = track.source === 'local'
        ? 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'><defs><linearGradient id=\'g\' x1=\'0\' y1=\'0\' x2=\'1\' y2=\'1\'><stop stop-color=\'%23333a4a\'/><stop offset=\'1\' stop-color=\'%23181b24\'/></linearGradient></defs><rect width=\'100\' height=\'100\' rx=\'18\' fill=\'url(%23g)\'/><path d=\'M46 63V35l26-5v27\' fill=\'none\' stroke=\'%23d9dce7\' stroke-width=\'5\' stroke-linecap=\'round\'/><circle cx=\'37\' cy=\'65\' r=\'9\' fill=\'%23d9dce7\'/><circle cx=\'63\' cy=\'58\' r=\'9\' fill=\'%23d9dce7\'/></svg>'
        : DEFAULT_TRACK_COVER_SVG;

      const coverUrl = getOptimalCover(track.thumbnail, track.source);
      const fallbackCoverUrl = getFallbackCover(track.thumbnail);

      const isLiked = likedTrackIds.has(track.id);
      const heartIcon = isLiked
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;

      let actionsHTML = '';
      if (track.source === 'local' && activeView === 'library' && currentLibrarySubTab === 'local') {
        actionsHTML = `
          <button class="local-track-delete-btn" title="Удалить с устройства" aria-label="Удалить ${escapeHTML(trackTitle)} с устройства" data-id="${track.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
          </button>
        `;
      } else if (activeView === 'playlist-tracks' && activePlaylistId) {
        actionsHTML = `
          <button class="playlist-remove-track-btn" title="Удалить из плейлиста" aria-label="Удалить ${escapeHTML(trackTitle)} из плейлиста" style="background:transparent; border:none; color:var(--text-dim); cursor:pointer; padding:8px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:all 0.2s ease; z-index:20;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        `;
      } else {
        actionsHTML = `
          <button class="playlist-add-btn" title="Добавить в плейлист" aria-label="Добавить ${escapeHTML(trackTitle)} в плейлист">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
        `;
      }

      const artistHTML = `<button class="artist-link" type="button" aria-label="Открыть исполнителя ${escapeHTML(trackArtist)}">${escapeHTML(trackArtist)}</button>`;

      const isCurrentPlaying = isActive && audioPlayer && !audioPlayer.paused;
      const coverPlayIcon = isCurrentPlaying
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 2px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;

      const playsHTML = track.source === 'soundcloud' && (track.playbackCount !== undefined || track.playback_count !== undefined)
        ? `<span class="card-plays" title="Прослушивания"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>${formatPlays(track.playbackCount || track.playback_count)}</span>`
        : '';

      card.innerHTML = `
        <div class="track-cover-container">
          <img src="${coverUrl}" class="card-cover" alt="" loading="lazy" decoding="async" onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='${fallbackCoverUrl}';}">
          <div class="cover-overlay">
            <button class="cover-play-btn" title="Воспроизведение/Пауза" aria-label="Воспроизвести или приостановить ${escapeHTML(trackTitle)}">
              ${coverPlayIcon}
            </button>
          </div>
        </div>
        <div class="card-details">
          <div class="card-title">${escapeHTML(trackTitle)}</div>
          <div class="card-artist">${artistHTML}</div>
          <div class="card-meta">
            <span class="badge ${track.source || 'soundcloud'}">
              ${track.source === 'soundcloud'
                ? `<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style="margin-right:3px"><path d="M23.95 14.47c0-2.45-1.92-4.44-4.29-4.44h-.35c-.48-2.61-2.73-4.6-5.46-4.6-2.58 0-4.73 1.83-5.32 4.26-.26-.06-.53-.09-.81-.09-2.58 0-4.67 2.09-4.67 4.67 0 .16.01.32.02.48C1.29 14.53 0 16.03 0 17.84c0 2.08 1.68 3.76 3.76 3.76h16.5c1.96 0 3.69-1.55 3.69-3.51 0-1.74-1.28-3.18-2.97-3.52z"/></svg>SC`
                : track.source === 'spotify'
                ? `<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style="margin-right:3px"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.377-1.454-5.37-1.783-8.894-.978-.335.077-.67-.134-.746-.47-.077-.335.134-.67.47-.746 3.847-.88 7.143-.51 9.814 1.127.294.18.387.563.207.857s-.563.387-.857.207zm1.225-2.72c-.227.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.082-1.182-.413.125-.847-.107-.972-.52-.125-.413.107-.847.52-.972 3.676-1.116 8.243-.57 11.348 1.337.367.227.487.707.26 1.074zm.107-2.834C14.484 8.7 8.012 8.483 4.262 9.622c-.573.173-1.182-.154-1.355-.727-.173-.573.154-1.182.727-1.355 4.3-1.305 11.442-1.055 15.534 1.373.515.305.683.97.378 1.485-.305.515-.97.683-1.485.378z"/></svg>SP`
                : track.source === 'local'
                ? `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:3px"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>На устройстве`
                : `<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style="margin-right:3px"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>YT`}
            </span>
            <span class="card-meta-right" style="display: flex; align-items: center; gap: 8px;">
              ${playsHTML}
              <span class="card-duration">${track.duration || '0:00'}</span>
            </span>
          </div>
        </div>
        ${actionsHTML}
        ${track.source === 'local' ? '' : `<button class="like-btn ${isLiked ? 'liked' : ''}" aria-label="${isLiked ? 'Убрать из избранного' : 'Добавить в избранное'}" aria-pressed="${isLiked}">${heartIcon}</button>`}
      `;

      card.addEventListener('click', (e) => {
        // Don't play if clicking the like, playlist or artist link button itself
        if (e.target.closest('.like-btn') || e.target.closest('.playlist-add-btn') || e.target.closest('.playlist-remove-track-btn') || e.target.closest('.local-track-delete-btn') || e.target.closest('.artist-link')) return;

        const isCurrent = activePlayingTrack && track.id === activePlayingTrack.id;
        if (isCurrent) {
          if (typeof root.togglePlay === 'function') {
            root.togglePlay();
          } else if (typeof root.togglePlayPause === 'function') {
            root.togglePlayPause();
          } else if (root.GP?.Player?.togglePlayPause) {
            root.GP.Player.togglePlayPause();
          }
        } else {
          if (typeof root.playTrack === 'function') {
            root.playTrack(overallIndex);
          } else if (root.GP?.Player?.playTrack) {
            root.GP.Player.playTrack(overallIndex);
          }
        }
      });

      const likeBtn = card.querySelector('.like-btn');
      if (likeBtn) {
        likeBtn.addEventListener('click', (e) => {
          if (typeof root.toggleLike === 'function') {
            root.toggleLike(e, track);
          } else if (root.GP?.Views?.Library?.toggleLike) {
            root.GP.Views.Library.toggleLike(e, track);
          }
        });
      }

      const artistLink = card.querySelector('.artist-link');
      if (artistLink) {
        artistLink.addEventListener('click', (e) => {
          e.stopPropagation();
          if (track.source === 'soundcloud' && track.artistId) {
            if (typeof root.loadArtistView === 'function') {
              root.loadArtistView(track.artistId);
            } else if (root.GP?.Views?.Artist?.loadArtistView) {
              root.GP.Views.Artist.loadArtistView(track.artistId);
            }
          } else {
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
              searchInput.value = trackArtist;
              if (typeof root.performSearch === 'function') {
                root.performSearch();
              } else if (root.GP?.Views?.Search?.performSearch) {
                root.GP.Views.Search.performSearch();
              }
            }
          }
        });
      }

      if (track.source === 'local' && activeView === 'library' && currentLibrarySubTab === 'local') {
        const deleteBtn = card.querySelector('.local-track-delete-btn');
        deleteBtn?.addEventListener('click', async (e) => {
          e.stopPropagation();
          const confirmFn = typeof root.showConfirmDialog === 'function' ? root.showConfirmDialog : root.GP?.Components?.Notifications?.showConfirmDialog;
          const shouldDelete = confirmFn ? await confirmFn({
            title: 'Удалить локальный трек?',
            message: `«${trackTitle}» будет удалён только из медиатеки этого устройства.`,
            confirmLabel: 'Удалить',
            danger: true
          }) : true;

          if (!shouldDelete) return;

          if (typeof root.deleteLocalTrack === 'function') {
            await root.deleteLocalTrack(track.id);
          } else if (root.GP?.LocalDB?.deleteTrack) {
            await root.GP.LocalDB.deleteTrack(track.id);
          }

          const toastFn = typeof root.showToastNotification === 'function' ? root.showToastNotification : root.GP?.Components?.Notifications?.showToastNotification;
          if (toastFn) {
            toastFn(`«${trackTitle}» удалён с устройства`, 'success', 'Медиатека');
          }

          if (typeof root.loadFavorites === 'function') {
            root.loadFavorites('local');
          }
        });
      } else if (activeView === 'playlist-tracks' && activePlaylistId) {
        const removeBtn = card.querySelector('.playlist-remove-track-btn');
        removeBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (typeof root.removeTrackFromPlaylist === 'function') {
            root.removeTrackFromPlaylist(track.id);
          } else if (root.GP?.Views?.Playlists?.removeTrackFromPlaylist) {
            root.GP.Views.Playlists.removeTrackFromPlaylist(track.id);
          }
        });
      } else {
        const addBtn = card.querySelector('.playlist-add-btn');
        addBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (typeof root.showPlaylistMenu === 'function') {
            root.showPlaylistMenu(e, track);
          } else if (root.GP?.Views?.Playlists?.showPlaylistMenu) {
            root.GP.Views.Playlists.showPlaylistMenu(e, track);
          }
        });
      }

      gridContainer.appendChild(card);
    });
  }

  // --- Registration & Dual Exports ---

  GP.Components.TrackCard = {
    renderTracks
  };

  root.renderTracks = renderTracks;

})(typeof window !== 'undefined' ? window : global);
