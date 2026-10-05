/**
 * GlassPlayer - Theme Engine & Customization System
 * Namespace: window.GP.Theme
 * Manages theme presets, CSS variables, glassmorphism tokens, and dynamic cover color extraction.
 */

(function (window) {
  'use strict';

  const DEFAULT_CUSTOM_THEME = Object.freeze({
    version: 2,
    bgColor1: '#1e1e24',
    bgColor2: '#0a0a0c',
    bgAngle: 135,
    textColor: '#f5f5f7',
    playerBg: '#050505',
    cardBg: '#ffffff',
    accentColor: '#ffffff',
    glassEnabled: true,
    blur: 28,
    saturation: 140,
    panelTransparency: 0.55,
    miniTransparency: null,
    cardStyle: 'glass',
    glowEnabled: true,
    glow: 0.25,
    glowColor: '#ffffff',
    windowRadius: 12,
    borderWidth: '1px',
    shadowsEnabled: true,
    bgEffect: 'none',
    animationsEnabled: true,
    fontFamily: 'Inter',
    wallpaperDim: 0.45
  });

  const CUSTOM_THEME_FONTS = new Set(['Inter', 'Outfit', 'Montserrat', 'Fira Code', 'Playfair Display']);
  const CUSTOM_THEME_CARD_STYLES = new Set(['glass', 'frosted', 'solid', 'flat', 'default', 'material']);
  const CUSTOM_THEME_BG_EFFECTS = new Set(['none', 'aurora', 'liquid', 'particles', 'static']);

  let customThemeRecoveryNotified = false;
  let activeAccentOverride = null;

  // Resolve core utility helpers safely
  function getUtils() {
    return (window.GP && window.GP.Utils) || window;
  }

  function _clamp(val, def, min, max) {
    const fn = getUtils().clampThemeNumber;
    return typeof fn === 'function' ? fn(val, def, min, max) : Math.min(max, Math.max(min, Number(val) || def));
  }

  function _isValidHex(color) {
    const fn = getUtils().isValidHexColor;
    return typeof fn === 'function' ? fn(color) : (typeof color === 'string' && /^#([A-Fa-f0-9]{3}){1,2}$/.test(color.trim()));
  }

  function _normBorder(width) {
    const fn = getUtils().normalizeBorderWidth;
    return typeof fn === 'function' ? fn(width) : String(width || '1px');
  }

  function _color(value, fallback) {
    return _isValidHex(value) ? value.trim().toLowerCase() : fallback;
  }

  function _mix(c1, c2, w) {
    const fn = getUtils().mixHexColors;
    return typeof fn === 'function' ? fn(c1, c2, w) : c1;
  }

  function _lum(c) {
    const fn = getUtils().getLuminance;
    return typeof fn === 'function' ? fn(c) : 0.5;
  }

  function _readable(bg, pref) {
    const fn = getUtils().pickReadableText;
    return typeof fn === 'function' ? fn(bg, pref) : '#ffffff';
  }

  function _rgba(hex, a) {
    const fn = getUtils().hexToRgba;
    return typeof fn === 'function' ? fn(hex, a) : hex;
  }

  function _triplet(hex) {
    const fn = getUtils().hexToRgbTriplet;
    return typeof fn === 'function' ? fn(hex) : '255, 255, 255';
  }

  function _isDark(hex) {
    const fn = getUtils().isColorDark;
    return typeof fn === 'function' ? fn(hex) : true;
  }

  function migrateThemeV1(source) {
    if (!source || typeof source !== 'object') return { ...DEFAULT_CUSTOM_THEME };
    const migrated = {
      ...DEFAULT_CUSTOM_THEME,
      ...source,
      version: 2
    };

    if (source.bg && !source.bgColor1) {
      migrated.bgColor1 = source.bg;
      migrated.bgColor2 = source.bg;
    }
    if (source.miniTransparency === undefined) {
      migrated.miniTransparency = null;
    }
    return migrated;
  }

  function normalizeCustomTheme(value) {
    const source = (!value || typeof value !== 'object') ? DEFAULT_CUSTOM_THEME : (value.version === 1 ? migrateThemeV1(value) : value);
    const legacyBg = _isValidHex(source.bg) ? source.bg.trim().toLowerCase() : null;

    let cardStyle = source.cardStyle;
    if (!CUSTOM_THEME_CARD_STYLES.has(cardStyle)) {
      cardStyle = DEFAULT_CUSTOM_THEME.cardStyle;
    }
    if (cardStyle === 'default') cardStyle = 'glass';

    let bgEffect = source.bgEffect;
    if (!CUSTOM_THEME_BG_EFFECTS.has(bgEffect)) {
      bgEffect = DEFAULT_CUSTOM_THEME.bgEffect;
    }

    return {
      version: 2,
      bgColor1: _color(source.bgColor1, legacyBg || DEFAULT_CUSTOM_THEME.bgColor1),
      bgColor2: _color(source.bgColor2, legacyBg || DEFAULT_CUSTOM_THEME.bgColor2),
      bgAngle: Math.round(_clamp(source.bgAngle, DEFAULT_CUSTOM_THEME.bgAngle, 0, 360)),
      textColor: _color(source.textColor, DEFAULT_CUSTOM_THEME.textColor),
      playerBg: _color(source.playerBg, DEFAULT_CUSTOM_THEME.playerBg),
      cardBg: _color(source.cardBg, DEFAULT_CUSTOM_THEME.cardBg),
      accentColor: _color(source.accentColor, DEFAULT_CUSTOM_THEME.accentColor),
      glassEnabled: source.glassEnabled !== undefined ? Boolean(source.glassEnabled) : DEFAULT_CUSTOM_THEME.glassEnabled,
      blur: Math.round(_clamp(source.blur, DEFAULT_CUSTOM_THEME.blur, 0, 60)),
      saturation: Math.round(_clamp(source.saturation, DEFAULT_CUSTOM_THEME.saturation, 100, 200)),
      panelTransparency: _clamp(source.panelTransparency, DEFAULT_CUSTOM_THEME.panelTransparency, 0, 1),
      miniTransparency: source.miniTransparency !== null && source.miniTransparency !== undefined
        ? _clamp(source.miniTransparency, DEFAULT_CUSTOM_THEME.panelTransparency, 0, 1)
        : null,
      cardStyle,
      glowEnabled: source.glowEnabled !== undefined ? Boolean(source.glowEnabled) : DEFAULT_CUSTOM_THEME.glowEnabled,
      glow: _clamp(source.glow, DEFAULT_CUSTOM_THEME.glow, 0, 1),
      glowColor: _color(source.glowColor, DEFAULT_CUSTOM_THEME.glowColor),
      windowRadius: Math.round(_clamp(source.windowRadius, DEFAULT_CUSTOM_THEME.windowRadius, 0, 32)),
      borderWidth: _normBorder(source.borderWidth),
      shadowsEnabled: source.shadowsEnabled !== undefined ? Boolean(source.shadowsEnabled) : DEFAULT_CUSTOM_THEME.shadowsEnabled,
      bgEffect,
      animationsEnabled: source.animationsEnabled !== undefined ? Boolean(source.animationsEnabled) : DEFAULT_CUSTOM_THEME.animationsEnabled,
      fontFamily: CUSTOM_THEME_FONTS.has(source.fontFamily) ? source.fontFamily : DEFAULT_CUSTOM_THEME.fontFamily,
      wallpaperDim: _clamp(source.wallpaperDim, DEFAULT_CUSTOM_THEME.wallpaperDim, 0, 0.8)
    };
  }

  let themeCommitTimer = null;
  let pendingThemeCommit = null;

  function commitCustomTheme(rawTheme, { persist = true } = {}) {
    const theme = normalizeCustomTheme(rawTheme);
    pendingThemeCommit = theme;
    if (persist && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('gp_custom_theme', JSON.stringify(theme));
      } catch (e) {}
    }
    if (themeCommitTimer) cancelAnimationFrame(themeCommitTimer);
    themeCommitTimer = requestAnimationFrame(() => {
      applyCustomTheme(pendingThemeCommit);
      themeCommitTimer = null;
    });
    return theme;
  }

  function resetThemeToDefault() {
    return commitCustomTheme(DEFAULT_CUSTOM_THEME, { persist: true });
  }

  function setAccentOverride(color) {
    activeAccentOverride = _isValidHex(color) ? color.toLowerCase() : null;
    const currentTheme = (typeof localStorage !== 'undefined' && localStorage.getItem('gp_theme')) || 'theme-dark-glass';
    if (currentTheme === 'custom') {
      applyCustomTheme(getStoredCustomTheme());
    } else {
      if (typeof document === 'undefined') return;
      const root = document.documentElement;
      if (activeAccentOverride) {
        root.style.setProperty('--accent-color', activeAccentOverride);
        const onAccent = _readable(activeAccentOverride, null);
        root.style.setProperty('--on-accent', onAccent);
        root.style.setProperty('--play-main-bg', activeAccentOverride);
        root.style.setProperty('--play-main-color', onAccent);
        root.style.setProperty('--primary-btn-bg', activeAccentOverride);
        root.style.setProperty('--primary-btn-color', onAccent);
        root.style.setProperty('--focus-ring', _rgba(activeAccentOverride, 0.72));
      } else {
        applyTheme(currentTheme);
      }
    }
  }

  function resetAccentColor() {
    setAccentOverride(null);
  }

  function getStoredCustomTheme() {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_CUSTOM_THEME };
    const raw = localStorage.getItem('gp_custom_theme');
    if (!raw) return { ...DEFAULT_CUSTOM_THEME };
    try {
      const normalized = normalizeCustomTheme(JSON.parse(raw));
      localStorage.setItem('gp_custom_theme', JSON.stringify(normalized));
      return normalized;
    } catch (error) {
      console.warn('[Theme] Invalid custom theme was reset:', error.message);
      localStorage.removeItem('gp_custom_theme');
      if (!customThemeRecoveryNotified) {
        customThemeRecoveryNotified = true;
        const toast = typeof window !== 'undefined' && window.showToastNotification;
        if (typeof toast === 'function') {
          setTimeout(() => toast('Повреждённые настройки заменены безопасной темой.', 'warning', 'Тема оформления'), 0);
        }
      }
      return { ...DEFAULT_CUSTOM_THEME };
    }
  }

  function applyTheme(themeName) {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.classList.remove('theme-dark-glass', 'theme-pink-white', 'theme-silver-matrix');
    if (themeName === 'custom') {
      applyCustomTheme(getStoredCustomTheme());
    } else {
      clearCustomThemeProperties();
      document.body.classList.add(themeName);
      const bgEffectFn = (window.GP && window.GP.Ambient && window.GP.Ambient.applyBgEffect) || window.applyBgEffect;
      if (typeof bgEffectFn === 'function') {
        bgEffectFn('none');
      }
      if (activeAccentOverride && typeof localStorage !== 'undefined' && localStorage.getItem('gp_dynamic_cover') === 'true') {
        const root = document.documentElement;
        root.style.setProperty('--accent-color', activeAccentOverride);
        const onAccent = _readable(activeAccentOverride, null);
        root.style.setProperty('--on-accent', onAccent);
        root.style.setProperty('--play-main-bg', activeAccentOverride);
        root.style.setProperty('--play-main-color', onAccent);
        root.style.setProperty('--primary-btn-bg', activeAccentOverride);
        root.style.setProperty('--primary-btn-color', onAccent);
        root.style.setProperty('--focus-ring', _rgba(activeAccentOverride, 0.72));
      }
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('gp_theme', themeName);
      } catch (e) {}
    }
  }

  function applyBackgroundImage(mediaRef, isVideoFlag) {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const bgVideo = document.getElementById('bg-video-element');

    const isVideo = isVideoFlag !== undefined
      ? Boolean(isVideoFlag)
      : (Boolean(mediaRef) && (
          String(mediaRef).toLowerCase().endsWith('.mp4') ||
          String(mediaRef).toLowerCase().endsWith('.webm') ||
          String(mediaRef).toLowerCase().endsWith('.mov') ||
          String(mediaRef).startsWith('data:video/')
        ));

    if (!mediaRef) {
      root.style.removeProperty('--bg-image');
      if (bgVideo) {
        bgVideo.pause();
        bgVideo.removeAttribute('src');
        bgVideo.load();
        bgVideo.classList.add('hidden');
      }
      return;
    }

    if (isVideo) {
      root.style.removeProperty('--bg-image');
      if (bgVideo) {
        if (bgVideo.src !== mediaRef) {
          bgVideo.src = mediaRef;
          bgVideo.load();
        }
        bgVideo.ontimeupdate = () => {
          if (bgVideo.currentTime >= 8.0) {
            bgVideo.currentTime = 0;
          }
        };
        bgVideo.classList.remove('hidden');
        bgVideo.play().catch(e => console.warn('[Video Background] Autoplay:', e.message));
      }
    } else {
      if (bgVideo) {
        bgVideo.pause();
        bgVideo.removeAttribute('src');
        bgVideo.classList.add('hidden');
      }
      root.style.setProperty('--bg-image', `url("${mediaRef}")`);
    }
  }

  function loadGoogleFont(fontFamily) {
    if (!fontFamily || fontFamily === 'Inter' || typeof document === 'undefined') return;
    const fontId = `google-font-${fontFamily.replace(/\s+/g, '-').toLowerCase()}`;
    if (document.getElementById(fontId)) return;

    const link = document.createElement('link');
    link.id = fontId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@300;400;500;600;700&display=swap`;
    if (document.head) document.head.appendChild(link);
  }

  function applyCustomTheme(theme) {
    theme = normalizeCustomTheme(theme);
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    const bg1 = theme.bgColor1;
    const bg2 = theme.bgColor2;
    const averageBackground = _mix(bg1, bg2, 0.5);
    const avgLum = (_lum(bg1) + _lum(bg2)) / 2;
    const isLightBg = avgLum > 0.42;

    const textColor = _readable(averageBackground, theme.textColor);
    root.style.setProperty('--text-color', textColor);
    root.style.setProperty('--text-dim', _rgba(textColor, 0.68));

    // Glass & blur calculation
    let glassFilter = 'none';
    let blurVal = 'none';
    if (theme.glassEnabled && theme.cardStyle !== 'solid' && theme.cardStyle !== 'flat') {
      if (theme.cardStyle === 'frosted') {
        const frostedBlur = Math.min(80, Math.round(theme.blur * 1.35));
        const frostedSat = Math.min(220, Math.round(theme.saturation * 1.15));
        glassFilter = `blur(${frostedBlur}px) saturate(${frostedSat}%)`;
        blurVal = `blur(${frostedBlur}px)`;
      } else {
        glassFilter = theme.blur > 0 ? `blur(${theme.blur}px) saturate(${theme.saturation}%)` : 'none';
        blurVal = theme.blur > 0 ? `blur(${theme.blur}px)` : 'none';
      }
    }

    root.style.setProperty('--glass-filter', glassFilter);
    root.style.setProperty('--blur-value', blurVal);
    root.style.setProperty('--blur', blurVal);
    root.style.setProperty('--blur-raw', `${theme.blur}px`);

    // Background Gradient
    const bgGrad = `linear-gradient(${theme.bgAngle}deg, ${bg1}, ${bg2})`;
    root.style.setProperty('--bg-gradient', bgGrad);
    root.style.setProperty('--bgColor1', bg1);

    // Cards & Panels
    const cardHex = theme.cardBg;
    const cardIsLight = _isDark(cardHex) === false;
    const cardAlpha = theme.cardStyle === 'solid' ? 0.95 : (theme.cardStyle === 'flat' ? 0.85 : 0.45);
    const cardBorderAlpha = theme.cardStyle === 'flat' ? 0.08 : 0.18;

    root.style.setProperty('--card-bg', _rgba(cardHex, cardAlpha));
    root.style.setProperty('--card-border', _rgba(cardIsLight ? '#000000' : '#ffffff', cardBorderAlpha));
    root.style.setProperty('--card-hover-bg', _rgba(cardHex, Math.min(1, cardAlpha + 0.15)));
    root.style.setProperty('--card-hover-border', _rgba(cardIsLight ? '#000000' : '#ffffff', cardBorderAlpha + 0.12));

    // Surface elevated
    const panelAlpha = theme.panelTransparency ?? 0.55;
    const surfaceBase = isLightBg ? '#ffffff' : '#000000';
    const surfaceAlpha = Math.min(0.9, Math.max(0.1, panelAlpha * 0.85));
    root.style.setProperty('--panel-bg', _rgba(surfaceBase, surfaceAlpha));
    root.style.setProperty('--surface-elevated', _rgba(surfaceBase, Math.min(0.95, surfaceAlpha + 0.1)));

    // Surface Text
    const surfaceText = _readable(_rgba(surfaceBase, surfaceAlpha), textColor);
    root.style.setProperty('--surface-text-color', surfaceText);
    root.style.setProperty('--surface-text-dim', _rgba(surfaceText, 0.68));
    root.style.setProperty('--surface-text-shadow', isLightBg ? '0 1px 2px rgba(0,0,0,0.05)' : '0 1px 3px rgba(0,0,0,0.5)');

    // Player Bar Background
    const playerHex = theme.playerBg;
    const playerAlpha = Math.min(0.95, Math.max(0.2, panelAlpha * 0.9));
    const miniAlpha = theme.miniTransparency !== null && theme.miniTransparency !== undefined
      ? Math.min(1, Math.max(0, theme.miniTransparency))
      : playerAlpha;
    root.style.setProperty('--player-bg', _rgba(playerHex, playerAlpha));
    root.style.setProperty('--mini-bg', _rgba(playerHex, miniAlpha));
    root.style.setProperty('--player-border', _rgba(isLightBg ? '#000000' : '#ffffff', 0.15));

    const playerText = _readable(playerHex, textColor);
    root.style.setProperty('--player-text-color', playerText);
    root.style.setProperty('--player-text-dim', _rgba(playerText, 0.68));

    // Accents & interactive controls
    const isDynamic = typeof localStorage !== 'undefined' && localStorage.getItem('gp_dynamic_cover') === 'true';
    const accentColorHex = activeAccentOverride && isDynamic
      ? activeAccentOverride
      : theme.accentColor;
    root.style.setProperty('--accent-color', accentColorHex);
    const onAccent = _readable(accentColorHex, null);
    root.style.setProperty('--on-accent', onAccent);
    root.style.setProperty('--play-main-bg', accentColorHex);
    root.style.setProperty('--play-main-color', onAccent);
    root.style.setProperty('--primary-btn-bg', accentColorHex);
    root.style.setProperty('--primary-btn-color', onAccent);
    root.style.setProperty('--focus-ring', _rgba(accentColorHex, 0.72));

    // Wallpaper dim scrim
    const scrimAlpha = theme.wallpaperDim !== undefined ? theme.wallpaperDim : 0.45;
    root.style.setProperty('--wallpaper-scrim', isLightBg ? `rgba(255, 255, 255, ${scrimAlpha})` : `rgba(2, 3, 8, ${scrimAlpha})`);

    // Status colors
    const surfaceIsLight = _lum(averageBackground) > 0.42;
    const statusPalette = surfaceIsLight
      ? { info: '#005eb8', success: '#146c35', warning: '#875000', error: '#b52b25' }
      : { info: '#74b7ff', success: '#5bd98b', warning: '#ffc166', error: '#ff7b72' };
    Object.entries(statusPalette).forEach(([name, color]) => root.style.setProperty(`--status-${name}`, color));

    // Glow calculation
    if (!theme.glowEnabled || theme.glow <= 0) {
      root.style.setProperty('--glow', '0');
      root.style.setProperty('--glow-color', 'transparent');
      root.style.setProperty('--glow-color-base', 'transparent');
      root.style.setProperty('--glow-rgb', '0, 0, 0');
      root.style.setProperty('--glass-glow', 'none');
    } else {
      const glowVal = theme.glow;
      const glowColorHex = theme.glowColor;
      const glowColorRgba = _rgba(glowColorHex, Math.min(1, glowVal * 0.75 + 0.05));
      root.style.setProperty('--glow', String(glowVal));
      root.style.setProperty('--glow-color', glowColorRgba);
      root.style.setProperty('--glow-color-base', glowColorHex);
      root.style.setProperty('--glow-rgb', _triplet(glowColorHex));
      root.style.setProperty('--glass-glow', `inset 0 1px 0 0 ${glowColorRgba}`);
    }

    // Shadows & Geometry
    root.style.setProperty('--window-radius', `${theme.windowRadius}px`);
    root.style.setProperty('--border-width', theme.borderWidth);
    root.style.setProperty('--card-shadow', theme.shadowsEnabled && theme.cardStyle !== 'flat' ? '0 8px 32px 0 rgba(0, 0, 0, 0.28)' : 'none');
    root.style.setProperty('--glass-shadow', theme.shadowsEnabled ? '0 24px 64px rgba(0, 0, 0, 0.6)' : 'none');

    // Modular helper classes on html root
    root.classList.toggle('gp-glass-off', !theme.glassEnabled);
    root.classList.toggle('gp-shadows-off', !theme.shadowsEnabled);
    root.classList.toggle('gp-motion-off', !theme.animationsEnabled);

    // Font
    if (theme.fontFamily) {
      loadGoogleFont(theme.fontFamily);
      root.style.setProperty('--font-family', `'${theme.fontFamily}', sans-serif`);
    } else {
      root.style.setProperty('--font-family', "'Inter', sans-serif");
    }

    // Card styles on body
    if (document.body) {
      document.body.classList.remove('glass-style-glass', 'glass-style-frosted', 'glass-style-solid', 'glass-style-material', 'glass-style-flat');
      document.body.classList.add(`glass-style-${theme.cardStyle}`);
    }

    // Apply background effect centrally
    const bgEffectFn = (window.GP && window.GP.Ambient && window.GP.Ambient.applyBgEffect) || window.applyBgEffect;
    if (typeof bgEffectFn === 'function') {
      bgEffectFn(theme.bgEffect);
    }
  }

  function clearCustomThemeProperties() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const props = [
      '--bg-gradient', '--blur-value', '--blur', '--blur-raw', '--glass-filter',
      '--text-color', '--text-dim', '--card-bg', '--card-border',
      '--card-hover-bg', '--card-hover-border', '--card-shadow',
      '--player-bg', '--mini-bg', '--player-border', '--player-text-color', '--player-text-dim',
      '--panel-bg', '--surface-elevated', '--surface-text-color', '--surface-text-dim',
      '--surface-text-shadow', '--accent-color', '--on-accent',
      '--play-main-bg', '--play-main-color', '--primary-btn-bg', '--primary-btn-color',
      '--focus-ring', '--wallpaper-scrim',
      '--status-info', '--status-success', '--status-warning', '--status-error',
      '--glass-glow', '--glow', '--glow-color', '--glow-color-base', '--glow-rgb',
      '--window-radius', '--font-family', '--border-width', '--bgColor1'
    ];
    props.forEach(p => root.style.removeProperty(p));
    root.classList.remove('gp-glass-off', 'gp-shadows-off', 'gp-motion-off');
    if (document.body) {
      document.body.classList.remove('glass-style-glass', 'glass-style-frosted', 'glass-style-solid', 'glass-style-material', 'glass-style-flat');
    }
  }

  function pauseBackgroundMedia() {
    if (typeof document === 'undefined') return;
    const bgVideo = document.getElementById('bg-video-element');
    if (bgVideo && !bgVideo.classList.contains('hidden')) {
      bgVideo.pause();
    }
    const stopParticles = (window.GP && window.GP.Ambient && window.GP.Ambient.stopAmbientParticles) || window.stopAmbientParticles;
    if (typeof stopParticles === 'function') {
      stopParticles();
    }
  }

  function resumeBackgroundMedia() {
    if (typeof document === 'undefined') return;
    const bgVideo = document.getElementById('bg-video-element');
    if (bgVideo && !bgVideo.classList.contains('hidden') && !document.hidden) {
      bgVideo.play().catch(() => {});
    }
    const currentEffect = typeof localStorage !== 'undefined' && localStorage.getItem('gp_bg_effect');
    if (currentEffect === 'particles' && !document.hidden && document.body && !document.body.classList.contains('mini-player-active')) {
      const startParticles = (window.GP && window.GP.Ambient && window.GP.Ambient.startAmbientParticles) || window.startAmbientParticles;
      if (typeof startParticles === 'function') {
        startParticles();
      }
    }
  }

  // --- Dynamic Cover Vibrant Glass Color Extractor ---
  function extractDominantColor(imgElement) {
    if (!imgElement || typeof document === 'undefined') return '#ffffff';
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return '#ffffff';
      canvas.width = 30;
      canvas.height = 30;

      ctx.drawImage(imgElement, 0, 0, 30, 30);
      let imgData;
      try {
        imgData = ctx.getImageData(0, 0, 30, 30).data;
      } catch (corsErr) {
        console.warn('[Theme] CORS protected image, falling back to default accent color');
        return '#ffffff';
      }

      let colorCounts = {};
      let maxCount = 0;
      let dominantColor = '#ffffff';

      for (let i = 0; i < imgData.length; i += 4) {
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];
        const a = imgData[i + 3];

        if (a < 200) continue;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        const s = max === 0 ? 0 : delta / max;
        const l = (max + min) / 2 / 255;

        if (s > 0.25 && l > 0.25 && l < 0.75) {
          const qr = Math.round(r / 16) * 16;
          const qg = Math.round(g / 16) * 16;
          const qb = Math.round(b / 16) * 16;
          const key = `${qr},${qg},${qb}`;

          colorCounts[key] = (colorCounts[key] || 0) + 1;

          if (colorCounts[key] > maxCount) {
            maxCount = colorCounts[key];
            dominantColor = `rgb(${qr}, ${qg}, ${qb})`;
          }
        }
      }

      if (maxCount === 0) {
        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        for (let i = 0; i < imgData.length; i += 4) {
          sumR += imgData[i];
          sumG += imgData[i + 1];
          sumB += imgData[i + 2];
          count++;
        }
        if (count > 0) {
          return `rgb(${Math.round(sumR / count)}, ${Math.round(sumG / count)}, ${Math.round(sumB / count)})`;
        }
        return '#ffffff';
      }

      return dominantColor;
    } catch (err) {
      console.error('Error extracting cover color:', err);
      return '#ffffff';
    }
  }

  function applyDynamicCoverColor() {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('gp_dynamic_cover') !== 'true') return;
    if (typeof document === 'undefined') return;
    const currentCover = document.getElementById('current-cover');
    if (!currentCover) return;

    if (currentCover.src && !currentCover.src.startsWith('data:image/svg')) {
      if (currentCover.complete) {
        const color = extractDominantColor(currentCover);
        setAccentOverride(color);
      } else {
        currentCover.onload = function () {
          const color = extractDominantColor(currentCover);
          setAccentOverride(color);
          currentCover.onload = null;
        };
      }
    }
  }

  function initDynamicCoverListener() {
    if (typeof document === 'undefined') return;
    const currentCover = document.getElementById('current-cover');
    if (currentCover) {
      currentCover.addEventListener('load', () => {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('gp_dynamic_cover') === 'true') {
          applyDynamicCoverColor();
        }
      });
    }
  }

  // Set up visibility & focus listeners for live video / ambient pause
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pauseBackgroundMedia();
      else resumeBackgroundMedia();
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('blur', pauseBackgroundMedia);
    window.addEventListener('focus', resumeBackgroundMedia);

    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDynamicCoverListener);
      } else {
        initDynamicCoverListener();
      }
    }
  }

  // --- Namespace & Export ---
  window.GP = window.GP || {};
  window.GP.Theme = {
    DEFAULT_CUSTOM_THEME,
    CUSTOM_THEME_FONTS,
    CUSTOM_THEME_CARD_STYLES,
    CUSTOM_THEME_BG_EFFECTS,
    migrateThemeV1,
    normalizeCustomTheme,
    commitCustomTheme,
    resetThemeToDefault,
    getStoredCustomTheme,
    applyTheme,
    applyCustomTheme,
    applyBackgroundImage,
    loadGoogleFont,
    clearCustomThemeProperties,
    pauseBackgroundMedia,
    resumeBackgroundMedia,
    setAccentOverride,
    resetAccentColor,
    extractDominantColor,
    applyDynamicCoverColor,
    initDynamicCoverListener,
    getActiveAccentOverride: () => activeAccentOverride
  };

  // Backward compatibility global exports
  window.DEFAULT_CUSTOM_THEME = DEFAULT_CUSTOM_THEME;
  window.CUSTOM_THEME_FONTS = CUSTOM_THEME_FONTS;
  window.CUSTOM_THEME_CARD_STYLES = CUSTOM_THEME_CARD_STYLES;
  window.CUSTOM_THEME_BG_EFFECTS = CUSTOM_THEME_BG_EFFECTS;
  window.migrateThemeV1 = migrateThemeV1;
  window.normalizeCustomTheme = normalizeCustomTheme;
  window.commitCustomTheme = commitCustomTheme;
  window.resetThemeToDefault = resetThemeToDefault;
  window.getStoredCustomTheme = getStoredCustomTheme;
  window.applyTheme = applyTheme;
  window.applyCustomTheme = applyCustomTheme;
  window.applyBackgroundImage = applyBackgroundImage;
  window.loadGoogleFont = loadGoogleFont;
  window.clearCustomThemeProperties = clearCustomThemeProperties;
  window.pauseBackgroundMedia = pauseBackgroundMedia;
  window.resumeBackgroundMedia = resumeBackgroundMedia;
  window.setAccentOverride = setAccentOverride;
  window.resetAccentColor = resetAccentColor;
  window.extractDominantColor = extractDominantColor;
  window.applyDynamicCoverColor = applyDynamicCoverColor;

  Object.defineProperty(window, 'activeAccentOverride', {
    get: () => activeAccentOverride,
    set: (val) => { activeAccentOverride = val; },
    configurable: true
  });

  Object.defineProperty(window, 'customThemeRecoveryNotified', {
    get: () => customThemeRecoveryNotified,
    set: (val) => { customThemeRecoveryNotified = val; },
    configurable: true
  });

  Object.defineProperty(window, 'customTheme', {
    get: () => getStoredCustomTheme(),
    set: (val) => { commitCustomTheme(val); },
    configurable: true
  });

})(typeof window !== 'undefined' ? window : global);
