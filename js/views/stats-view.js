/**
 * GlassPlayer - Listening Analytics & Stats View Module (v1.20.5)
 * Namespace: window.GP.Views.Stats
 * Full-screen, theme-adaptive dashboard for listening statistics and habits.
 */

(function (window) {
  'use strict';

  window.GP = window.GP || {};
  window.GP.Views = window.GP.Views || {};

  let currentPeriod = 'all'; // 'all' | '30d' | '7d'

  // Minimal SVG Icons (Theme-Adaptive & Clean)
  const ICONS = {
    clock: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    music: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
    artists: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    compass: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`,
    play: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>`
  };

  /**
   * Helper: formats total seconds into human-readable russian string
   */
  function formatDuration(totalSeconds) {
    const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    if (sec === 0) return '0 сек';
    if (sec < 60) return `${sec} сек`;
    
    const minutes = Math.floor(sec / 60);
    const remSec = sec % 60;
    if (minutes < 60) {
      return remSec > 0 ? `${minutes} мин ${remSec} сек` : `${minutes} мин`;
    }

    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    if (hours < 24) {
      return remMinutes > 0 ? `${hours} ч ${remMinutes} мин` : `${hours} ч`;
    }

    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `${days} д ${remHours} ч` : `${days} д`;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getListeningStats() {
    if (window.GP?.Player?.getListeningStats) {
      return window.GP.Player.getListeningStats();
    }
    const getKey = (typeof window !== 'undefined' && window.getStorageKey) || ((k) => `gp_${k}`);
    try {
      const raw = localStorage.getItem(getKey('listening_stats_v2'));
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      totalSeconds: parseFloat(localStorage.getItem('gp_stats_total_seconds')) || 0,
      totalPlays: 0,
      tracks: {},
      artists: {},
      hourlyDistribution: new Array(24).fill(0),
      history: []
    };
  }

  /**
   * Filters and aggregates stats based on active period tab
   */
  function aggregateStatsForPeriod(stats, period) {
    if (period === 'all') {
      const tracksArr = Object.values(stats.tracks || {}).sort((a, b) => (b.count || 0) - (a.count || 0));
      const artistsArr = Object.values(stats.artists || {}).sort((a, b) => (b.count || 0) - (a.count || 0));
      
      // Calculate peak time slot (Night 0-6, Morning 6-12, Day 12-18, Evening 18-24)
      const hourly = Array.isArray(stats.hourlyDistribution) && stats.hourlyDistribution.length === 24
        ? stats.hourlyDistribution
        : new Array(24).fill(0);

      const slots = [
        { name: 'Ночь (00:00 — 06:00)', shortName: 'Ночь', sec: hourly.slice(0, 6).reduce((a, b) => a + b, 0) },
        { name: 'Утро (06:00 — 12:00)', shortName: 'Утро', sec: hourly.slice(6, 12).reduce((a, b) => a + b, 0) },
        { name: 'День (12:00 — 18:00)', shortName: 'День', sec: hourly.slice(12, 18).reduce((a, b) => a + b, 0) },
        { name: 'Вечер (18:00 — 00:00)', shortName: 'Вечер', sec: hourly.slice(18, 24).reduce((a, b) => a + b, 0) }
      ];

      const sortedSlots = [...slots].sort((a, b) => b.sec - a.sec);
      const totalSlotSec = slots.reduce((acc, s) => acc + s.sec, 0) || 1;

      return {
        totalSeconds: stats.totalSeconds || 0,
        totalPlays: stats.totalPlays || 0,
        uniqueArtists: Object.keys(stats.artists || {}).length,
        peakSlot: sortedSlots[0].sec > 0 ? sortedSlots[0].name : 'День (12:00 — 18:00)',
        topTracks: tracksArr.slice(0, 5),
        topArtists: artistsArr.slice(0, 5),
        heroTrack: tracksArr[0] || null,
        slots: slots.map(s => ({
          ...s,
          pct: Math.min(100, Math.round((s.sec / totalSlotSec) * 100)),
          formattedHours: (s.sec / 3600).toFixed(1)
        }))
      };
    }

    // For 30d or 7d: calculate from history log
    const now = Date.now();
    const durationLimitMs = period === '7d' ? 7 * 86400 * 1000 : 30 * 86400 * 1000;
    const cutoff = now - durationLimitMs;
    const history = (stats.history || []).filter(h => h.timestamp && h.timestamp >= cutoff);

    const periodTracks = {};
    const periodArtists = {};
    let periodPlays = 0;
    let periodSeconds = 0;
    const hourly = new Array(24).fill(0);

    history.forEach(item => {
      periodPlays += 1;

      // Extract precise listening seconds from history or track record
      const trackRecord = stats.tracks && stats.tracks[item.id];
      const avgTrackSeconds = (trackRecord && trackRecord.count > 0 && trackRecord.seconds > 0)
        ? Math.round(trackRecord.seconds / trackRecord.count)
        : 0;

      const sec = (item.playedSeconds && item.playedSeconds > 0)
        ? Math.round(item.playedSeconds)
        : (avgTrackSeconds > 0)
          ? avgTrackSeconds
          : (item.duration && item.duration > 0)
            ? Math.round(item.duration)
            : (trackRecord && trackRecord.seconds > 0)
              ? Math.round(trackRecord.seconds)
              : 0;

      periodSeconds += sec;

      const date = new Date(item.timestamp);
      const h = date.getHours();
      hourly[h] = (hourly[h] || 0) + sec;

      // Track
      if (!periodTracks[item.id]) {
        periodTracks[item.id] = {
          id: item.id,
          title: item.title,
          artist: item.artist,
          thumbnail: item.thumbnail,
          count: 0,
          seconds: 0
        };
      }
      periodTracks[item.id].count += 1;
      periodTracks[item.id].seconds += sec;

      // Artist
      const aName = (item.artist || 'Unknown Artist').trim();
      if (aName) {
        if (!periodArtists[aName]) {
          periodArtists[aName] = {
            name: aName,
            count: 0,
            seconds: 0,
            avatar: item.thumbnail || ''
          };
        }
        periodArtists[aName].count += 1;
        periodArtists[aName].seconds += sec;
      }
    });

    const tracksArr = Object.values(periodTracks).sort((a, b) => b.count - a.count);
    const artistsArr = Object.values(periodArtists).sort((a, b) => b.count - a.count);

    const slots = [
      { name: 'Ночь (00:00 — 06:00)', shortName: 'Ночь', sec: hourly.slice(0, 6).reduce((a, b) => a + b, 0) },
      { name: 'Утро (06:00 — 12:00)', shortName: 'Утро', sec: hourly.slice(6, 12).reduce((a, b) => a + b, 0) },
      { name: 'День (12:00 — 18:00)', shortName: 'День', sec: hourly.slice(12, 18).reduce((a, b) => a + b, 0) },
      { name: 'Вечер (18:00 — 00:00)', shortName: 'Вечер', sec: hourly.slice(18, 24).reduce((a, b) => a + b, 0) }
    ];

    const sortedSlots = [...slots].sort((a, b) => b.sec - a.sec);
    const totalSlotSec = slots.reduce((acc, s) => acc + s.sec, 0) || 1;

    return {
      totalSeconds: periodSeconds,
      totalPlays: periodPlays,
      uniqueArtists: Object.keys(periodArtists).length,
      peakSlot: sortedSlots[0].sec > 0 ? sortedSlots[0].name : 'День (12:00 — 18:00)',
      topTracks: tracksArr.slice(0, 5),
      topArtists: artistsArr.slice(0, 5),
      heroTrack: tracksArr[0] || null,
      slots: slots.map(s => ({
        ...s,
        pct: periodPlays > 0 ? Math.min(100, Math.round((s.sec / totalSlotSec) * 100)) : 0,
        formattedHours: (s.sec / 3600).toFixed(1)
      }))
    };
  }

  /**
   * Main Render Method for Stats Dashboard
   */
  function renderStatsView(container) {
    if (!container) return;
    container.innerHTML = '';

    const stats = getListeningStats();
    const data = aggregateStatsForPeriod(stats, currentPeriod);

    const dashboard = document.createElement('div');
    dashboard.className = 'stats-dashboard';

    // 1. Header Bar with Period Tabs
    const headerBar = document.createElement('div');
    headerBar.className = 'stats-header-bar';
    headerBar.innerHTML = `
      <div class="stats-header-info">
        <h1 class="stats-title">Статистика</h1>
        <p class="stats-subtitle">Аналитика прослушивания и музыкальные привычки</p>
      </div>
      <div class="stats-period-tabs">
        <button class="stats-period-btn ${currentPeriod === 'all' ? 'active' : ''}" data-period="all">Всё время</button>
        <button class="stats-period-btn ${currentPeriod === '30d' ? 'active' : ''}" data-period="30d">За 30 дней</button>
        <button class="stats-period-btn ${currentPeriod === '7d' ? 'active' : ''}" data-period="7d">За 7 дней</button>
      </div>
    `;

    headerBar.querySelectorAll('.stats-period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.period;
        if (p && p !== currentPeriod) {
          currentPeriod = p;
          renderStatsView(container);
        }
      });
    });
    dashboard.appendChild(headerBar);

    // 2. Metrics Grid (4 Cards)
    const metricsGrid = document.createElement('div');
    metricsGrid.className = 'stats-metrics-grid';
    metricsGrid.innerHTML = `
      <div class="stats-metric-card">
        <div class="stats-metric-icon-wrap">${ICONS.clock}</div>
        <div class="stats-metric-body">
          <div class="stats-metric-value">${formatDuration(data.totalSeconds)}</div>
          <div class="stats-metric-label">Время в музыке</div>
        </div>
      </div>
      <div class="stats-metric-card">
        <div class="stats-metric-icon-wrap">${ICONS.music}</div>
        <div class="stats-metric-body">
          <div class="stats-metric-value">${data.totalPlays}</div>
          <div class="stats-metric-label">Сыграно треков</div>
        </div>
      </div>
      <div class="stats-metric-card">
        <div class="stats-metric-icon-wrap">${ICONS.artists}</div>
        <div class="stats-metric-body">
          <div class="stats-metric-value">${data.uniqueArtists}</div>
          <div class="stats-metric-label">Уникальных артистов</div>
        </div>
      </div>
      <div class="stats-metric-card">
        <div class="stats-metric-icon-wrap">${ICONS.compass}</div>
        <div class="stats-metric-body">
          <div class="stats-metric-value" title="${escapeHTML(data.peakSlot)}">${escapeHTML(data.peakSlot)}</div>
          <div class="stats-metric-label">Пик активности</div>
        </div>
      </div>
    `;
    dashboard.appendChild(metricsGrid);

    // 3. Hero Spotlight Card (#1 Track)
    if (data.heroTrack) {
      const hero = document.createElement('div');
      hero.className = 'stats-hero-card';
      const coverUrl = data.heroTrack.thumbnail || 'assets/default-track.png';
      hero.innerHTML = `
        <div class="stats-hero-glow"></div>
        <div class="stats-hero-main">
          <img src="${coverUrl}" class="stats-hero-cover" alt="Cover" onerror="this.src='assets/default-track.png'">
          <div class="stats-hero-details">
            <span class="stats-hero-badge">Главный трек #1</span>
            <span class="stats-hero-title">${escapeHTML(data.heroTrack.title)}</span>
            <span class="stats-hero-artist">${escapeHTML(data.heroTrack.artist)}</span>
            <span class="stats-hero-stats">${data.heroTrack.count} воспр. • ${formatDuration(data.heroTrack.seconds || 0)} звучания</span>
          </div>
        </div>
        <div class="stats-hero-actions">
          <button class="stats-hero-play-btn" title="Слушать сейчас" id="stats-hero-play-trigger">
            ${ICONS.play}
          </button>
        </div>
      `;

      hero.querySelector('#stats-hero-play-trigger')?.addEventListener('click', (e) => {
        e.stopPropagation();
        playTrackFromStats(data.heroTrack);
      });
      hero.addEventListener('click', () => {
        playTrackFromStats(data.heroTrack);
      });

      dashboard.appendChild(hero);
    }

    // 4. Columns Grid: Top-5 Tracks & Top-5 Artists
    const columnsGrid = document.createElement('div');
    columnsGrid.className = 'stats-columns-grid';

    // Left Column: Top-5 Tracks
    const tracksCard = document.createElement('div');
    tracksCard.className = 'stats-section-card';
    tracksCard.innerHTML = `
      <div class="stats-section-header-row">
        <h3 class="stats-section-title">Топ-5 треков</h3>
        <span class="stats-section-tag">${currentPeriod === 'all' ? 'За всё время' : currentPeriod === '30d' ? 'За 30 дней' : 'За 7 дней'}</span>
      </div>
      <div class="stats-list" id="stats-top-tracks-list">
        ${data.topTracks.length > 0 ? data.topTracks.map((t, idx) => `
          <div class="stats-list-item" data-index="${idx}">
            <span class="stats-rank-num">${idx + 1}</span>
            <img src="${t.thumbnail || 'assets/default-track.png'}" class="stats-thumb-img" alt="Cover" onerror="this.src='assets/default-track.png'">
            <div class="stats-item-info">
              <span class="stats-item-title">${escapeHTML(t.title)}</span>
              <span class="stats-item-artist">${escapeHTML(t.artist)}</span>
            </div>
            <span class="stats-item-count">${t.count} воспр.${t.seconds > 0 ? ` • ${formatDuration(t.seconds)}` : ''}</span>
          </div>
        `).join('') : `
          <div class="stats-empty-box">
            <p>Нет данных о треках за выбранный период</p>
          </div>
        `}
      </div>
    `;

    tracksCard.querySelectorAll('.stats-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.index, 10);
        if (data.topTracks[idx]) {
          playTrackFromStats(data.topTracks[idx]);
        }
      });
    });
    columnsGrid.appendChild(tracksCard);

    // Right Column: Top-5 Artists
    const artistsCard = document.createElement('div');
    artistsCard.className = 'stats-section-card';
    artistsCard.innerHTML = `
      <div class="stats-section-header-row">
        <h3 class="stats-section-title">Топ-5 исполнителей</h3>
        <span class="stats-section-tag">${currentPeriod === 'all' ? 'За всё время' : currentPeriod === '30d' ? 'За 30 дней' : 'За 7 дней'}</span>
      </div>
      <div class="stats-list" id="stats-top-artists-list">
        ${data.topArtists.length > 0 ? data.topArtists.map((a, idx) => `
          <div class="stats-list-item" data-artist="${escapeHTML(a.name)}">
            <span class="stats-rank-num">${idx + 1}</span>
            <img src="${a.avatar || 'assets/default-artist.png'}" class="stats-avatar-img" alt="Avatar" onerror="this.src='assets/default-track.png'">
            <div class="stats-item-info">
              <span class="stats-item-title">${escapeHTML(a.name)}</span>
              <span class="stats-item-artist">${formatDuration(a.seconds || 0)} звучания</span>
            </div>
            <span class="stats-item-count">${a.count} воспр.</span>
          </div>
        `).join('') : `
          <div class="stats-empty-box">
            <p>Нет данных об артистах за выбранный период</p>
          </div>
        `}
      </div>
    `;

    artistsCard.querySelectorAll('.stats-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const artistName = item.dataset.artist;
        if (artistName) {
          openArtistProfile(artistName);
        }
      });
    });
    columnsGrid.appendChild(artistsCard);

    dashboard.appendChild(columnsGrid);

    // 5. Time of Day Distribution Card
    const timeCard = document.createElement('div');
    timeCard.className = 'stats-section-card';
    timeCard.innerHTML = `
      <div class="stats-section-header-row">
        <h3 class="stats-section-title">Активность по времени суток</h3>
        <span class="stats-section-tag">Распределение времени</span>
      </div>
      <div class="stats-time-grid">
        ${data.slots.map(s => `
          <div class="stats-time-slot">
            <div class="stats-time-slot-header">
              <span class="stats-time-slot-name">${escapeHTML(s.name)}</span>
              <span class="stats-time-slot-pct">${s.pct}%</span>
            </div>
            <div class="stats-progress-track">
              <div class="stats-progress-fill" style="width: ${s.pct}%"></div>
            </div>
            <span class="stats-time-slot-hours">${s.formattedHours} ч музыки</span>
          </div>
        `).join('')}
      </div>
    `;
    dashboard.appendChild(timeCard);

    container.appendChild(dashboard);
  }

  function playTrackFromStats(track) {
    if (!track) return;
    if (window.GP?.Player?.playTrack) {
      // Check if track is already in active playlist
      const pl = window.playlist || [];
      const existingIdx = pl.findIndex(t => t.id === track.id);
      if (existingIdx !== -1) {
        window.GP.Player.playTrack(existingIdx);
        return;
      }
    }

    // Try finding via global search or search & play
    if (typeof window.performSearch === 'function') {
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.value = `${track.artist} ${track.title}`;
      window.performSearch(`${track.artist} ${track.title}`);
    } else if (typeof window.showToastNotification === 'function') {
      window.showToastNotification('Трек выбран для воспроизведения', 'info');
    }
  }

  function openArtistProfile(artistName) {
    if (!artistName) return;
    if (window.GP?.Views?.Artist?.loadArtistView) {
      window.GP.Views.Artist.loadArtistView(artistName);
    } else if (typeof window.loadArtistView === 'function') {
      window.loadArtistView(artistName);
    } else if (typeof window.performSearch === 'function') {
      window.performSearch(artistName);
    }
  }

  // Export module
  window.GP.Views.Stats = {
    renderStatsView,
    getListeningStats,
    formatDuration,
    aggregateStatsForPeriod
  };

  // Direct global alias for compatibility
  window.renderStatsView = renderStatsView;

})(typeof window !== 'undefined' ? window : globalThis);
