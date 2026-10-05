/**
 * Electron Smoke Test for GlassPlayer Theme Engine Module
 * Tests CSS variables computation, theme switching, and DOM integrity in Chromium/Electron.
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
      if (!msg.includes('Discord') && !msg.includes('Content-Security-Policy')) {
        errors.push(`[Console Error] ${msg} (${src}:${line})`);
      }
    }
  });

  try {
    console.log('[1] Testing root index.html with Theme Engine...');
    await win.loadFile(path.join(__dirname, '../index.html'));

    const evalResult = await win.webContents.executeJavaScript(`
      (() => {
        const hasGPTheme = typeof window.GP?.Theme !== 'undefined';
        const hasApplyTheme = typeof window.applyTheme === 'function';
        const hasApplyCustom = typeof window.applyCustomTheme === 'function';
        const hasCommitCustom = typeof window.commitCustomTheme === 'function';
        const hasNormalize = typeof window.normalizeCustomTheme === 'function';
        const hasDefaultTheme = typeof window.DEFAULT_CUSTOM_THEME === 'object';

        // Check CSS variables on root document
        const style = window.getComputedStyle(document.documentElement);
        const accent = style.getPropertyValue('--accent-color').trim();
        const font = style.getPropertyValue('--font-family').trim();

        // Switch to custom theme and test variable injection
        window.applyCustomTheme({
          bgColor1: '#332211',
          bgColor2: '#112233',
          accentColor: '#44bb88'
        });

        const updatedStyle = window.getComputedStyle(document.documentElement);
        const updatedAccent = updatedStyle.getPropertyValue('--accent-color').trim();
        const updatedBgGrad = updatedStyle.getPropertyValue('--bg-gradient').trim();

        return {
          hasGPTheme,
          hasApplyTheme,
          hasApplyCustom,
          hasCommitCustom,
          hasNormalize,
          hasDefaultTheme,
          hasAccent: accent.length > 0,
          hasFont: font.length > 0,
          updatedAccentMatches: updatedAccent === '#44bb88',
          updatedBgGradInjected: updatedBgGrad.includes('#332211'),
          hasLocalDB: typeof window.GP?.LocalDB !== 'undefined',
          hasVisualizer: typeof window.GP?.Visualizer !== 'undefined',
          hasAudio: typeof window.GP?.Audio !== 'undefined',
          hasUtils: typeof window.GP?.Utils !== 'undefined'
        };
      })()
    `);

    console.log('Root index.html Theme Eval:', JSON.stringify(evalResult, null, 2));

    for (const [key, val] of Object.entries(evalResult)) {
      if (!val) {
        throw new Error(`Failed check in root index.html: ${key} is false`);
      }
    }

    console.log('\n[2] Testing www/index.html with Theme Engine...');
    await win.loadFile(path.join(__dirname, '../www/index.html'));

    const evalWww = await win.webContents.executeJavaScript(`
      (() => {
        return {
          hasGPTheme: typeof window.GP?.Theme !== 'undefined',
          hasApplyTheme: typeof window.applyTheme === 'function',
          hasApplyCustom: typeof window.applyCustomTheme === 'function',
          hasCommitCustom: typeof window.commitCustomTheme === 'function',
          hasDefaultTheme: typeof window.DEFAULT_CUSTOM_THEME === 'object'
        };
      })()
    `);

    console.log('WWW index.html Theme Eval:', JSON.stringify(evalWww, null, 2));

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
    console.log('       ELECTRON THEME ENGINE TEST PASSED (100% OK)   ');
    console.log('====================================================\n');
    app.exit(0);
  } catch (err) {
    console.error('\n[FATAL ERROR IN TEST]:', err.message);
    app.exit(1);
  }
});
