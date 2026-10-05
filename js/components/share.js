/**
 * GlassPlayer Track Sharing Component Module
 * Handles generating, copying and opening track share links (glassplayer:// and web URLs),
 * clipboard interaction, and player/context menu share buttons.
 */
(function (root) {
  'use strict';

  // Ensure window.GP.Components namespace
  const GP = root.GP = root.GP || {};
  GP.Components = GP.Components || {};
  GP.Components.Share = GP.Components.Share || {};

  const DEFAULT_SHARE_BASE = (root.DEFAULT_MIRRORS && root.DEFAULT_MIRRORS[0])
    ? `${root.DEFAULT_MIRRORS[0]}/share/track`
    : 'https://music-backend-iyni.onrender.com/share/track';

  const SHARE_ALLOWED_SOURCES = new Set(['soundcloud', 'spotify']);
  const SHARE_MAX_TEXT_LENGTH = 200;
  const SHARE_LINK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

  let shareLinksAppReady = false;
  const pendingIncomingShareLinks = [];

  // --- Sanitization & Parsing Helpers ---

  function cleanId(id) {
    if (root.GP?.Utils?.shareCleanId) return root.GP.Utils.shareCleanId(id);
    if (typeof root.shareCleanId === 'function') return root.shareCleanId(id);
    return id ? String(id).replace(/[^a-zA-Z0-9_\-]/g, '') : '';
  }

  function cleanText(text) {
    if (root.GP?.Utils?.shareCleanText) return root.GP.Utils.shareCleanText(text);
    if (typeof root.shareCleanText === 'function') return root.shareCleanText(text);
    return text ? String(text).slice(0, SHARE_MAX_TEXT_LENGTH).trim() : '';
  }

  function cleanImage(img) {
    if (root.GP?.Utils?.shareCleanImage) return root.GP.Utils.shareCleanImage(img);
    if (typeof root.shareCleanImage === 'function') return root.shareCleanImage(img);
    return img ? String(img).trim() : '';
  }

  function cleanDuration(dur) {
    if (root.GP?.Utils?.shareCleanDuration) return root.GP.Utils.shareCleanDuration(dur);
    if (typeof root.shareCleanDuration === 'function') return root.shareCleanDuration(dur);
    return dur ? String(dur).trim() : '';
  }

  function parseShareLink(rawLink) {
    if (root.GP?.Utils?.parseIncomingShareLink) return root.GP.Utils.parseIncomingShareLink(rawLink);
    if (typeof root.parseIncomingShareLink === 'function') return root.parseIncomingShareLink(rawLink);
    if (!rawLink || typeof rawLink !== 'string') return null;
    try {
      const url = new URL(rawLink);
      const params = url.searchParams;
      const id = cleanId(params.get('id'));
      const source = params.get('src');
      if (!id || !SHARE_ALLOWED_SOURCES.has(source)) return null;
      return {
        id,
        source,
        title: cleanText(params.get('t')) || 'Unknown Track',
        artist: cleanText(params.get('a')) || 'Unknown Artist',
        thumbnail: cleanImage(params.get('img')),
        duration: cleanDuration(params.get('d')) || '0:00',
        artistId: params.get('aid') || null
      };
    } catch {
      return null;
    }
  }

  function notify(msg, type = 'info', title = 'Поделиться') {
    if (typeof root.showToastNotification === 'function') {
      root.showToastNotification(msg, type, title);
    } else if (root.GP?.Components?.Notifications?.showToastNotification) {
      root.GP.Components.Notifications.showToastNotification(msg, type, title);
    }
  }

  // --- Core Share Functions ---

  function isTrackShareable(track) {
    return Boolean(track && !track.blobUrl && SHARE_ALLOWED_SOURCES.has(track.source) && cleanId(track.id));
  }

  function buildTrackShareUrl(track) {
    if (!isTrackShareable(track)) return null;
    const base = (root.DEFAULT_MIRRORS && root.DEFAULT_MIRRORS[0])
      ? `${root.DEFAULT_MIRRORS[0]}/share/track`
      : DEFAULT_SHARE_BASE;

    const params = new URLSearchParams();
    params.set('src', track.source);
    params.set('id', cleanId(track.id));
    params.set('t', cleanText(track.title) || 'Unknown Track');
    const artist = cleanText(track.artist);
    if (artist) params.set('a', artist);
    const image = cleanImage(track.thumbnail);
    if (image) params.set('img', image);
    const duration = cleanDuration(track.duration);
    if (duration) params.set('d', duration);
    const artistId = String(track.artistId || '');
    if (/^\d{1,20}$/.test(artistId)) params.set('aid', artistId);
    return `${base}?${params.toString()}`;
  }

  async function writeTextToClipboard(text) {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) {
      console.warn('[Share Links] Clipboard API failed, using fallback:', err.message);
    }
    try {
      if (typeof document === 'undefined') return false;
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }

  async function copyTrackShareLink(track) {
    const activeTrack = track || root.activePlayingTrack;
    if (!activeTrack) {
      notify('Сначала включите трек', 'info');
      return;
    }
    if (activeTrack.source === 'local' || activeTrack.blobUrl) {
      notify('Локальные треки с устройства нельзя отправить ссылкой', 'warning');
      return;
    }
    const url = buildTrackShareUrl(activeTrack);
    if (!url) {
      notify('Для этого трека ссылка недоступна', 'warning');
      return;
    }
    const copied = await writeTextToClipboard(url);
    if (copied) {
      notify(`Ссылка на «${cleanText(activeTrack.title)}» скопирована — отправьте её другу`, 'success');
    } else {
      notify('Не удалось скопировать ссылку в буфер обмена', 'error');
    }
  }

  function playSharedTrack(track) {
    if (!track) return;
    const currentPlaylist = Array.isArray(root.playlist) ? root.playlist : [];
    let index = currentPlaylist.findIndex(t => t && t.id === track.id);
    if (index === -1) {
      root.playlist = currentPlaylist.concat([track]);
      index = root.playlist.length - 1;
    }

    if (typeof root.playTrack === 'function') {
      root.playTrack(index);
    } else if (root.GP?.Player?.playTrack) {
      root.GP.Player.playTrack(index);
    }

    notify(`${track.artist} — ${track.title}`, 'info', 'Трек по ссылке');
  }

  function handleIncomingShareLink(rawLink) {
    const track = parseShareLink(rawLink);
    if (!track) {
      notify('Ссылка на трек повреждена или устарела', 'warning');
      return;
    }
    if (!shareLinksAppReady) {
      pendingIncomingShareLinks.length = 0;
      pendingIncomingShareLinks.push(track);
      return;
    }
    playSharedTrack(track);
  }

  function flushPendingShareLinks() {
    if (shareLinksAppReady) return;
    shareLinksAppReady = true;
    const track = pendingIncomingShareLinks.pop();
    pendingIncomingShareLinks.length = 0;
    if (track) playSharedTrack(track);

    const isElectron = Boolean(root.isElectron || (typeof window !== 'undefined' && window.electronAPI));
    if (isElectron && root.electronAPI?.consumePendingShareLink) {
      root.electronAPI.consumePendingShareLink()
        .then(link => { if (link) handleIncomingShareLink(link); })
        .catch(err => console.warn('[Share Links] Failed to read launch link:', err.message));
    }
  }

  function appendShareItemToTrackMenu(track) {
    const playlistMenuList = document.getElementById('playlist-menu-list');
    const playlistMenu = document.getElementById('playlist-menu');
    if (!playlistMenuList || !isTrackShareable(track)) return;

    const shareItem = document.createElement('button');
    shareItem.type = 'button';
    shareItem.className = 'playlist-menu-item share-link-menu-item';
    shareItem.innerHTML = `<span class="share-link-menu-label">${SHARE_LINK_ICON}Скопировать ссылку</span>`;
    shareItem.addEventListener('click', () => {
      if (playlistMenu) playlistMenu.classList.add('hidden');
      copyTrackShareLink(track);
    });
    playlistMenuList.appendChild(shareItem);
  }

  function initPlayerShareButton() {
    if (typeof document === 'undefined') return;
    const likeBtn = document.getElementById('player-like-btn');
    if (!likeBtn || document.getElementById('player-share-btn')) return;

    const shareBtn = document.createElement('button');
    shareBtn.id = 'player-share-btn';
    shareBtn.type = 'button';
    shareBtn.className = 'player-share-btn';
    shareBtn.title = 'Скопировать ссылку на трек';
    shareBtn.setAttribute('aria-label', 'Скопировать ссылку на трек');
    shareBtn.innerHTML = SHARE_LINK_ICON;
    shareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyTrackShareLink(root.activePlayingTrack);
    });
    likeBtn.insertAdjacentElement('afterend', shareBtn);
  }

  // Auto-initialize player share button & electron deep link listener
  if (typeof window !== 'undefined') {
    try {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPlayerShareButton);
      } else {
        initPlayerShareButton();
      }

      if (window.electronAPI?.onOpenShareLink) {
        window.electronAPI.onOpenShareLink(handleIncomingShareLink);
      }

      window.addEventListener('gp:app-ready', flushPendingShareLinks, { once: true });
      setTimeout(flushPendingShareLinks, 15000);
    } catch (err) {
      console.error('[Share Links] Init failed:', err);
    }
  }

  // --- Registration & Dual Exports ---

  GP.Components.Share = {
    isTrackShareable,
    buildTrackShareUrl,
    copyTrackShareLink,
    playSharedTrack,
    handleIncomingShareLink,
    flushPendingShareLinks,
    appendShareItemToTrackMenu,
    initPlayerShareButton
  };

  root.isTrackShareable = isTrackShareable;
  root.buildTrackShareUrl = buildTrackShareUrl;
  root.copyTrackShareLink = copyTrackShareLink;
  root.playSharedTrack = playSharedTrack;
  root.handleIncomingShareLink = handleIncomingShareLink;
  root.flushPendingShareLinks = flushPendingShareLinks;
  root.appendShareItemToTrackMenu = appendShareItemToTrackMenu;
  root.initPlayerShareButton = initPlayerShareButton;

})(typeof window !== 'undefined' ? window : global);
