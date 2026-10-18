/**
 * GlassPlayer - Synced Lyrics & Karaoke Engine
 * Namespace: window.GP.Lyrics
 * Multi-source lyrics fetching (LRCLIB, Genius, SoundCloud), LRC parsing, DOM autoscroll & karaoke sync.
 */

(function (window) {
  'use strict';

  const lyricsState = {
    lrcLines: [],        // Array of { time, text } for LRC mode
    isOpen: false,
    syncTimer: null,
    currentTrackId: null,
    format: null,        // 'lrc' | 'plain' | null
    lastActiveIdx: -1
  };

  const LRCLIB_HEADERS = {
    'User-Agent': 'GlassPlayer/1.17.5 (https://github.com/xivmcm/music-desktop)'
  };

  let isListenersInitialized = false;

  function getElements() {
    if (typeof document === 'undefined') return {};
    return {
      overlay: document.getElementById('lyrics-overlay'),
      ambientBg: document.getElementById('lyrics-ambient-bg'),
      content: document.getElementById('lyrics-content'),
      titleEl: document.getElementById('lyrics-track-title'),
      artistEl: document.getElementById('lyrics-track-artist'),
      coverEl: document.getElementById('lyrics-track-cover'),
      sourceBadge: document.getElementById('lyrics-source-badge'),
      closeBtn: document.getElementById('lyrics-close-btn'),
      lyricsBtn: document.getElementById('lyrics-btn'),
      audioPlayer: (typeof window !== 'undefined' && window.audioPlayer) || document.getElementById('audio-player')
    };
  }

  function getPlayer() {
    return (typeof window !== 'undefined' && window.audioPlayer) ||
      (typeof document !== 'undefined' && document.getElementById('audio-player'));
  }

  function getCurrentTrack() {
    if (typeof window !== 'undefined') {
      if (window.playlist && Number.isInteger(window.currentTrackIndex) && window.playlist[window.currentTrackIndex]) {
        return window.playlist[window.currentTrackIndex];
      }
      if (window.currentTrack) return window.currentTrack;
    }
    return null;
  }

  function getUtils() {
    return (window.GP && window.GP.Utils) || window;
  }

  function _escapeHTML(str) {
    const fn = getUtils().escapeHTML;
    return typeof fn === 'function' ? fn(str) : String(str || '').replace(/[&<>"']/g, '');
  }

  function _parseLRC(lrc) {
    const fn = getUtils().parseLRC;
    return typeof fn === 'function' ? fn(lrc) : [];
  }

  async function _fetchWithTimeout(url, options = {}, timeoutMs = 2500) {
    const fn = (typeof window !== 'undefined' && window.fetchWithTimeout) || (getUtils().fetchWithTimeout);
    if (typeof fn === 'function') {
      return fn(url, options, timeoutMs);
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      return await fetch(url, { ...options, signal: controller?.signal });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  /**
   * Normalizes title and artist strings to maximize hit rate across lyric databases.
   */
  function cleanLyricsQuery(rawTitle, rawArtist) {
    let title = (rawTitle || '').trim();
    let uploader = (rawArtist || '').trim();

    // Normalize unicode dash variants to standard ' - '
    title = title.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, ' - ');

    // Clean junk tags, hashtags, mentions, audio labels
    title = title.replace(/#[a-zA-Z0-9_\u0400-\u04FF-]+/g, '');
    title = title.replace(/@([a-zA-Z0-9_.\u0400-\u04FF-]+)/g, '');
    title = title.replace(/\((?:prod|feat|ft|prod\.|feat\.|ft\.)[^)]*\)/gi, '');
    title = title.replace(/\[(?:prod|feat|ft|prod\.|feat\.|ft\.)[^\]]*\]/gi, '');
    title = title.replace(/\((?:official|audio|video|lyrics|remix|slowed|reverb|sped up|nightcore|hq|hd)[^)]*\)/gi, '');
    title = title.replace(/\[(?:official|audio|video|lyrics|remix|slowed|reverb|sped up|nightcore|hq|hd)[^\]]*\]/gi, '');
    title = title.replace(/\s+/g, ' ').trim();

    let artist = '';
    let songName = title;

    if (title.includes(' - ')) {
      const parts = title.split(' - ').map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        artist = parts[0];
        songName = parts.slice(1).join(' - ');
      }
    }

    if (!artist) {
      artist = uploader;
    }

    return {
      artist,
      songName,
      directQuery: `${artist} ${songName}`.trim(),
      titleOnlyQuery: songName.trim(),
      rawCleanQuery: title.replace(/ - /g, ' ').trim()
    };
  }

  function isConfidentLrclibMatch(candidate, terms) {
    if (!candidate || !terms) return false;
    const cTitle = (candidate.trackName || '').toLowerCase().trim();
    const cArtist = (candidate.artistName || '').toLowerCase().trim();
    const sTitle = (terms.songName || '').toLowerCase().trim();
    const sArtist = (terms.artist || '').toLowerCase().trim();

    if (!cTitle || !cArtist) return false;

    if (sArtist && sArtist.length >= 2) {
      const artistMatches = (cArtist.length >= 2 && sArtist.includes(cArtist)) || cArtist.includes(sArtist);
      if (!artistMatches) {
        const sWords = sArtist.split(/\s+/).filter(w => w.length >= 3);
        const hasSharedWord = sWords.some(w => cArtist.includes(w));
        if (!hasSharedWord) return false;
      }
    }

    if (sTitle && sTitle.length >= 2) {
      const titleMatches = (cTitle.length >= 2 && sTitle.includes(cTitle)) || cTitle.includes(sTitle);
      if (!titleMatches) {
        const sWords = sTitle.split(/\s+/).filter(w => w.length >= 3);
        const hasSharedWord = sWords.some(w => cTitle.includes(w));
        if (!hasSharedWord) return false;
      }
    }

    return true;
  }

  /**
   * Smart Auto-Pacing Algorithm (Вариант 1)
   * Converts unstructured lyrics into timed karaoke lines synchronized with the track duration.
   */
  function generateAutoPacedLyrics(plainText, trackDuration = 180) {
    if (!plainText || typeof plainText !== 'string') return [];
    const duration = Math.max(30, Number(trackDuration) || 180);

    const cleanedText = plainText
      .replace(/^\d+\s+Contributors\s*/i, '')
      .replace(/Translations\s*[^\n]*\n/gi, '')
      .replace(/Embed\s*$/i, '')
      .trim();

    const rawLines = cleanedText.split('\n');
    const parsedLines = [];

    for (let i = 0; i < rawLines.length; i++) {
      const raw = rawLines[i].trim();
      if (!raw) {
        if (parsedLines.length > 0 && !parsedLines[parsedLines.length - 1].isPause) {
          parsedLines.push({ isPause: true, weight: 2.0 });
        }
        continue;
      }

      const isHeader = /^\[.*\]$/.test(raw) || /^(Куплет|Припев|Интро|Аутро|Бридж|Verse|Chorus|Intro|Outro|Bridge)/i.test(raw);
      const charWeight = Math.max(3, Math.min(raw.length, 60));
      const weight = isHeader ? 2 : charWeight;

      parsedLines.push({
        text: raw,
        isSection: isHeader,
        isPause: false,
        weight
      });
    }

    const vocalLines = parsedLines.filter(l => !l.isPause);
    if (vocalLines.length === 0) return [];

    const introTime = Math.min(16, Math.max(4, duration * 0.07));
    const outroTime = Math.min(15, Math.max(3, duration * 0.05));
    const singingTime = Math.max(10, duration - introTime - outroTime);

    const totalWeight = parsedLines.reduce((sum, l) => sum + (l.weight || 1), 0);
    const timePerWeightUnit = singingTime / Math.max(1, totalWeight);

    let currentTime = introTime;
    const lrcLines = [];

    for (let i = 0; i < parsedLines.length; i++) {
      const item = parsedLines[i];
      if (item.isPause) {
        currentTime += item.weight * timePerWeightUnit;
        continue;
      }

      lrcLines.push({
        time: Math.round(currentTime * 100) / 100,
        text: item.text,
        isSection: item.isSection
      });

      currentTime += item.weight * timePerWeightUnit;
    }

    return lrcLines;
  }

  /**
   * Multi-tiered lyrics fetcher: SoundCloud Description -> Native Electron (LRCLIB/Genius) -> Backend Proxy -> LRCLIB (Direct Strict) -> Direct Genius
   */
  async function fetchLyricsMultiSource(track) {
    if (!track) throw new Error('No track provided');
    const cacheKey = `gp_lyrics_${track.id || track.title}`;

    if (typeof localStorage !== 'undefined') {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && (parsed.lyrics || parsed.plainText)) return parsed;
        }
      } catch (e) {}
    }

    // 1. Instant check: SoundCloud track description
    if (track.description && track.description.length > 25) {
      const desc = track.description.trim();
      const lines = desc.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('http') && !l.startsWith('t.me') && !l.startsWith('vk.com') && !l.startsWith('instagram'));
      if (lines.length >= 3) {
        const result = { format: 'plain', plainText: lines.join('\n'), source: 'SoundCloud Description' };
        if (typeof localStorage !== 'undefined') {
          try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch (e) {}
        }
        return result;
      }
    }

    const terms = cleanLyricsQuery(track.title, track.artist);
    console.log(`[Lyrics] Searching lyrics for: "${terms.directQuery}" (Artist: ${terms.artist}, Song: ${terms.songName})`);

    // 2. Desktop native Node IPC fetch (Strict LRCLIB -> Genius scraper)
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.fetchLyrics === 'function') {
      try {
        const nativeResult = await window.electronAPI.fetchLyrics(terms);
        if (nativeResult && (nativeResult.lyrics || nativeResult.plainText)) {
          console.log(`[Lyrics] Loaded lyrics via Electron Native Engine from ${nativeResult.source}`);
          if (typeof localStorage !== 'undefined') {
            try { localStorage.setItem(cacheKey, JSON.stringify(nativeResult)); } catch (e) {}
          }
          return nativeResult;
        }
      } catch (err) {
        console.warn('[Lyrics] Native fetch error:', err.message);
      }
    }

    // 3. Backend Proxy Lyrics Fetch (Strict LRCLIB -> Genius scraper -> Lyrist)
    try {
      const backendUrl = (typeof window !== 'undefined' && (window.API_URL || (typeof window.getBackendUrl === 'function' && window.getBackendUrl()))) || 'https://music-backend-iyni.onrender.com';
      const res = await _fetchWithTimeout(`${backendUrl}/api/lyrics?title=${encodeURIComponent(terms.songName)}&artist=${encodeURIComponent(terms.artist)}&query=${encodeURIComponent(terms.directQuery)}`, {}, 3500);
      if (res && res.ok) {
        const data = await res.json();
        if (data && (data.lyrics || data.plainText)) {
          console.log(`[Lyrics] Loaded lyrics via Backend Proxy from ${data.source}`);
          if (typeof localStorage !== 'undefined') {
            try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch (e) {}
          }
          return data;
        }
      }
    } catch (e) {}

    // 4. Parallel Fast LRCLIB Queries with strict validation (Direct Get + Clean Search)
    const queries = [
      `https://lrclib.net/api/get?${new URLSearchParams({ track_name: terms.songName, artist_name: terms.artist })}`,
      `https://lrclib.net/api/search?q=${encodeURIComponent(terms.directQuery)}`,
      `https://lrclib.net/api/search?q=${encodeURIComponent(terms.rawCleanQuery)}`
    ];

    for (const url of queries) {
      try {
        const res = await _fetchWithTimeout(url, { headers: LRCLIB_HEADERS }, 2200);
        if (res && res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const valid = data.filter(item => isConfidentLrclibMatch(item, terms));
            const best = valid.find(item => item.syncedLyrics) || valid[0];
            if (best) {
              if (best.syncedLyrics) {
                const result = { format: 'lrc', lyrics: best.syncedLyrics, source: 'LRCLIB (Караоке)' };
                console.log(`[Lyrics] Loaded synced lyrics for "${terms.directQuery}" from ${result.source}`);
                if (typeof localStorage !== 'undefined') {
                  try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch (e) {}
                }
                return result;
              } else if (best.plainLyrics) {
                const result = { format: 'plain', plainText: best.plainLyrics, source: 'LRCLIB' };
                console.log(`[Lyrics] Loaded plain lyrics for "${terms.directQuery}" from ${result.source}`);
                if (typeof localStorage !== 'undefined') {
                  try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch (e) {}
                }
                return result;
              }
            }
          } else if (data && !Array.isArray(data)) {
            if (isConfidentLrclibMatch(data, terms)) {
              if (data.syncedLyrics) {
                const result = { format: 'lrc', lyrics: data.syncedLyrics, source: 'LRCLIB (Караоке)' };
                console.log(`[Lyrics] Loaded synced lyrics for "${terms.directQuery}" from ${result.source}`);
                if (typeof localStorage !== 'undefined') {
                  try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch (e) {}
                }
                return result;
              } else if (data.plainLyrics) {
                const result = { format: 'plain', plainText: data.plainLyrics, source: 'LRCLIB' };
                console.log(`[Lyrics] Loaded plain lyrics for "${terms.directQuery}" from ${result.source}`);
                if (typeof localStorage !== 'undefined') {
                  try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch (e) {}
                }
                return result;
              }
            }
          }
        }
      } catch (e) {}
    }

    // 5. Direct Genius fallback if available
    try {
      const geniusUrl = `https://genius.com/api/search/multi?q=${encodeURIComponent(terms.directQuery)}`;
      const gRes = await _fetchWithTimeout(geniusUrl, { headers: { 'Accept': 'application/json' } }, 3000);
      if (gRes && gRes.ok) {
        const gData = await gRes.json();
        const songHits = gData?.response?.sections?.find(s => s.type === 'song')?.hits || [];
        if (songHits.length > 0) {
          const hit = songHits[0].result;
          if (hit && hit.url) {
            const pageRes = await _fetchWithTimeout(hit.url, {}, 3500);
            if (pageRes && pageRes.ok) {
              const html = await pageRes.text();
              const containerRegex = /<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi;
              const matches = [];
              let m;
              while ((m = containerRegex.exec(html)) !== null) {
                matches.push(m[1]);
              }
              if (matches.length > 0) {
                const raw = matches.join('\n')
                  .replace(/<br\s*[\/]?>/gi, '\n')
                  .replace(/<\/p>/gi, '\n\n')
                  .replace(/<[^>]+>/g, '')
                  .replace(/&#x27;/g, "'")
                  .replace(/&amp;/g, '&')
                  .replace(/&quot;/g, '"')
                  .replace(/\u00a0/g, ' ')
                  .replace(/^\d+\s+Contributors\s*/i, '')
                  .replace(/Translations\s*[^\n]*\n/gi, '')
                  .replace(/Embed\s*$/i, '')
                  .trim();
                if (raw.length > 20) {
                  const result = { format: 'plain', plainText: raw, source: 'Genius' };
                  if (typeof localStorage !== 'undefined') {
                    try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch (e) {}
                  }
                  return result;
                }
              }
            }
          }
        }
      }
    } catch (gErr) {}

    console.warn(`[Lyrics] No lyrics found across queries for "${terms.directQuery}"`);
    throw new Error('Текст песни не найден');
  }

  /**
   * Renders LRC lyric lines as individual DOM elements.
   */
  function renderLRCLines(lines) {
    const { content } = getElements();
    if (!content) return;
    content.innerHTML = '';

    (lines || []).forEach((line, i) => {
      const el = document.createElement('div');
      el.className = 'lyrics-line upcoming' + (line.isSection ? ' lyrics-section-header' : '');
      el.dataset.index = i;
      el.dataset.time = line.time;
      el.textContent = line.text;

      // Click a line to seek audio
      el.addEventListener('click', () => {
        const player = getPlayer();
        if (player && Number.isFinite(line.time)) {
          player.currentTime = line.time;
        }
      });

      content.appendChild(el);
    });
  }

  /**
   * Updates which lyric line is active based on current audio time.
   * Optimizes switching: only alters classes and scrolls DOM when line index actually changes.
   */
  function syncLyricsToTime(currentTime) {
    if (!lyricsState.lrcLines || !lyricsState.lrcLines.length) return;

    let activeIdx = -1;
    const lines = lyricsState.lrcLines;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= currentTime) {
        activeIdx = i;
      } else {
        break;
      }
    }

    // Zero-overhead guard: skip DOM mutations if index hasn't changed
    if (activeIdx === lyricsState.lastActiveIdx) {
      return;
    }

    const prevIdx = lyricsState.lastActiveIdx;
    lyricsState.lastActiveIdx = activeIdx;

    const { content } = getElements();
    if (!content) return;
    const linEls = content.children;
    if (!linEls || !linEls.length) return;

    // Update previous active line
    if (prevIdx >= 0 && prevIdx < linEls.length) {
      const prevEl = linEls[prevIdx];
      prevEl.classList.remove('active');
      if (prevIdx < activeIdx) {
        prevEl.classList.add('past');
        prevEl.classList.remove('upcoming');
      } else {
        prevEl.classList.add('upcoming');
        prevEl.classList.remove('past');
      }
    }

    // Update new active line
    if (activeIdx >= 0 && activeIdx < linEls.length) {
      const activeEl = linEls[activeIdx];
      activeEl.classList.remove('past', 'upcoming');
      activeEl.classList.add('active');

      // Smooth-scroll container without layout reflow spikes
      const containerHeight = content.clientHeight;
      const targetScrollTop = activeEl.offsetTop - (containerHeight / 2) + (activeEl.clientHeight / 2);
      content.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      });
    }
  }

  /**
   * Opens the lyrics overlay for the currently playing track.
   */
  async function openLyricsOverlay() {
    const currentTrack = getCurrentTrack();
    const toast = typeof window !== 'undefined' && window.showToastNotification;

    if (!currentTrack) {
      if (typeof toast === 'function') toast('Сейчас ничего не играет');
      return;
    }

    const { overlay, ambientBg, content, titleEl, artistEl, coverEl, sourceBadge, lyricsBtn } = getElements();
    const player = getPlayer();

    // Update header and ambient background
    const getCoverFn = (typeof window !== 'undefined' && window.getOptimalCoverUrl) || ((t) => t || '');
    const getFallbackCoverFn = (typeof window !== 'undefined' && window.getFallbackCoverUrl) || (() => '');

    const coverUrl = getCoverFn(currentTrack.thumbnail, currentTrack.source);
    const fallbackCoverUrl = getFallbackCoverFn(currentTrack.thumbnail);

    if (coverEl) {
      coverEl.crossOrigin = 'anonymous';
      coverEl.onerror = () => { coverEl.onerror = null; coverEl.src = fallbackCoverUrl; };
      coverEl.src = coverUrl;
    }
    if (ambientBg) {
      ambientBg.style.backgroundImage = `url("${coverUrl}")`;
    }
    if (titleEl)  titleEl.textContent  = currentTrack.title  || 'Без названия';
    if (artistEl) artistEl.textContent = currentTrack.artist || 'Неизвестный исполнитель';
    if (sourceBadge) {
      sourceBadge.classList.add('hidden');
      sourceBadge.textContent = '';
    }

    // Show overlay immediately with loading state
    if (overlay) {
      overlay.classList.remove('hidden');
      requestAnimationFrame(() => overlay.classList.add('visible'));
    }
    lyricsState.isOpen = true;
    if (lyricsBtn) lyricsBtn.classList.add('active');

    if (content) {
      content.innerHTML = `
        <div class="lyrics-loading">
          <div class="spinner"></div>
          <span>Ищем текст песни (LRCLIB, Genius, SoundCloud)...</span>
        </div>
      `;
    }

    // Stop previous sync timer
    if (lyricsState.syncTimer && player) {
      player.removeEventListener('timeupdate', lyricsState.syncTimer);
      lyricsState.syncTimer = null;
    }
    lyricsState.lrcLines = [];
    lyricsState.format = null;
    lyricsState.currentTrackId = currentTrack.id;
    lyricsState.lastActiveIdx = -1;

    try {
      const data = await fetchLyricsMultiSource(currentTrack);

      if (lyricsState.currentTrackId !== currentTrack.id) return;

      if (sourceBadge && data.source) {
        sourceBadge.textContent = `✨ ${data.source}`;
        sourceBadge.classList.remove('hidden');
      }

      if (data.format === 'lrc' && data.lyrics) {
        lyricsState.lrcLines = _parseLRC(data.lyrics);
        lyricsState.format = 'lrc';
        renderLRCLines(lyricsState.lrcLines);

        const syncHandler = () => {
          const currentPlayer = getPlayer();
          if (currentPlayer) syncLyricsToTime(currentPlayer.currentTime);
        };
        lyricsState.syncTimer = syncHandler;
        if (player) player.addEventListener('timeupdate', syncHandler);
        syncHandler();
      } else if (data.plainText) {
        // Smart Auto-Pacing (Вариант 1)
        const trackDuration = (player && Number.isFinite(player.duration) && player.duration > 10)
          ? player.duration
          : (currentTrack.duration || 180);

        const pacedLines = generateAutoPacedLyrics(data.plainText, trackDuration);
        if (pacedLines && pacedLines.length > 0) {
          lyricsState.lrcLines = pacedLines;
          lyricsState.format = 'lrc';
          renderLRCLines(lyricsState.lrcLines);

          const syncHandler = () => {
            const currentPlayer = getPlayer();
            if (currentPlayer) syncLyricsToTime(currentPlayer.currentTime);
          };
          lyricsState.syncTimer = syncHandler;
          if (player) player.addEventListener('timeupdate', syncHandler);
          syncHandler();

          if (sourceBadge && data.source) {
            sourceBadge.textContent = `✨ ${data.source} (Синхро-ритм)`;
            sourceBadge.classList.remove('hidden');
          }
        } else {
          lyricsState.format = 'plain';
          if (content) {
            content.innerHTML = `<div class="lyrics-plain">${_escapeHTML(data.plainText)}</div>`;
          }
        }
      } else {
        throw new Error('No lyrics data');
      }
    } catch (err) {
      if (lyricsState.currentTrackId !== currentTrack.id) return;
      if (content) {
        content.innerHTML = `
          <div class="lyrics-not-found">
            <div style="font-size: 44px; margin-bottom: 16px;">🎤</div>
            <div style="font-weight: 600; font-size: 17px; color: #fff; margin-bottom: 8px;">Текст песни не найден</div>
            <div style="font-size: 13px; opacity: 0.65; max-width: 360px; margin: 0 auto;">${_escapeHTML(currentTrack.title)} · ${_escapeHTML(currentTrack.artist || '')}</div>
          </div>
        `;
      }
      console.warn('[Lyrics] Not found:', err.message);
    }
  }

  /**
   * Closes the lyrics overlay and cleans up sync handlers.
   */
  function closeLyricsOverlay() {
    const { overlay, lyricsBtn } = getElements();
    const player = getPlayer();

    if (overlay) {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.classList.add('hidden'), 350);
    }
    lyricsState.isOpen = false;
    if (lyricsBtn) lyricsBtn.classList.remove('active');
    if (lyricsState.syncTimer && player) {
      player.removeEventListener('timeupdate', lyricsState.syncTimer);
      lyricsState.syncTimer = null;
    }
    lyricsState.lastActiveIdx = -1;
  }

  function initLyricsListeners() {
    if (isListenersInitialized || typeof document === 'undefined') return;

    const { lyricsBtn, closeBtn } = getElements();
    const player = getPlayer();

    if (lyricsBtn) {
      lyricsBtn.addEventListener('click', () => {
        if (lyricsState.isOpen) {
          closeLyricsOverlay();
        } else {
          openLyricsOverlay();
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', closeLyricsOverlay);
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lyricsState.isOpen) {
        closeLyricsOverlay();
      }
    });

    if (player) {
      player.addEventListener('playing', () => {
        if (lyricsState.isOpen) {
          const track = getCurrentTrack();
          if (track && lyricsState.currentTrackId !== track.id) {
            openLyricsOverlay();
          }
        }
      });
    }

    isListenersInitialized = true;
  }

  // Auto-init listeners
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initLyricsListeners);
    } else {
      initLyricsListeners();
    }
  }

  // --- Namespace & Export ---
  window.GP = window.GP || {};
  window.GP.Lyrics = {
    cleanLyricsQuery,
    isConfidentLrclibMatch,
    generateAutoPacedLyrics,
    fetchLyricsMultiSource,
    loadLyrics: fetchLyricsMultiSource,
    renderLRCLines,
    renderLyrics: renderLRCLines,
    syncLyricsToTime,
    syncLyricsWithTime: syncLyricsToTime,
    openLyricsOverlay,
    closeLyricsOverlay,
    initLyricsListeners,
    getState: () => lyricsState
  };

  // Backward compatibility global exports
  window.lyricsState = lyricsState;
  window.cleanLyricsQuery = cleanLyricsQuery;
  window.isConfidentLrclibMatch = isConfidentLrclibMatch;
  window.generateAutoPacedLyrics = generateAutoPacedLyrics;
  window.fetchLyricsMultiSource = fetchLyricsMultiSource;
  window.loadLyrics = fetchLyricsMultiSource;
  window.renderLRCLines = renderLRCLines;
  window.renderLyrics = renderLRCLines;
  window.syncLyricsToTime = syncLyricsToTime;
  window.syncLyricsWithTime = syncLyricsToTime;
  window.openLyricsOverlay = openLyricsOverlay;
  window.closeLyricsOverlay = closeLyricsOverlay;
  window.initLyricsListeners = initLyricsListeners;

  Object.defineProperty(window, 'currentLyrics', {
    get: () => lyricsState.lrcLines,
    configurable: true
  });

  Object.defineProperty(window, 'currentLyricIndex', {
    get: () => lyricsState.lastActiveIdx,
    configurable: true
  });

  Object.defineProperty(window, 'isLyricsModalOpen', {
    get: () => lyricsState.isOpen,
    configurable: true
  });

  Object.defineProperty(window, 'isSyncedLyrics', {
    get: () => lyricsState.format === 'lrc',
    configurable: true
  });

})(typeof window !== 'undefined' ? window : global);
