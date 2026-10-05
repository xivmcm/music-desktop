/**
 * Electron Smoke Test for GlassPlayer Settings & Studio Views Module
 * Tests runtime namespaces, global aliases, settings views, and theme constructor in Electron.
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const errors = [];
  win.webContents.on('console-message', (e, level, msg, line, src) => {
    if (level >= 3 || msg.includes('ReferenceError') || msg.includes('SyntaxError') || msg.includes('TypeError')) {
      if (!msg.includes('Discord') && !msg.includes('Content-Security-Policy') && !msg.includes('URLSearchParams')) {
        errors.push(`[Console Error] ${msg} (${src}:${line})`);
      }
    }
  });

  try {
    console.log('\n[1] Testing root index.html with Settings View...');
    await win.loadFile(path.join(__dirname, '../index.html'));

    const rootEval = await win.webContents.executeJavaScript(`
      (() => {
        const hasGPSettings = typeof window.GP?.Views?.Settings !== 'undefined';
        const hasRenderSettings = typeof window.renderSettings === 'function';
        const hasRenderSettingsView = typeof window.renderSettingsView === 'function';
        const hasLoadSettingsView = typeof window.loadSettingsView === 'function';
        const hasLoadStudioView = typeof window.loadStudioView === 'function';
        const hasLoadStatsView = typeof window.loadStatsView === 'function';
        const hasOpenSettings = typeof window.openSettings === 'function';
        const hasCloseSettings = typeof window.closeSettings === 'function';
        const hasSwitchApiMirror = typeof window.switchApiMirror === 'function';
        const hasClearAppCache = typeof window.clearAppCache === 'function';
        const hasActiveView = typeof window.activeView === 'string';

        // 1. Render Settings Scope
        window.renderSettings({ scope: 'settings' });
        const tracksContainer = document.getElementById('tracks-container');
        const hasSettingsHeader = tracksContainer?.querySelector('.view-header')?.textContent?.includes('Profile & Settings');
        const hasProfileContainer = document.getElementById('profile-section-container') !== null;
        const hasUserInfo = tracksContainer?.querySelector('[data-section="user-info"]') !== null;
        const hasBackendInput = document.getElementById('settings-backend-url-input') !== null;
        const hasClearCacheBtn = document.getElementById('settings-clear-cache-btn') !== null;

        // 2. Render Studio Visual Scope
        window.renderSettings({ scope: 'studio', studioTab: 'visual' });
        const hasStudioHeader = tracksContainer?.querySelector('.view-header')?.textContent?.includes('Studio');
        const hasVisualTab = document.getElementById('studio-visual-tab')?.classList.contains('active');
        const hasThemeConstructor = tracksContainer?.querySelector('[data-section="theme-constructor"]') !== null;
        const hasBgImageSec = tracksContainer?.querySelector('[data-section="background-image"]') !== null;

        // 3. Render Studio Audio Scope
        window.renderSettings({ scope: 'studio', studioTab: 'audio' });
        const hasAudioTab = document.getElementById('studio-audio-tab')?.classList.contains('active');
        const hasAudioEffects = tracksContainer?.querySelector('[data-section="audio-effects"]') !== null;
        const eqSlidersCount = tracksContainer?.querySelectorAll('.eq-slider')?.length || 0;
        const hasNormalization = document.getElementById('effect-normalization-checkbox') !== null;

        // 4. Render Stats Scope
        window.renderSettings({ scope: 'stats' });
        const hasStatsHeader = tracksContainer?.querySelector('.view-header')?.textContent?.includes('Stats');
        const hasListeningStats = tracksContainer?.querySelector('[data-section="listening-stats"]') !== null;

        return {
          hasGPSettings,
          hasRenderSettings,
          hasRenderSettingsView,
          hasLoadSettingsView,
          hasLoadStudioView,
          hasLoadStatsView,
          hasOpenSettings,
          hasCloseSettings,
          hasSwitchApiMirror,
          hasClearAppCache,
          hasActiveView,
          hasSettingsHeader,
          hasProfileContainer,
          hasUserInfo,
          hasBackendInput,
          hasClearCacheBtn,
          hasStudioHeader,
          hasVisualTab,
          hasThemeConstructor,
          hasBgImageSec,
          hasAudioTab,
          hasAudioEffects,
          eqSlidersCount,
          hasNormalization,
          hasStatsHeader,
          hasListeningStats
        };
      })()
    `);

    console.log('Root index.html Settings Eval:', JSON.stringify(rootEval, null, 2));

    if (!rootEval.hasGPSettings || !rootEval.hasRenderSettings || !rootEval.hasThemeConstructor || !rootEval.hasAudioEffects) {
      throw new Error('Root index.html Settings Eval failed validation!');
    }

    console.log('\n[2] Testing www/index.html with Settings View...');
    await win.loadFile(path.join(__dirname, '../www/index.html'));

    const wwwEval = await win.webContents.executeJavaScript(`
      (() => {
        const hasGPSettings = typeof window.GP?.Views?.Settings !== 'undefined';
        const hasRenderSettings = typeof window.renderSettings === 'function';
        const hasLoadSettingsView = typeof window.loadSettingsView === 'function';
        const hasLoadStudioView = typeof window.loadStudioView === 'function';
        const hasLoadStatsView = typeof window.loadStatsView === 'function';

        window.renderSettings({ scope: 'settings' });
        const hasUserInfo = document.querySelector('[data-section="user-info"]') !== null;

        return {
          hasGPSettings,
          hasRenderSettings,
          hasLoadSettingsView,
          hasLoadStudioView,
          hasLoadStatsView,
          hasUserInfo
        };
      })()
    `);

    console.log('WWW index.html Settings Eval:', JSON.stringify(wwwEval, null, 2));

    if (!wwwEval.hasGPSettings || !wwwEval.hasRenderSettings || !wwwEval.hasUserInfo) {
      throw new Error('WWW index.html Settings Eval failed validation!');
    }

    if (errors.length > 0) {
      console.error('\nFAIL: Encountered Console Errors during Electron test:');
      errors.forEach(e => console.error(e));
      process.exit(1);
    }

    console.log('\n====================================================');
    console.log('ELECTRON SETTINGS SMOKE TEST PASSED WITH 0 ERRORS');
    console.log('====================================================\n');
    app.quit();
    process.exit(0);

  } catch (err) {
    console.error('\nEXCEPTION during Electron Settings smoke test:', err);
    app.quit();
    process.exit(1);
  }
});
