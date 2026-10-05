/**
 * GlassPlayer - Social WebSocket Collaboration & Presence Module
 * Namespace: window.GP.Social.Socket
 * Manages WebSocket connection, presence updates, heartbeat ping/pong, and real-time social events.
 */

(function (window) {
  'use strict';

  let ws = null;
  let wsReconnectTimeout = null;
  let wsPingInterval = null;

  function clearSocketTimers() {
    if (wsPingInterval) {
      clearInterval(wsPingInterval);
      wsPingInterval = null;
    }
    if (wsReconnectTimeout) {
      clearTimeout(wsReconnectTimeout);
      wsReconnectTimeout = null;
    }
  }

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

  function connectWS() {
    if (ws) {
      try {
        ws.close();
      } catch (e) {}
    }
    clearSocketTimers();

    const user = getUser();
    const token = getToken();
    if (!user || !token) return;

    if (typeof WebSocket === 'undefined') return;

    const wsUrl = getBackendUrl().replace(/^http/, 'ws');
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      console.warn('[WS Creation Error]:', err.message);
      return;
    }

    ws.onopen = () => {
      console.log('[WS] Connected to server.');
      try {
        ws.send(JSON.stringify({ type: 'auth', userId: user.id }));
      } catch (e) {}

      broadcastPlayerStatus();

      const loadFriends = (window.GP && window.GP.Social && window.GP.Social.loadMutualFriends) ||
        (typeof window !== 'undefined' && window.loadMutualFriends);
      if (typeof loadFriends === 'function') {
        loadFriends();
      }

      // Send heartbeat every 25 seconds to keep connection alive through proxies
      if (wsPingInterval) clearInterval(wsPingInterval);
      wsPingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'ping' }));
          } catch (e) {}
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'friend_status_update') {
          const { userId, status } = data;
          const friendStatuses = (window.GP && window.GP.Social && window.GP.Social.Friends && window.GP.Social.Friends.getStatuses && window.GP.Social.Friends.getStatuses()) ||
            (typeof window !== 'undefined' && window.friendStatuses);

          if (friendStatuses && typeof friendStatuses.set === 'function') {
            friendStatuses.set(userId, status);
          }

          const renderFriends = (window.GP && window.GP.Social && window.GP.Social.renderFriendActivity) ||
            (typeof window !== 'undefined' && window.renderFriendActivity);
          if (typeof renderFriends === 'function') {
            renderFriends();
          }

          // If currently in playlists view, re-render to update collaborative glow indicator
          if (typeof window !== 'undefined' && window.activeView === 'playlists' && typeof window.renderPlaylists === 'function') {
            window.renderPlaylists();
          }
        } else if (data.type === 'playlist_updated' || data.type === 'playlist_added') {
          const { playlistId } = data;
          if (typeof window !== 'undefined' && typeof window.syncPlaylistsFromServer === 'function') {
            window.syncPlaylistsFromServer(playlistId);
          }
        }
      } catch (err) {
        console.error('[WS Message Handle Error]:', err);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected, reconnecting in 5s...');
      clearSocketTimers();
      wsReconnectTimeout = setTimeout(() => {
        if (getUser() && getToken()) connectWS();
      }, 5000);
    };

    ws.onerror = (err) => {
      console.error('[WS Error]:', err);
    };
  }

  function broadcastPlayerStatus() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const user = getUser();
    if (!user) return;

    let currentTrack = null;
    let isPlaying = false;

    if (typeof window !== 'undefined') {
      if (window.playlist && Number.isInteger(window.currentTrackIndex) && window.playlist[window.currentTrackIndex]) {
        currentTrack = window.playlist[window.currentTrackIndex];
      }
      const player = window.audioPlayer || (typeof document !== 'undefined' ? document.getElementById('audio-player') : null);
      isPlaying = player ? !player.paused : false;
    }

    sendPresenceUpdate(
      currentTrack ? currentTrack.title : '',
      currentTrack ? currentTrack.artist : '',
      isPlaying
    );
  }

  function sendPresenceUpdate(trackName = '', artist = '', isPlaying = false) {
    if (ws && ws.readyState === WebSocket.OPEN && getUser()) {
      try {
        ws.send(JSON.stringify({
          type: 'update_status',
          trackName: trackName || '',
          artist: artist || '',
          isPlaying: Boolean(isPlaying)
        }));
      } catch (e) {}
    }
  }

  // --- Namespace & Export ---
  window.GP = window.GP || {};
  window.GP.Social = window.GP.Social || {};
  window.GP.Social.Socket = {
    connectWS,
    broadcastPlayerStatus,
    sendPresenceUpdate,
    sendCurrentTrack: broadcastPlayerStatus,
    sendPlaybackState: sendPresenceUpdate,
    clearSocketTimers,
    getSocket: () => ws
  };

  // Direct aliases on GP.Social
  Object.assign(window.GP.Social, window.GP.Social.Socket);

  // Backward compatibility global exports
  window.connectWS = connectWS;
  window.broadcastPlayerStatus = broadcastPlayerStatus;
  window.sendPresenceUpdate = sendPresenceUpdate;

  Object.defineProperty(window, 'ws', {
    get: () => ws,
    set: (val) => { ws = val; },
    configurable: true
  });

  Object.defineProperty(window, 'wsReconnectTimeout', {
    get: () => wsReconnectTimeout,
    set: (val) => { wsReconnectTimeout = val; },
    configurable: true
  });

  // Call connectWS on startup if token is active
  if (typeof window !== 'undefined') {
    if (getToken()) {
      connectWS();
    }
  }

})(typeof window !== 'undefined' ? window : global);
