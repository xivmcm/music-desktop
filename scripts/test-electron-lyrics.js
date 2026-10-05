/**
 * Electron Smoke Test for GlassPlayer Lyrics & Karaoke Engine
 * Tests lyrics overlay DOM rendering and state transitions in Chromium/Electron.
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
    console.log('[1] Testing root index.html with Lyrics Engine...');
    await win.loadFile(path.join(__dirname, '../index.html'));

    const evalResult = await win.webContents.executeJavaScript(`
      (() => {
        const hasGPLyrics = typeof window.GP?.Lyrics !== 'undefined';
        const hasOpen = typeof window.openLyricsOverlay === 'function';
        const hasClose = typeof window.closeLyricsOverlay === 'function';
        const hasSync = typeof window.syncLyricsToTime === 'function';
        const hasRender = typeof window.renderLRCLines === 'function';
        const hasClean = typeof window.cleanLyricsQuery === 'function';
        const hasState = typeof window.lyricsState === 'object';

        // Check DOM elements
        const overlay = document.getElementById('lyrics-overlay');
        const content = document.getElementById('lyrics-content');
        const btn = document.getElementById('lyrics-btn');

        // Test render sample LRC
        window.renderLRCLines([
          { time: 2, text: 'Hello lyrics test line 1' },
          { time: 5, text: 'Hello lyrics test line 2' }
        ]);

        const renderedCount = content ? content.children.length : 0;

        return {
          hasGPLyrics,
          hasOpen,
          hasClose,
          hasSync,
          hasRender,
          hasClean,
          hasState,
          hasOverlayEl: !!overlay,
          hasContentEl: !!content,
          hasBtnEl: !!btn,
          renderedCount,
          hasTheme: typeof window.GP?.Theme !== 'undefined',
          hasLocalDB: typeof window.GP?.LocalDB !== 'undefined',
          hasVisualizer: typeof window.GP?.Visualizer !== 'undefined',
          hasAudio: typeof window.GP?.Audio !== 'undefined',
          hasUtils: typeof window.GP?.Utils !== 'undefined'
        };
      })()
    `);

    console.log('Root index.html Lyrics Eval:', JSON.stringify(evalResult, null, 2));

    for (const [key, val] of Object.entries(evalResult)) {
      if (!val) {
        throw new Error(`Failed check in root index.html: ${key} is false`);
      }
    }

    console.log('\n[2] Testing www/index.html with Lyrics Engine...');
    await win.loadFile(path.join(__dirname, '../www/index.html'));

    const evalWww = await win.webContents.executeJavaScript(`
      (() => {
        return {
          hasGPLyrics: typeof window.GP?.Lyrics !== 'undefined',
          hasOpen: typeof window.openLyricsOverlay === 'function',
          hasClose: typeof window.closeLyricsOverlay === 'function',
          hasSync: typeof window.syncLyricsToTime === 'function',
          hasOverlayEl: !!document.getElementById('lyrics-overlay'),
          hasContentEl: !!document.getElementById('lyrics-content')
        };
      })()
    `);

    console.log('WWW index.html Lyrics Eval:', JSON.stringify(evalWww, null, 2));

    for (const [key, val] of Object.entries(evalWww)) {
      if (!val) {
        throw new Error(`Failed check in www/index.html: ${key} is false`);
      }
    }

    if (errors.length > 0) {
      console.warn('Errors captured during run:', errors);
      process.exit(1);
    }

    console.log('\n====================================================');
    console.log('      ELECTRON LYRICS ENGINE TEST PASSED (100% OK)   ');
    console.log('====================================================\n');
    app.exit(0);
  } catch (err) {
    console.error('\n[FATAL ERROR IN TEST]:', err.message);
    app.exit(1);
  }
});
