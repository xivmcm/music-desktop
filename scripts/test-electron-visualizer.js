/**
 * Electron Smoke Test for GlassPlayer Visualizer & Ambient Modules
 * Tests both index.html and www/index.html in a headless Electron browser window.
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
    console.log('[1] Testing root index.html with Visualizer & Ambient...');
    await win.loadFile(path.join(__dirname, '../index.html'));

    const evalResult = await win.webContents.executeJavaScript(`
      (() => {
        return {
          hasGPAmbient: typeof window.GP?.Ambient !== 'undefined',
          hasGPVisualizer: typeof window.GP?.Visualizer !== 'undefined',
          hasParticle: typeof window.Particle === 'function',
          hasStartVisualizer: typeof window.startVisualizer === 'function',
          hasStopVisualizer: typeof window.stopVisualizer === 'function',
          hasResizeCanvas: typeof window.resizeCanvas === 'function',
          hasApplyBgEffect: typeof window.applyBgEffect === 'function',
          hasStartAmbient: typeof window.startAmbientParticles === 'function',
          hasStopAmbient: typeof window.stopAmbientParticles === 'function',
          ambientCanvasFound: !!document.getElementById('ambient-canvas'),
          visualizerCanvasFound: !!document.getElementById('player-visualizer'),
          hasAudioEngine: typeof window.GP?.Audio !== 'undefined',
          hasUtils: typeof window.GP?.Utils !== 'undefined'
        };
      })()
    `);

    console.log('Root index.html Visualizer Eval:', JSON.stringify(evalResult, null, 2));

    for (const [key, val] of Object.entries(evalResult)) {
      if (!val) {
        throw new Error(`Failed check in root index.html: ${key} is false`);
      }
    }

    console.log('\n[2] Testing www/index.html with Visualizer & Ambient...');
    await win.loadFile(path.join(__dirname, '../www/index.html'));

    const evalWww = await win.webContents.executeJavaScript(`
      (() => {
        return {
          hasGPAmbient: typeof window.GP?.Ambient !== 'undefined',
          hasGPVisualizer: typeof window.GP?.Visualizer !== 'undefined',
          hasParticle: typeof window.Particle === 'function',
          hasStartVisualizer: typeof window.startVisualizer === 'function',
          hasStopVisualizer: typeof window.stopVisualizer === 'function',
          ambientCanvasFound: !!document.getElementById('ambient-canvas'),
          visualizerCanvasFound: !!document.getElementById('player-visualizer')
        };
      })()
    `);

    console.log('WWW index.html Visualizer Eval:', JSON.stringify(evalWww, null, 2));

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
    console.log('  ELECTRON VISUALIZER & AMBIENT TEST PASSED (100% OK)');
    console.log('====================================================\n');
    app.exit(0);
  } catch (err) {
    console.error('\n[FATAL ERROR IN TEST]:', err.message);
    app.exit(1);
  }
});
