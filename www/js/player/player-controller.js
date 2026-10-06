/**
 * GlassPlayer - Core Player & Queue Controller Module
 * Namespace: window.GP.Player
 * Manages playlist queue, playback control, seek timeline, media session, volume, shuffle/repeat.
 */

(function (window) {
  'use strict';

  // --- Queue & Playback State ---
  let playlist = [];
  let currentTrackIndex = -1;
  let activePlayingTrack = null;
  let isSeeking = false;
  let isRepeat = false;
  let isShuffle = false;
  let currentPlayPromise = null;
  let currentSeekOffset = 0;
  let currentTrackDuration = 0;
  let trackLoadTimeout = null;
  let lastProgressUpdateTime = 0;
  let nativeMediaControlsListenerAttached = false;
  let statsIntervalTimer = null;

  let playCountSession = {
    trackId: null,
    continuousSeconds: 0,
    counted: false
  };

  const DEFAULT_TRACK_COVER_SVG = 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'><rect width=\'100\' height=\'100\' fill=\'%23222\'/><path d=\'M30 30 L70 50 L30 70 Z\' fill=\'%23444\'/></svg>';

  // --- Helper Functions ---
  function getAudioPlayer() {
    if (typeof window !== 'undefined' && window.audioPlayer) return window.audioPlayer;
    if (typeof document !== 'undefined') {
      const el = document.getElementById('audio-player');
      if (el) return el;
    }
    return null;
  }

  function getBackendUrl() {
    return (typeof window !== 'undefined' && window.BACKEND_URL) ||
      (typeof window !== 'undefined' && window.API_URL ? `${window.API_URL}/api` : 'https://music-backend-iyni.onrender.com/api');
  }

  function getFetchWithTimeout() {
    return (typeof window !== 'undefined' && window.fetchWithTimeout) ||
      (window.GP && window.GP.Utils && window.GP.Utils.fetchWithTimeout) ||
      (typeof window !== 'undefined' && window.fetch) ||
      (typeof fetch !== 'undefined' ? fetch : (() => Promise.resolve({ status: 200, json: async () => ({}) })));
  }

  function _formatTime(sec) {
    const fn = (window.GP && window.GP.Utils && window.GP.Utils.formatTime) ||
      (typeof window !== 'undefined' && window.formatTime);
    if (typeof fn === 'function') return fn(sec);
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function _parseDurationToSeconds(duration) {
    const fn = (window.GP && window.GP.Utils && window.GP.Utils.parseDurationToSeconds) ||
      (typeof window !== 'undefined' && window.parseDurationToSeconds);
    if (typeof fn === 'function') return fn(duration);
    if (typeof duration === 'number') return duration;
    if (!duration) return 0;
    const parts = String(duration).split(':').map(Number);
    if (parts.length === 2) return (parts[0] * 60) + parts[1];
    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    return 0;
  }

  function showToast(msg, type = 'info', title = null) {
    const fn = typeof window !== 'undefined' && window.showToastNotification;
    if (typeof fn === 'function') fn(msg, type, title);
  }

  function getOptimalCoverUrl(rawUrl, source = 'soundcloud') {
    if (!rawUrl) return DEFAULT_TRACK_COVER_SVG;
    if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.startsWith('assets/')) return rawUrl;

    let directUrl = rawUrl;
    if (directUrl.includes('-large.')) {
      directUrl = directUrl.replace('-large.', '-t500x500.');
    }
    return `https://external-content.duckduckgo.com/iu/?u=${encodeURIComponent(directUrl)}`;
  }

  function getFallbackCoverUrl(rawUrl) {
    if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
      return DEFAULT_TRACK_COVER_SVG;
    }
    return `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&w=300&output=webp`;
  }

  function getAudioStreamUrl(track, seekTime) {
    if (!track) return '';
    if (track.source === 'local' || track.blobUrl) {
      return track.blobUrl || track.streamUrl;
    }
    let streamUrl = `${getBackendUrl()}/stream?id=${encodeURIComponent(track.id)}&source=${track.source}&artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}`;
    if (seekTime !== undefined) {
      streamUrl += `&seek=${seekTime}`;
    }
    return streamUrl;
  }

  // --- Native Media Controls & MediaSession ---
  function getGlassMediaPlugin() {
    return (typeof window !== 'undefined' && window.Capacitor?.Plugins?.GlassMedia) || null;
  }

  function setupMediaSession(track) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !track) return;

    try {
      const artworkSrc = track.thumbnail || track.cover || 'assets/icon.png';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Название трека',
        artist: track.artist || 'Исполнитель',
        album: 'GlassPlayer',
        artwork: [
          { src: artworkSrc, sizes: '96x96', type: 'image/png' },
          { src: artworkSrc, sizes: '128x128', type: 'image/png' },
          { src: artworkSrc, sizes: '192x192', type: 'image/png' },
          { src: artworkSrc, sizes: '256x256', type: 'image/png' },
          { src: artworkSrc, sizes: '512x512', type: 'image/png' }
        ]
      });

      if ('setActionHandler' in navigator.mediaSession) {
        navigator.mediaSession.setActionHandler('play', () => { togglePlay(true); });
        navigator.mediaSession.setActionHandler('pause', () => { togglePlay(false); });
        navigator.mediaSession.setActionHandler('previoustrack', () => { playPrev(); });
        navigator.mediaSession.setActionHandler('nexttrack', () => { playNext(); });
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          const player = getAudioPlayer();
          if (player && details.seekTime !== undefined) {
            player.currentTime = details.seekTime;
            updateMediaSessionPositionState();
          }
        });
      }
    } catch (err) {
      console.warn('[MediaSession] Setup failed:', err.message);
    }
  }

  function updateMediaSessionPositionState() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const player = getAudioPlayer();
    if (!player || !player.duration || isNaN(player.duration)) return;
    if ('setPositionState' in navigator.mediaSession) {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, player.duration),
          playbackRate: player.playbackRate || 1,
          position: Math.min(Math.max(0, player.currentTime || 0), player.duration)
        });
      } catch (e) {}
    }
  }

  function setupNativeMediaControlsListener() {
    const glassMedia = getGlassMediaPlugin();
    if (!glassMedia || nativeMediaControlsListenerAttached) return;

    nativeMediaControlsListenerAttached = true;
    glassMedia.addListener('mediaAction', ({ action }) => {
      if (action === 'play') togglePlay(true);
      if (action === 'pause') togglePlay(false);
      if (action === 'previous') playPrev();
      if (action === 'next') playNext();
    });
  }

  function updateNativeMediaControls(track, isPlaying) {
    const glassMedia = getGlassMediaPlugin();
    if (!glassMedia) return;

    setupNativeMediaControlsListener();
    if (!track) {
      glassMedia.hide?.().catch(() => {});
      return;
    }

    glassMedia.update({
      title: track.title || 'GlassPlayer',
      artist: track.artist || 'Ready to play',
      artwork: track.thumbnail || track.cover || 'assets/icon.png',
      isPlaying: Boolean(isPlaying)
    }).catch((err) => {
      console.warn('[GlassMedia] Native notification update failed:', err.message);
    });
  }

  function updateMediaSessionPlaybackState(isPlaying) {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }

  // --- Play Count & Statistics Tracker ---
  function getProfilePlayStats() {
    if (typeof localStorage === 'undefined') return {};
    const getKey = (typeof window !== 'undefined' && window.getStorageKey) || ((k) => `gp_${k}`);
    const scopedKey = getKey('stats_counts');
    const scoped = localStorage.getItem(scopedKey);
    const legacy = localStorage.getItem('gp_stats_counts');
    try {
      return JSON.parse(scoped || legacy || '{}');
    } catch (err) {
      return {};
    }
  }

  function incrementPlayCount(track) {
    if (!track || typeof localStorage === 'undefined') return;
    try {
      const stats = getProfilePlayStats();
      if (!stats[track.id]) {
        stats[track.id] = {
          id: track.id,
          title: track.title,
          artist: track.artist,
          thumbnail: track.thumbnail,
          source: track.source,
          count: 0
        };
      }
      stats[track.id].count += 1;
      stats[track.id].lastPlayedAt = Date.now();

      const getKey = (typeof window !== 'undefined' && window.getStorageKey) || ((k) => `gp_${k}`);
      localStorage.setItem(getKey('stats_counts'), JSON.stringify(stats));

      if (typeof window !== 'undefined' && typeof window.invalidateHomeRecommendations === 'function') {
        window.invalidateHomeRecommendations();
      }
    } catch (err) {
      console.error('Failed to update play count statistics:', err);
    }
  }

  function resetPlayCountSession(track) {
    playCountSession = {
      trackId: track?.id || null,
      continuousSeconds: 0,
      counted: false
    };
  }

  function maybeCommitQualifiedPlay() {
    const track = playlist[currentTrackIndex];
    const player = getAudioPlayer();
    if (!track || playCountSession.counted || playCountSession.trackId !== track.id) return;

    const duration = currentTrackDuration || (player ? player.duration : 0) || 0;
    const listenedEnough = playCountSession.continuousSeconds >= 30;
    const passedHalf = duration > 0 && playCountSession.continuousSeconds >= duration * 0.5;

    if (listenedEnough || passedHalf) {
      incrementPlayCount(track);
      playCountSession.counted = true;
    }
  }

  // Periodic 10s playback count tracker
  if (typeof window !== 'undefined') {
    if (statsIntervalTimer) clearInterval(statsIntervalTimer);
    statsIntervalTimer = setInterval(() => {
      const player = getAudioPlayer();
      if (!player || player.paused || isSeeking) return;

      const track = playlist[currentTrackIndex];
      if (!track) return;

      if (typeof localStorage !== 'undefined') {
        let totalSeconds = parseFloat(localStorage.getItem('gp_stats_total_seconds')) || 0;
        totalSeconds += 10;
        localStorage.setItem('gp_stats_total_seconds', totalSeconds);
      }

      if (playCountSession.trackId !== track.id) {
        resetPlayCountSession(track);
      }
      playCountSession.continuousSeconds += 10;
      maybeCommitQualifiedPlay();
    }, 10000);
  }

  // --- UI Updates ---
  function setPlayState(isPlaying) {
    if (typeof document === 'undefined') return;

    const playIcon = document.getElementById('play-icon');
    const pauseIcon = document.getElementById('pause-icon');
    const miniPlayIcon = document.getElementById('mini-play-icon');
    const miniPauseIcon = document.getElementById('mini-pause-icon');
    const currentCover = document.getElementById('current-cover');
    const miniCurrentCover = document.getElementById('mini-current-cover');

    const container = document.querySelector('.container');
    const playerBarEl = document.querySelector('.player-bar');

    if (isPlaying) {
      if (playIcon) playIcon.classList.add('hidden');
      if (pauseIcon) pauseIcon.classList.remove('hidden');
      if (miniPlayIcon) miniPlayIcon.classList.add('hidden');
      if (miniPauseIcon) miniPauseIcon.classList.remove('hidden');
      if (currentCover) currentCover.classList.add('playing');
      if (miniCurrentCover) miniCurrentCover.classList.add('playing');

      if (container) container.classList.add('player-active');
      if (playerBarEl) {
        playerBarEl.classList.remove('dismissed');
        playerBarEl.classList.add('active');
        playerBarEl.style.transform = 'translate3d(0, 0, 0)';
      }
    } else {
      if (playIcon) playIcon.classList.remove('hidden');
      if (pauseIcon) pauseIcon.classList.add('hidden');
      if (miniPlayIcon) miniPlayIcon.classList.remove('hidden');
      if (miniPauseIcon) miniPauseIcon.classList.add('hidden');
      if (currentCover) currentCover.classList.remove('playing');
      if (miniCurrentCover) miniCurrentCover.classList.remove('playing');
    }

    updateMediaSessionPlaybackState(isPlaying);
    updateNativeMediaControls(playlist[currentTrackIndex], isPlaying);
    updateCoverPlayButtons();
  }

  function updateCoverPlayButtons() {
    if (typeof document === 'undefined') return;
    const player = getAudioPlayer();
    const isPlaying = player ? !player.paused : false;
    const currentTrack = playlist[currentTrackIndex];

    document.querySelectorAll('.track-card').forEach(card => {
      const trackId = card.dataset.trackId;
      const playBtn = card.querySelector('.cover-play-btn');
      if (!playBtn) return;

      const isCurrent = currentTrack && trackId === currentTrack.id;
      if (isCurrent && isPlaying) {
        playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
      } else {
        playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 2px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      }
    });

    document.querySelectorAll('.track-card-horizontal').forEach(card => {
      const trackId = card.dataset.trackId;
      const playBtn = card.querySelector('.card-play-btn-horizontal');
      if (!playBtn) return;

      const isCurrent = currentTrack && trackId === currentTrack.id;
      if (isCurrent && isPlaying) {
        playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
      } else {
        playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 2px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      }
    });
  }

  // --- Core Playback Execution ---
  function playTrack(index) {
    if (index < 0 || index >= playlist.length) return;

    currentTrackIndex = index;
    const track = playlist[index];
    activePlayingTrack = track;
    const player = getAudioPlayer();
    if (!player) return;

    // Slide up bottom player bar
    if (typeof document !== 'undefined') {
      const mainContainer = document.querySelector('.container');
      if (mainContainer) {
        mainContainer.classList.add('player-active');
      }

      // Update Active Card UI State
      const cards = document.querySelectorAll('.track-card, .track-card-horizontal');
      cards.forEach(card => card.classList.remove('active'));
      const activeCards = document.querySelectorAll(`.track-card[data-track-id="${track.id}"], .track-card-horizontal[data-track-id="${track.id}"]`);
      activeCards.forEach(card => card.classList.add('active'));

      // Update Player Meta Info
      const currentTitle = document.getElementById('current-title');
      const miniCurrentTitle = document.getElementById('mini-current-title');
      const currentArtist = document.getElementById('current-artist');
      const miniCurrentArtist = document.getElementById('mini-current-artist');
      const currentCover = document.getElementById('current-cover');
      const miniCurrentCover = document.getElementById('mini-current-cover');

      if (currentTitle) currentTitle.textContent = track.title;
      if (miniCurrentTitle) {
        miniCurrentTitle.textContent = track.title;
        if (track.title.length > 22) {
          miniCurrentTitle.classList.add('marquee-scroll');
        } else {
          miniCurrentTitle.classList.remove('marquee-scroll');
        }
      }

      if (currentArtist) {
        currentArtist.innerHTML = `<span class="artist-link">${track.artist}</span>`;
        const artistLink = currentArtist.querySelector('.artist-link');
        if (artistLink) {
          artistLink.addEventListener('click', (e) => {
            e.stopPropagation();
            if (track.source === 'soundcloud' && track.artistId) {
              if (typeof window.loadArtistView === 'function') window.loadArtistView(track.artistId);
            } else {
              const searchInput = document.getElementById('search-input');
              if (searchInput) {
                searchInput.value = track.artist;
                if (typeof window.performSearch === 'function') window.performSearch();
              }
            }
          });
        }
      }
      if (miniCurrentArtist) miniCurrentArtist.textContent = track.artist;

      const coverUrl = getOptimalCoverUrl(track.thumbnail, track.source);
      const fallbackCoverUrl = getFallbackCoverUrl(track.thumbnail);

      if (currentCover) {
        currentCover.crossOrigin = 'anonymous';
        currentCover.onerror = () => { currentCover.onerror = null; currentCover.src = fallbackCoverUrl; };
        currentCover.onload = () => {
          if (window.GP && window.GP.Theme && typeof window.GP.Theme.applyDynamicCoverColor === 'function') {
            window.GP.Theme.applyDynamicCoverColor();
          } else if (typeof window.applyDynamicCoverColor === 'function') {
            window.applyDynamicCoverColor();
          }
        };
        currentCover.src = coverUrl;
      }

      if (miniCurrentCover) {
        miniCurrentCover.crossOrigin = 'anonymous';
        miniCurrentCover.onerror = () => { miniCurrentCover.onerror = null; miniCurrentCover.src = fallbackCoverUrl; };
        miniCurrentCover.src = coverUrl;
      }
    }

    // Add to playback history
    if (typeof window !== 'undefined' && typeof window.addToHistory === 'function') {
      window.addToHistory(track);
    }

    resetPlayCountSession(track);

    if (typeof window !== 'undefined' && typeof window.updateLikeUI === 'function') {
      window.updateLikeUI(track.id);
    }

    currentTrackDuration = _parseDurationToSeconds(track.duration);
    currentSeekOffset = 0;

    // Load stream with full audio player reset for local MP3 switching
    player.pause();
    player.removeAttribute('src');
    player.crossOrigin = 'anonymous';
    const rawStreamUrl = getAudioStreamUrl(track);

    // Initialize and apply Audio Effects
    const initEffects = (window.GP && window.GP.Audio && window.GP.Audio.initAudioEffects) || window.initAudioEffects;
    if (typeof initEffects === 'function') initEffects();

    const resumeCtx = (window.GP && window.GP.Audio && window.GP.Audio.resumeAudioContext) || window.resumeAudioContext;
    if (typeof resumeCtx === 'function') resumeCtx();

    const applyEffects = (window.GP && window.GP.Audio && window.GP.Audio.applyAudioEffectsState) || window.applyAudioEffectsState;
    if (typeof applyEffects === 'function') applyEffects();

    setupMediaSession(track);
    setupNativeMediaControlsListener();

    // Trigger lyrics load if Lyrics module exists
    if (window.GP && window.GP.Lyrics && typeof window.GP.Lyrics.loadLyrics === 'function') {
      window.GP.Lyrics.loadLyrics(track);
    } else if (typeof window.loadLyrics === 'function') {
      window.loadLyrics(track);
    }

    // Clear any previous loading timeout before starting a new track
    clearTimeout(trackLoadTimeout);

    const startPlaybackWithUrl = (targetUrl, isFallback = false) => {
      player.src = targetUrl;
      const playPromise = player.play();
      currentPlayPromise = playPromise;

      const loadTimeoutMs = (!isFallback && targetUrl !== rawStreamUrl) ? 2500 : 12000;

      trackLoadTimeout = setTimeout(() => {
        if (currentPlayPromise === playPromise) {
          if (!isFallback && targetUrl !== rawStreamUrl) {
            console.log('[Stream Resolution] Direct CDN stream timed out, falling back to backend stream proxy...');
            startPlaybackWithUrl(rawStreamUrl, true);
          } else {
            handleTrackLoadError("Track loading timed out (12 seconds limit)");
          }
        }
      }, loadTimeoutMs);

      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            clearTimeout(trackLoadTimeout);
            if (currentPlayPromise === playPromise) {
              setPlayState(true);
            }
          })
          .catch(err => {
            clearTimeout(trackLoadTimeout);
            if (err.name === 'AbortError') return;
            console.error('Playback failed:', err);

            // Fallback to proxy stream URL if direct CDN URL failed
            if (!isFallback && targetUrl !== rawStreamUrl) {
              console.log('[Stream Resolution] Direct CDN stream failed, falling back to backend stream proxy...');
              startPlaybackWithUrl(rawStreamUrl, true);
            } else if (currentPlayPromise === playPromise) {
              handleTrackLoadError(err.message || 'Media playback error');
            }
          });
      }
    };

    // For SoundCloud tracks: first try direct CDN resolution via DirectSoundCloudEngine
    const scEngine = (typeof window !== 'undefined' && (window.DirectSoundCloudEngine || window.GP?.DirectSoundCloudEngine));
    if (track.source === 'soundcloud' && !track.blobUrl && scEngine && typeof scEngine.resolveStreamUrl === 'function') {
      scEngine.resolveStreamUrl(track)
        .then(directCdnUrl => {
          if (directCdnUrl) {
            console.log('[PlayTrack] Direct CDN stream resolved successfully');
            startPlaybackWithUrl(directCdnUrl, false);
          } else {
            const fetchFn = getFetchWithTimeout();
            fetchFn(`${rawStreamUrl}&direct=true`, {}, 4000)
              .then(r => r.json())
              .then(data => {
                if (data && data.status === 'success' && data.directUrl) {
                  startPlaybackWithUrl(data.directUrl, false);
                } else {
                  startPlaybackWithUrl(rawStreamUrl, true);
                }
              })
              .catch(() => {
                startPlaybackWithUrl(rawStreamUrl, true);
              });
          }
        })
        .catch(() => {
          startPlaybackWithUrl(rawStreamUrl, true);
        });
    } else {
      // Local audio, Spotify translation, or proxy stream
      if (track.source === 'local' || track.blobUrl) {
        startPlaybackWithUrl(rawStreamUrl, false);
      } else {
        const fetchFn = getFetchWithTimeout();
        fetchFn(`${rawStreamUrl}&direct=true`, {}, 4000)
          .then(r => r.json())
          .then(data => {
            if (data && data.status === 'success' && data.directUrl) {
              startPlaybackWithUrl(data.directUrl, false);
            } else {
              startPlaybackWithUrl(rawStreamUrl, true);
            }
          })
          .catch(() => {
            startPlaybackWithUrl(rawStreamUrl, true);
          });
      }
    }
  }

  async function handleTrackLoadError(reason) {
    console.warn('[Track Load Error]:', reason);
    clearTimeout(trackLoadTimeout);

    const player = getAudioPlayer();
    if (player) player.pause();
    setPlayState(false);

    let detailedMessage = "Этот трек недоступен";
    let is404Error = false;

    if (player && player.src) {
      try {
        const response = await fetch(player.src, {
          headers: { 'Range': 'bytes=0-0' }
        });
        if (response.status === 404) {
          is404Error = true;
        }
        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          if (errData && errData.message) {
            if (errData.message.includes('not found') || response.status === 404) {
              is404Error = true;
            }
            detailedMessage = `Ошибка загрузки: ${errData.message}`;
          } else {
            detailedMessage = `Ошибка сервера (HTTP ${response.status})`;
          }
        }
      } catch (e) {
        console.error('[Error Resolver] Failed to fetch error details:', e);
        detailedMessage = `Сетевая ошибка: ${reason}`;
      }
    }

    if (is404Error) {
      detailedMessage = "Аудиопоток не найден в базе SoundCloud";
    }

    showToast(detailedMessage, 'error', 'Ошибка загрузки');

    if (is404Error) {
      setTimeout(() => {
        const p = getAudioPlayer();
        if (playlist.length > 0 && (!p || p.paused)) {
          playNext();
        }
      }, 1800);
    }
  }

  function togglePlay(forcePlay) {
    if (currentTrackIndex === -1 && playlist.length > 0) {
      playTrack(0);
      return;
    }

    const player = getAudioPlayer();
    if (!player) return;

    const shouldPlay = typeof forcePlay === 'boolean' ? forcePlay : player.paused;

    if (shouldPlay) {
      const initEffects = (window.GP && window.GP.Audio && window.GP.Audio.initAudioEffects) || window.initAudioEffects;
      if (typeof initEffects === 'function') initEffects();

      const resumeCtx = (window.GP && window.GP.Audio && window.GP.Audio.resumeAudioContext) || window.resumeAudioContext;
      if (typeof resumeCtx === 'function') resumeCtx();

      const playPromise = player.play();
      currentPlayPromise = playPromise;
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            if (currentPlayPromise === playPromise) {
              setPlayState(true);
            }
          })
          .catch(err => {
            if (err.name !== 'AbortError') {
              console.error('Play failed:', err);
            }
          });
      }
    } else if (!player.paused) {
      player.pause();
      setPlayState(false);
    }
  }

  function playNext() {
    if (playlist.length === 0) return;

    let nextIndex;
    if (isShuffle) {
      if (playlist.length === 1) {
        nextIndex = 0;
      } else {
        do {
          nextIndex = Math.floor(Math.random() * playlist.length);
        } while (nextIndex === currentTrackIndex);
      }
    } else {
      nextIndex = currentTrackIndex + 1;
      if (nextIndex >= playlist.length) {
        nextIndex = 0; // Loop back
      }
    }
    playTrack(nextIndex);
  }

  function playPrev() {
    if (playlist.length === 0) return;

    let prevIndex;
    if (isShuffle) {
      if (playlist.length === 1) {
        prevIndex = 0;
      } else {
        do {
          prevIndex = Math.floor(Math.random() * playlist.length);
        } while (prevIndex === currentTrackIndex);
      }
    } else {
      prevIndex = currentTrackIndex - 1;
      if (prevIndex < 0) {
        prevIndex = playlist.length - 1; // Go to last
      }
    }
    playTrack(prevIndex);
  }

  function seekToPercent(percent) {
    const player = getAudioPlayer();
    if (!player) return;

    const duration = currentTrackDuration || player.duration || 0;
    const track = playlist[currentTrackIndex];
    if (duration > 0 && track) {
      const seekTime = (parseFloat(percent) / 100) * duration;
      currentSeekOffset = seekTime;

      player.crossOrigin = 'anonymous';
      player.src = getAudioStreamUrl(track, seekTime);
      const playPromise = player.play();
      currentPlayPromise = playPromise;
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            if (currentPlayPromise === playPromise) {
              setPlayState(true);
            }
          })
          .catch(err => {
            if (err.name !== 'AbortError') {
              console.error('Playback failed after seek:', err);
            }
          });
      }
    }
  }

  function toggleShuffle(force) {
    isShuffle = typeof force === 'boolean' ? force : !isShuffle;
    if (typeof document !== 'undefined') {
      const shuffleBtn = document.getElementById('shuffle-button');
      const miniShuffleBtn = document.getElementById('mini-shuffle-button');
      if (shuffleBtn) {
        shuffleBtn.classList.toggle('active', isShuffle);
        shuffleBtn.setAttribute('aria-pressed', String(isShuffle));
      }
      if (miniShuffleBtn) {
        miniShuffleBtn.classList.toggle('active', isShuffle);
        miniShuffleBtn.setAttribute('aria-pressed', String(isShuffle));
      }
    }
    return isShuffle;
  }

  function toggleRepeat(force) {
    isRepeat = typeof force === 'boolean' ? force : !isRepeat;
    if (typeof document !== 'undefined') {
      const repeatBtn = document.getElementById('repeat-button');
      const miniRepeatBtn = document.getElementById('mini-repeat-button');
      if (repeatBtn) {
        repeatBtn.classList.toggle('active', isRepeat);
        repeatBtn.setAttribute('aria-pressed', String(isRepeat));
      }
      if (miniRepeatBtn) {
        miniRepeatBtn.classList.toggle('active', isRepeat);
        miniRepeatBtn.setAttribute('aria-pressed', String(isRepeat));
      }
    }
    return isRepeat;
  }

  // --- Event Bindings ---
  let playerListenersAttached = false;
  function initPlayerEventListeners() {
    if (typeof document === 'undefined' || playerListenersAttached) return;
    playerListenersAttached = true;

    const playBtn = document.getElementById('play-button');
    const nextBtn = document.getElementById('next-button');
    const prevBtn = document.getElementById('prev-button');
    const miniPlayBtn = document.getElementById('mini-play-button');
    const miniNextBtn = document.getElementById('mini-next-button');
    const miniPrevBtn = document.getElementById('mini-prev-button');

    if (playBtn) playBtn.addEventListener('click', () => togglePlay());
    if (nextBtn) nextBtn.addEventListener('click', () => playNext());
    if (prevBtn) prevBtn.addEventListener('click', () => playPrev());

    if (miniPlayBtn) miniPlayBtn.addEventListener('click', () => togglePlay());
    if (miniNextBtn) miniNextBtn.addEventListener('click', () => playNext());
    if (miniPrevBtn) miniPrevBtn.addEventListener('click', () => playPrev());

    const progressSlider = document.getElementById('progress-slider');
    const currentTimeText = document.getElementById('current-time');
    const totalTimeText = document.getElementById('total-time');
    const miniProgressBar = document.getElementById('mini-progress-bar');
    const miniProgressSlider = document.getElementById('mini-progress-slider');
    const volumeSlider = document.getElementById('volume-slider');

    if (progressSlider) {
      progressSlider.addEventListener('input', () => {
        isSeeking = true;
        const player = getAudioPlayer();
        const duration = currentTrackDuration || (player ? player.duration : 0) || 0;
        if (currentTimeText) {
          currentTimeText.textContent = _formatTime((parseFloat(progressSlider.value) / 100) * duration);
        }
      });

      progressSlider.addEventListener('change', () => {
        seekToPercent(progressSlider.value);
        isSeeking = false;
      });
    }

    if (miniProgressSlider) {
      miniProgressSlider.addEventListener('input', () => {
        isSeeking = true;
        if (miniProgressBar) {
          miniProgressBar.style.width = `${miniProgressSlider.value}%`;
        }
      });

      miniProgressSlider.addEventListener('change', () => {
        seekToPercent(miniProgressSlider.value);
        isSeeking = false;
      });
    }

    if (volumeSlider) {
      volumeSlider.addEventListener('input', () => {
        const player = getAudioPlayer();
        const vol = volumeSlider.value / 100;
        if (player) player.volume = vol;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('gp_volume', vol);
        }
      });
    }

    const shuffleBtn = document.getElementById('shuffle-button');
    const repeatBtn = document.getElementById('repeat-button');
    const miniShuffleBtn = document.getElementById('mini-shuffle-button');
    const miniRepeatBtn = document.getElementById('mini-repeat-button');

    if (shuffleBtn) shuffleBtn.addEventListener('click', () => toggleShuffle());
    if (repeatBtn) repeatBtn.addEventListener('click', () => toggleRepeat());
    if (miniShuffleBtn) miniShuffleBtn.addEventListener('click', () => toggleShuffle());
    if (miniRepeatBtn) miniRepeatBtn.addEventListener('click', () => toggleRepeat());

    // Audio Element Event Listeners
    const player = getAudioPlayer();
    if (player) {
      player.crossOrigin = 'anonymous';

      player.addEventListener('loadedmetadata', () => {
        clearTimeout(trackLoadTimeout);
        if (progressSlider) progressSlider.max = 100;
        const applyEffects = (window.GP && window.GP.Audio && window.GP.Audio.applyAudioEffectsState) || window.applyAudioEffectsState;
        if (typeof applyEffects === 'function') applyEffects();
      });

      player.addEventListener('onerror', () => {
        handleTrackLoadError("Audio element fired onerror event");
      });

      player.addEventListener('timeupdate', () => {
        if (isSeeking) return;
        const now = Date.now();
        if (now - lastProgressUpdateTime < 250) return;
        lastProgressUpdateTime = now;

        const current = currentSeekOffset + player.currentTime;
        const duration = currentTrackDuration || player.duration || 0;

        if (currentTimeText) currentTimeText.textContent = _formatTime(current);

        if (duration > 0) {
          if (totalTimeText) totalTimeText.textContent = _formatTime(duration);
          if (progressSlider) {
            progressSlider.max = 100;
            progressSlider.value = (current / duration) * 100;
          }
          if (miniProgressBar) {
            miniProgressBar.style.width = `${(current / duration) * 100}%`;
          }
          const mobileProgressFill = document.getElementById('mobile-mini-progress-fill');
          if (mobileProgressFill) {
            mobileProgressFill.style.width = `${(current / duration) * 100}%`;
          }
          if (miniProgressSlider && (!miniProgressSlider.matches || !miniProgressSlider.matches(':active'))) {
            miniProgressSlider.value = (current / duration) * 100;
          }
        } else {
          if (progressSlider) progressSlider.value = 0;
          if (miniProgressBar) miniProgressBar.style.width = '0%';
          const mobileProgressFill = document.getElementById('mobile-mini-progress-fill');
          if (mobileProgressFill) mobileProgressFill.style.width = '0%';
          if (miniProgressSlider) miniProgressSlider.value = 0;
        }

        // Synchronize karaoke/lyrics
        if (window.GP && window.GP.Lyrics && typeof window.GP.Lyrics.syncLyricsToTime === 'function') {
          window.GP.Lyrics.syncLyricsToTime(current);
        } else if (typeof window.syncLyricsToTime === 'function') {
          window.syncLyricsToTime(current);
        }
      });

      player.addEventListener('ended', () => {
        if (isRepeat) {
          currentSeekOffset = 0;
          const track = playlist[currentTrackIndex];
          if (track) {
            player.crossOrigin = 'anonymous';
            player.src = getAudioStreamUrl(track);
            const playPromise = player.play();
            currentPlayPromise = playPromise;
            if (playPromise && typeof playPromise.then === 'function') {
              playPromise
                .then(() => {
                  if (currentPlayPromise === playPromise) {
                    setPlayState(true);
                  }
                })
                .catch(err => {
                  if (err.name !== 'AbortError') {
                    console.error('Repeat playback failed:', err);
                  }
                });
            }
          }
        } else {
          playNext();
        }
      });

      player.addEventListener('play', () => {
        const curTrack = playlist[currentTrackIndex];
        updateMediaSessionPlaybackState(true);
        updateMediaSessionPositionState();
        if (curTrack) {
          updateNativeMediaControls(curTrack, true);
        }

        if (typeof window.sendDiscordPresence === 'function') window.sendDiscordPresence();
        if (typeof window.startPresenceInterval === 'function') window.startPresenceInterval();

        if (window.GP && window.GP.Social && typeof window.GP.Social.broadcastPlayerStatus === 'function') {
          window.GP.Social.broadcastPlayerStatus();
        } else if (typeof window.broadcastPlayerStatus === 'function') {
          window.broadcastPlayerStatus();
        }

        if (window.GP && window.GP.Visualizer && typeof window.GP.Visualizer.startVisualizer === 'function') {
          window.GP.Visualizer.startVisualizer();
        } else if (typeof window.startVisualizer === 'function') {
          window.startVisualizer();
        }
      });

      player.addEventListener('pause', () => {
        playCountSession.continuousSeconds = 0;
        const curTrack = playlist[currentTrackIndex];
        updateMediaSessionPlaybackState(false);
        updateMediaSessionPositionState();
        if (curTrack) {
          updateNativeMediaControls(curTrack, false);
        }

        if (typeof window.rpcInterval !== 'undefined' && window.rpcInterval) {
          clearInterval(window.rpcInterval);
          window.rpcInterval = null;
        }

        if (typeof window.sendDiscordPresence === 'function') window.sendDiscordPresence();

        if (window.GP && window.GP.Social && typeof window.GP.Social.broadcastPlayerStatus === 'function') {
          window.GP.Social.broadcastPlayerStatus();
        } else if (typeof window.broadcastPlayerStatus === 'function') {
          window.broadcastPlayerStatus();
        }

        if (window.GP && window.GP.Visualizer && typeof window.GP.Visualizer.stopVisualizer === 'function') {
          window.GP.Visualizer.stopVisualizer();
        } else if (typeof window.stopVisualizer === 'function') {
          window.stopVisualizer();
        }
      });
    }

    // --- Mobile Mini-Player & Fullscreen Sheet Interactions ---
    const playerBar = document.querySelector('.player-bar');
    const playerTrackInfo = document.getElementById('player-track-info') || document.querySelector('.player-track-info');
    const mobileCollapseBtn = document.getElementById('mobile-collapse-player-btn');
    const mobileSheetLyricsBtn = document.getElementById('mobile-sheet-lyrics-btn');

    if (playerBar) {
      if (playerTrackInfo) {
        playerTrackInfo.addEventListener('click', (e) => {
          // If on mobile view, expand player into fullscreen sheet (unless clicking like button)
          if (typeof window !== 'undefined' && window.innerWidth <= 768) {
            if (e.target.closest('#player-like-btn') || e.target.closest('.artist-link')) return;
            playerBar.classList.add('mobile-fullscreen');
          }
        });
      }

      if (mobileCollapseBtn) {
        mobileCollapseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          playerBar.classList.remove('mobile-fullscreen');
        });
      }

      if (mobileSheetLyricsBtn) {
        mobileSheetLyricsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const lyricsBtn = document.getElementById('lyrics-btn');
          if (lyricsBtn) lyricsBtn.click();
        });
      }

      // Swipe-down gesture to collapse fullscreen player sheet on mobile
      let touchStartY = 0;
      playerBar.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) {
          touchStartY = e.touches[0].clientY;
        }
      }, { passive: true });

      playerBar.addEventListener('touchend', (e) => {
        if (!playerBar.classList.contains('mobile-fullscreen')) return;
        if (e.changedTouches && e.changedTouches[0]) {
          const deltaY = e.changedTouches[0].clientY - touchStartY;
          // If swiped down at least 65px
          if (deltaY > 65) {
            playerBar.classList.remove('mobile-fullscreen');
          }
        }
      }, { passive: true });
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initPlayerEventListeners);
    } else {
      initPlayerEventListeners();
    }
  }

  // --- Namespace & Export ---
  window.GP = window.GP || {};
  window.GP.Player = {
    playTrack,
    togglePlay,
    togglePlayPause: togglePlay,
    playNext,
    playNextTrack: playNext,
    playPrev,
    playPrevTrack: playPrev,
    seekToPercent,
    toggleShuffle,
    toggleRepeat,
    setPlayState,
    updateCoverPlayButtons,
    handleTrackLoadError,
    getAudioStreamUrl,
    getOptimalCoverUrl,
    getFallbackCoverUrl,
    setupMediaSession,
    updateMediaSessionPlaybackState,
    updateMediaSessionPositionState,
    updateNativeMediaControls,
    incrementPlayCount,
    resetPlayCountSession,
    maybeCommitQualifiedPlay,
    initPlayerEventListeners,
    getAudioPlayer,
    getPlaylist: () => playlist,
    setPlaylist: (pl) => { playlist = Array.isArray(pl) ? pl : []; },
    getCurrentTrackIndex: () => currentTrackIndex,
    setCurrentTrackIndex: (idx) => { currentTrackIndex = idx; },
    getActivePlayingTrack: () => activePlayingTrack,
    getIsShuffle: () => isShuffle,
    getIsRepeat: () => isRepeat,
    getIsSeeking: () => isSeeking
  };

  // Backward compatibility global exports
  window.playTrack = playTrack;
  window.togglePlay = togglePlay;
  window.togglePlayPause = togglePlay;
  window.playNext = playNext;
  window.playNextTrack = playNext;
  window.playPrev = playPrev;
  window.playPrevTrack = playPrev;
  window.seekToPercent = seekToPercent;
  window.toggleShuffle = toggleShuffle;
  window.toggleRepeat = toggleRepeat;
  window.setPlayState = setPlayState;
  window.updateCoverPlayButtons = updateCoverPlayButtons;
  window.handleTrackLoadError = handleTrackLoadError;
  window.getAudioStreamUrl = getAudioStreamUrl;
  window.getOptimalCoverUrl = getOptimalCoverUrl;
  window.getFallbackCoverUrl = getFallbackCoverUrl;
  window.setupMediaSession = setupMediaSession;
  window.updateMediaSessionPlaybackState = updateMediaSessionPlaybackState;
  window.updateMediaSessionPositionState = updateMediaSessionPositionState;
  window.updateNativeMediaControls = updateNativeMediaControls;
  window.incrementPlayCount = incrementPlayCount;
  window.resetPlayCountSession = resetPlayCountSession;
  window.maybeCommitQualifiedPlay = maybeCommitQualifiedPlay;

  Object.defineProperty(window, 'playlist', {
    get: () => playlist,
    set: (val) => { playlist = Array.isArray(val) ? val : []; },
    configurable: true
  });

  Object.defineProperty(window, 'currentTrackIndex', {
    get: () => currentTrackIndex,
    set: (val) => { currentTrackIndex = typeof val === 'number' ? val : -1; },
    configurable: true
  });

  Object.defineProperty(window, 'activePlayingTrack', {
    get: () => activePlayingTrack,
    set: (val) => { activePlayingTrack = val; },
    configurable: true
  });

  Object.defineProperty(window, 'isSeeking', {
    get: () => isSeeking,
    set: (val) => { isSeeking = Boolean(val); },
    configurable: true
  });

  Object.defineProperty(window, 'isRepeat', {
    get: () => isRepeat,
    set: (val) => { isRepeat = Boolean(val); },
    configurable: true
  });

  Object.defineProperty(window, 'isShuffle', {
    get: () => isShuffle,
    set: (val) => { isShuffle = Boolean(val); },
    configurable: true
  });

  Object.defineProperty(window, 'currentPlayPromise', {
    get: () => currentPlayPromise,
    set: (val) => { currentPlayPromise = val; },
    configurable: true
  });

  Object.defineProperty(window, 'currentSeekOffset', {
    get: () => currentSeekOffset,
    set: (val) => { currentSeekOffset = typeof val === 'number' ? val : 0; },
    configurable: true
  });

  Object.defineProperty(window, 'currentTrackDuration', {
    get: () => currentTrackDuration,
    set: (val) => { currentTrackDuration = typeof val === 'number' ? val : 0; },
    configurable: true
  });

  Object.defineProperty(window, 'playCountSession', {
    get: () => playCountSession,
    set: (val) => { playCountSession = val; },
    configurable: true
  });

  Object.defineProperty(window, 'trackLoadTimeout', {
    get: () => trackLoadTimeout,
    set: (val) => { trackLoadTimeout = val; },
    configurable: true
  });

})(typeof window !== 'undefined' ? window : global);
