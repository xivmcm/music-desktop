/**
 * GlassPlayer Core Utilities
 * Pure functions: time formatting, string escapes, color mathematics, contrast ratios, LRC & link parsers.
 */

(function (global) {
  'use strict';

  const SHARE_ALLOWED_SOURCES = new Set(['soundcloud', 'spotify']);
  const SHARE_MAX_TEXT_LENGTH = 200;

  // 1. Time & Duration Utilities
  function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  function parseDurationToSeconds(durationStr) {
    if (!durationStr && durationStr !== 0) return 0;
    if (typeof durationStr === 'number') return Math.round(durationStr);
    const str = String(durationStr).trim();
    if (!str.includes(':')) {
      return parseFloat(str) || 0;
    }
    const parts = str.split(':').map(Number);
    if (parts.length === 2) {
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    } else if (parts.length === 3) {
      return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    }
    return parseFloat(str) || 0;
  }

  // 2. Text & Number Formatting
  function formatPlaybackCount(count) {
    if (count === undefined || count === null || isNaN(count)) return '';
    const num = Number(count);
    if (num >= 1000000) {
      const formatted = (num / 1000000).toFixed(1);
      return formatted.endsWith('.0') ? formatted.slice(0, -2) + 'M' : formatted + 'M';
    }
    if (num >= 1000) {
      return Math.floor(num / 1000) + 'K';
    }
    return num.toString();
  }

  function formatTrackCount(count) {
    const absolute = Math.abs(count) % 100;
    const lastDigit = absolute % 10;
    const label = absolute > 10 && absolute < 20
      ? 'треков'
      : lastDigit === 1
        ? 'трек'
        : lastDigit >= 2 && lastDigit <= 4
          ? 'трека'
          : 'треков';
    return `${count} ${label}`;
  }

  function formatUsername(username) {
    if (!username) return '';
    const clean = String(username).trim();
    return clean.startsWith('@') ? clean : `@${clean}`;
  }

  function formatLastSeen(dateInput) {
    if (!dateInput) return 'был(а) давно';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return 'был(а) давно';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));

    if (diffSec < 60) {
      return 'был(а) только что';
    }

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      const lastDigit = diffMin % 10;
      const lastTwo = diffMin % 100;
      let minWord = 'минут';
      if (lastTwo < 11 || lastTwo > 19) {
        if (lastDigit === 1) minWord = 'минуту';
        else if (lastDigit >= 2 && lastDigit <= 4) minWord = 'минуты';
      }
      return `был(а) ${diffMin} ${minWord} назад`;
    }

    const pad = (n) => String(n).padStart(2, '0');
    const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

    const isToday = now.getFullYear() === date.getFullYear() &&
                    now.getMonth() === date.getMonth() &&
                    now.getDate() === date.getDate();
    if (isToday) {
      return `был(а) сегодня в ${timeStr}`;
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = yesterday.getFullYear() === date.getFullYear() &&
                        yesterday.getMonth() === date.getMonth() &&
                        yesterday.getDate() === date.getDate();
    if (isYesterday) {
      return `был(а) вчера в ${timeStr}`;
    }

    const months = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
    const day = date.getDate();
    const month = months[date.getMonth()];

    if (now.getFullYear() === date.getFullYear()) {
      return `был(а) ${day} ${month} в ${timeStr}`;
    }

    return `был(а) ${pad(day)}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
  }

  function getFullDateTooltip(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';
    try {
      return date.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return String(dateInput);
    }
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g,
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }

  // 3. Color, Theme & Contrast Mathematics
  function isValidHexColor(value) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  }

  function clampThemeNumber(value, fallback, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function normalizeBorderWidth(bw) {
    if (typeof bw === 'number') return `${Math.max(0, Math.min(4, bw))}px`;
    if (typeof bw === 'string') {
      const num = parseFloat(bw);
      if (!isNaN(num)) return `${Math.max(0, Math.min(4, num))}px`;
    }
    return '1px';
  }

  function hexToRgbTriplet(hex) {
    let c;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
      c = hex.substring(1).split('');
      if (c.length === 3) {
        c = [c[0], c[0], c[1], c[1], c[2], c[2]];
      }
      c = '0x' + c.join('');
      return `${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}`;
    }
    return '255, 255, 255';
  }

  function hexToRgba(hex, alpha) {
    let c;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
      c = hex.substring(1).split('');
      if (c.length === 3) {
        c = [c[0], c[0], c[1], c[1], c[2], c[2]];
      }
      c = '0x' + c.join('');
      return `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${alpha})`;
    }
    return `rgba(255, 255, 255, ${alpha})`;
  }

  function isColorDark(hex) {
    let c;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
      c = hex.substring(1).split('');
      if (c.length === 3) {
        c = [c[0], c[0], c[1], c[1], c[2], c[2]];
      }
      c = '0x' + c.join('');
      const r = (c >> 16) & 255;
      const g = (c >> 8) & 255;
      const b = c & 255;
      const yiq = (r * 299 + g * 587 + b * 114) / 1000;
      return yiq < 128;
    }
    return true;
  }

  function mixHexColors(color1, color2, weight) {
    const parse = (hex) => {
      if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        let c = hex.substring(1).split('');
        if (c.length === 3) {
          c = [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        const num = parseInt(c.join(''), 16);
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
      }
      return { r: 255, g: 255, b: 255 };
    };
    const c1 = parse(color1);
    const c2 = parse(color2);
    const r = Math.min(255, Math.max(0, Math.round(c1.r * (1 - weight) + c2.r * weight)));
    const g = Math.min(255, Math.max(0, Math.round(c1.g * (1 - weight) + c2.g * weight)));
    const b = Math.min(255, Math.max(0, Math.round(c1.b * (1 - weight) + c2.b * weight)));
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function getLuminance(hex) {
    if (!hex || typeof hex !== 'string') return 0;
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    if (c.length !== 6) return 0;
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    const a = [r, g, b].map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  }

  function getContrastRatio(foreground, background) {
    const lighter = Math.max(getLuminance(foreground), getLuminance(background));
    const darker = Math.min(getLuminance(foreground), getLuminance(background));
    return (lighter + 0.05) / (darker + 0.05);
  }

  function pickReadableText(background, preferred) {
    if (isValidHexColor(preferred) && getContrastRatio(preferred, background) >= 4.5) return preferred;
    const dark = '#111116';
    const light = '#f7f7fa';
    return getContrastRatio(dark, background) >= getContrastRatio(light, background) ? dark : light;
  }

  // 4. Parsers & Sanitizers
  function parseLRC(lrcText) {
    const lines = [];
    const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
    let match;
    while ((match = regex.exec(lrcText)) !== null) {
      const min  = parseInt(match[1], 10);
      const sec  = parseInt(match[2], 10);
      const ms   = parseInt(match[3].padEnd(3, '0'), 10);
      const time = min * 60 + sec + ms / 1000;
      const text = match[4].trim();
      if (text) lines.push({ time, text });
    }
    return lines;
  }

  function shareCleanText(value) {
    return String(value ?? '')
      .replace(/[\u0000-\u001f\u007f<>]/g, '')
      .replace(/"/g, '”')
      .replace(/[`']/g, '’')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, SHARE_MAX_TEXT_LENGTH);
  }

  function shareCleanId(value) {
    const id = String(value ?? '').trim()
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29');
    return /^[\w:.%\-!*~]{1,300}$/.test(id) ? id : '';
  }

  function shareCleanImage(value) {
    if (!value) return '';
    try {
      const url = new URL(String(value));
      if (url.protocol !== 'https:') return '';
      const href = url.href;
      if (href.length > 600 || /['"<>\s\\`]/.test(href)) return '';
      return href;
    } catch {
      return '';
    }
  }

  function shareCleanDuration(value) {
    const d = String(value ?? '').trim();
    return /^\d{1,2}(:\d{2}){1,2}$/.test(d) ? d : '';
  }

  function parseIncomingShareLink(rawLink) {
    let url;
    try {
      url = new URL(String(rawLink));
    } catch {
      return null;
    }

    if (url.protocol === 'glassplayer:') {
      const target = (url.hostname || url.pathname.replace(/^\/+/, '')).replace(/\/+$/, '').toLowerCase();
      if (target !== 'track') return null;
    } else if (url.protocol === 'https:') {
      if (url.pathname.replace(/\/+$/, '') !== '/share/track') return null;
    } else {
      return null;
    }

    const p = url.searchParams;
    const source = String(p.get('src') || '').toLowerCase();
    const id = shareCleanId(p.get('id'));
    const title = shareCleanText(p.get('t'));
    if (!SHARE_ALLOWED_SOURCES.has(source) || !id || !title) return null;

    const artistId = String(p.get('aid') || '');
    return {
      id,
      title,
      artist: shareCleanText(p.get('a')) || 'Unknown Artist',
      artistId: /^\d{1,20}$/.test(artistId) ? artistId : '',
      source,
      thumbnail: shareCleanImage(p.get('img')),
      duration: shareCleanDuration(p.get('d')) || '-:-',
      sharedViaLink: true
    };
  }

  const Utils = {
    formatTime,
    parseDurationToSeconds,
    formatPlaybackCount,
    formatTrackCount,
    formatUsername,
    formatLastSeen,
    getFullDateTooltip,
    escapeHTML,
    isValidHexColor,
    clampThemeNumber,
    normalizeBorderWidth,
    hexToRgbTriplet,
    hexToRgba,
    isColorDark,
    mixHexColors,
    getLuminance,
    getContrastRatio,
    pickReadableText,
    parseLRC,
    shareCleanText,
    shareCleanId,
    shareCleanImage,
    shareCleanDuration,
    parseIncomingShareLink
  };

  // Register in namespace
  global.GP = global.GP || {};
  global.GP.Utils = Utils;

  // Double export: assign each utility directly to global for 100% backward compatibility
  Object.assign(global, Utils);

  // CommonJS export for unit testing under Node.js
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
  }
})(typeof window !== 'undefined' ? window : globalThis);
