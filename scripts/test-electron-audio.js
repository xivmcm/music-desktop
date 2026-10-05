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
    if (level >= 3 || msg.includes('ReferenceError') || msg.includes('SyntaxError')) {
      if (!msg.includes('Discord') && !msg.includes('Content-Security-Policy')) {
        errors.push(`[Console Error] ${msg} (${src}:${line})`);
      }
    }
  });

  try {
    console.log('[1] Testing root index.html with Audio Engine...');
    await win.loadFile(path.join(__dirname, '../index.html'));

    const evalResult = await win.webContents.executeJavaScript(`
      (() => {
        // Test audio engine exports
        const hasGPAudio = typeof window.GP?.Audio !== 'undefined';
        const hasInitEffects = typeof window.initAudioEffects === 'function';
        const hasSetEq = typeof window.setEqBand === 'function';
        const hasSetBass = typeof window.setBassBoost === 'function';

        // Initialize audio context on the player element
        const ctx = window.GP.Audio.initAudioContext();
        const hasCtx = Boolean(ctx);
        const hasAnalyser = Boolean(window.analyser || window.GP.Audio.getAnalyser());
        const hasDataArray = Boolean(window.dataArray || window.GP.Audio.getDataArray());
        const hasEqFilters = Array.isArray(window.eqFilters) && window.eqFilters.length === 5;
        const hasBassFilter = Boolean(window.bassFilter);

        // Test EQ modification
        window.setEqBand(60, 3);
        const eq60Gain = window.eqFilters[0]?.gain?.value;

        // Test bass boost toggle
        window.setBassBoost(true);
        const bassGain = window.bassFilter?.gain?.value;

        return {
          hasGPAudio,
          hasInitEffects,
          hasSetEq,
          hasSetBass,
          hasCtx,
          hasAnalyser,
          hasDataArray,
          hasEqFilters,
          hasBassFilter,
          eq60Gain,
          bassGain
        };
      })()
    `);

    console.log('Root index.html Audio Eval:', JSON.stringify(evalResult, null, 2));

    if (!evalResult.hasGPAudio || !evalResult.hasCtx || !evalResult.hasAnalyser || evalResult.eq60Gain !== 3 || evalResult.bassGain !== 10) {
      throw new Error('Audio engine validation failed on root index.html!');
    }

    console.log('\n[2] Testing www/index.html with Audio Engine...');
    await win.loadFile(path.join(__dirname, '../www/index.html'));

    const evalWww = await win.webContents.executeJavaScript(`
      (() => {
        const hasGPAudio = typeof window.GP?.Audio !== 'undefined';
        const ctx = window.GP.Audio.initAudioContext();
        const hasAnalyser = Boolean(window.analyser);
        return { hasGPAudio, hasCtx: Boolean(ctx), hasAnalyser };
      })()
    `);

    console.log('WWW index.html Audio Eval:', JSON.stringify(evalWww, null, 2));

    if (!evalWww.hasGPAudio || !evalWww.hasCtx || !evalWww.hasAnalyser) {
      throw new Error('Audio engine validation failed on www/index.html!');
    }

    if (errors.length > 0) {
      console.warn('\nCaptured console errors/warnings:');
      errors.forEach(e => console.warn('  ' + e));
    }

    console.log('\n====================================================');
    console.log('  ELECTRON AUDIO ENGINE SMOKE TEST PASSED (100% OK)');
    console.log('====================================================\n');
    app.exit(0);
  } catch (err) {
    console.error('[FATAL ERROR IN ELECTRON AUDIO SMOKE TEST]', err);
    app.exit(1);
  }
});
