/**
 * Electron Smoke Test for GlassPlayer Local Library & Dropzone Modules
 * Tests IndexedDB CRUD operations and Dropzone in real Electron Chromium environment.
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
    console.log('[1] Testing root index.html with LocalDB & Dropzone...');
    await win.loadFile(path.join(__dirname, '../index.html'));

    const evalResult = await win.webContents.executeJavaScript(`
      (async () => {
        const hasGPLocalDB = typeof window.GP?.LocalDB !== 'undefined';
        const hasGPDropzone = typeof window.GP?.Dropzone !== 'undefined';
        const hasSaveTrack = typeof window.saveLocalTrack === 'function';
        const hasGetTracks = typeof window.getLocalTracks === 'function';
        const hasDeleteTrack = typeof window.deleteLocalTrack === 'function';
        const hasInitDropzone = typeof window.initDropzone === 'function';

        // Test real IndexedDB CRUD
        const testBlob = new Blob(['RIFF....WAVEfmt '], { type: 'audio/wav' });
        const testFile = new File([testBlob], 'TestArtist - TestSong.wav', { type: 'audio/wav' });
        
        const saved = await window.saveLocalTrack(testFile);
        const tracks = await window.getLocalTracks();
        const found = tracks.find(t => t.id === saved.id);

        let crudSuccess = false;
        if (found && found.title === 'TestSong' && found.artist === 'TestArtist' && found.streamUrl.startsWith('blob:')) {
          await window.deleteLocalTrack(saved.id);
          const afterDelete = await window.getLocalTracks();
          const stillThere = afterDelete.some(t => t.id === saved.id);
          crudSuccess = !stillThere;
        }

        return {
          hasGPLocalDB,
          hasGPDropzone,
          hasSaveTrack,
          hasGetTracks,
          hasDeleteTrack,
          hasInitDropzone,
          crudSuccess,
          hasAudioEngine: typeof window.GP?.Audio !== 'undefined',
          hasVisualizer: typeof window.GP?.Visualizer !== 'undefined',
          hasUtils: typeof window.GP?.Utils !== 'undefined'
        };
      })()
    `);

    console.log('Root index.html LocalDB & Dropzone Eval:', JSON.stringify(evalResult, null, 2));

    for (const [key, val] of Object.entries(evalResult)) {
      if (!val) {
        throw new Error(`Failed check in root index.html: ${key} is false`);
      }
    }

    console.log('\n[2] Testing www/index.html with LocalDB & Dropzone...');
    await win.loadFile(path.join(__dirname, '../www/index.html'));

    const evalWww = await win.webContents.executeJavaScript(`
      (() => {
        return {
          hasGPLocalDB: typeof window.GP?.LocalDB !== 'undefined',
          hasGPDropzone: typeof window.GP?.Dropzone !== 'undefined',
          hasSaveTrack: typeof window.saveLocalTrack === 'function',
          hasGetTracks: typeof window.getLocalTracks === 'function',
          hasDeleteTrack: typeof window.deleteLocalTrack === 'function'
        };
      })()
    `);

    console.log('WWW index.html LocalDB Eval:', JSON.stringify(evalWww, null, 2));

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
    console.log('  ELECTRON LOCAL LIBRARY & DROPZONE TEST PASSED (100% OK)');
    console.log('====================================================\n');
    app.exit(0);
  } catch (err) {
    console.error('\n[FATAL ERROR IN TEST]:', err.message);
    app.exit(1);
  }
});
