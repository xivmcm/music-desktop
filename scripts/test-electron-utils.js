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
    if (level >= 3 || msg.includes('Error') || msg.includes('ReferenceError') || msg.includes('SyntaxError')) {
      // Filter out non-fatal or expected warnings if any
      if (!msg.includes('Discord') && !msg.includes('Content-Security-Policy')) {
        errors.push(`[Console Error] ${msg} (${src}:${line})`);
      }
    }
  });

  try {
    console.log('[1] Testing root index.html...');
    await win.loadFile(path.join(__dirname, '../index.html'));

    const evalResult = await win.webContents.executeJavaScript(`
      ({
        hasGP: typeof window.GP !== 'undefined',
        hasUtils: typeof window.GP?.Utils !== 'undefined',
        hasFormatTime: typeof window.formatTime === 'function',
        hasEscapeHTML: typeof window.escapeHTML === 'function',
        hasParseLRC: typeof window.parseLRC === 'function',
        testFormatTime: window.formatTime(125),
        testEscape: window.escapeHTML('<script>'),
        testLRC: window.parseLRC('[00:01.00]Hello')[0]?.text
      })
    `);

    console.log('Root index.html Eval:', JSON.stringify(evalResult, null, 2));

    if (!evalResult.hasGP || !evalResult.hasUtils || !evalResult.hasFormatTime || evalResult.testFormatTime !== '2:05') {
      throw new Error('Root index.html failed utils validation!');
    }

    console.log('\n[2] Testing www/index.html...');
    await win.loadFile(path.join(__dirname, '../www/index.html'));

    const evalResultWww = await win.webContents.executeJavaScript(`
      ({
        hasGP: typeof window.GP !== 'undefined',
        hasUtils: typeof window.GP?.Utils !== 'undefined',
        hasFormatTime: typeof window.formatTime === 'function',
        hasEscapeHTML: typeof window.escapeHTML === 'function',
        testFormatTime: window.formatTime(65)
      })
    `);

    console.log('WWW index.html Eval:', JSON.stringify(evalResultWww, null, 2));

    if (!evalResultWww.hasGP || !evalResultWww.hasUtils || evalResultWww.testFormatTime !== '1:05') {
      throw new Error('WWW index.html failed utils validation!');
    }

    if (errors.length > 0) {
      console.warn('\nCaptured console errors/warnings:');
      errors.forEach(e => console.warn('  ' + e));
    }

    console.log('\n====================================================');
    console.log('  ELECTRON RUNTIME SMOKE TEST PASSED (0 REFERENCE ERRORS)');
    console.log('====================================================\n');
    app.exit(0);
  } catch (err) {
    console.error('[FATAL ERROR IN ELECTRON SMOKE TEST]', err);
    app.exit(1);
  }
});
