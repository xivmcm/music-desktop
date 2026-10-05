/**
 * Electron Smoke Test for GlassPlayer Core Player & Queue Controller
 * Tests runtime namespaces, global aliases, and DOM controls in Chromium/Electron.
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
    console.log('[1] Testing root index.html with Player Controller...');
    await win.loadFile(path.join(__dirname, '../index.html'));

    const evalResult = await win.webContents.executeJavaScript(`
      (() => {
        const hasGPPlayer = typeof window.GP?.Player !== 'undefined';
        const hasPlayTrack = typeof window.playTrack === 'function';
        const hasTogglePlay = typeof window.togglePlay === 'function';
        const hasPlayNext = typeof window.playNext === 'function';
        const hasPlayPrev = typeof window.playPrev === 'function';
        const hasSeekToPercent = typeof window.seekToPercent === 'function';
        const hasToggleShuffle = typeof window.toggleShuffle === 'function';
        const hasToggleRepeat = typeof window.toggleRepeat === 'function';
        const hasSetPlayState = typeof window.setPlayState === 'function';
        const hasGetAudioStreamUrl = typeof window.getAudioStreamUrl === 'function';

        const isPlaylistArray = Array.isArray(window.playlist);
        const hasCurrentTrackIndex = typeof window.currentTrackIndex === 'number';
        const hasIsShuffle = typeof window.isShuffle === 'boolean';
        const hasIsRepeat = typeof window.isRepeat === 'boolean';

        // Check DOM elements
        const audioPlayer = document.getElementById('audio-player');
        const playBtn = document.getElementById('play-button');
        const nextBtn = document.getElementById('next-button');
        const prevBtn = document.getElementById('prev-button');
        const progressSlider = document.getElementById('progress-slider');
        const shuffleBtn = document.getElementById('shuffle-button');
        const repeatBtn = document.getElementById('repeat-button');

        // Test queue operation
        window.playlist = [
          { id: 't1', title: 'Smoke Test 1', artist: 'Artist 1', duration: '3:00', source: 'soundcloud' },
          { id: 't2', title: 'Smoke Test 2', artist: 'Artist 2', duration: '4:00', source: 'soundcloud' }
        ];

        // Test shuffle toggle
        const initialShuffle = window.isShuffle;
        window.toggleShuffle();
        const toggledShuffle = window.isShuffle !== initialShuffle;
        window.toggleShuffle(false); // Reset

        // Test repeat toggle
        const initialRepeat = window.isRepeat;
        window.toggleRepeat();
        const toggledRepeat = window.isRepeat !== initialRepeat;
        window.toggleRepeat(false); // Reset

        return {
          hasGPPlayer,
          hasPlayTrack,
          hasTogglePlay,
          hasPlayNext,
          hasPlayPrev,
          hasSeekToPercent,
          hasToggleShuffle,
          hasToggleRepeat,
          hasSetPlayState,
          hasGetAudioStreamUrl,
          isPlaylistArray,
          hasCurrentTrackIndex,
          hasIsShuffle,
          hasIsRepeat,
          hasAudioPlayerEl: !!audioPlayer,
          hasPlayBtnEl: !!playBtn,
          hasNextBtnEl: !!nextBtn,
          hasPrevBtnEl: !!prevBtn,
          hasProgressSliderEl: !!progressSlider,
          hasShuffleBtnEl: !!shuffleBtn,
          hasRepeatBtnEl: !!repeatBtn,
          toggledShuffle,
          toggledRepeat,
          hasSocial: typeof window.GP?.Social !== 'undefined',
          hasLyrics: typeof window.GP?.Lyrics !== 'undefined',
          hasTheme: typeof window.GP?.Theme !== 'undefined',
          hasLocalDB: typeof window.GP?.LocalDB !== 'undefined',
          hasVisualizer: typeof window.GP?.Visualizer !== 'undefined',
          hasAudio: typeof window.GP?.Audio !== 'undefined',
          hasUtils: typeof window.GP?.Utils !== 'undefined'
        };
      })()
    `);

    console.log('Root index.html Player Eval:', JSON.stringify(evalResult, null, 2));

    for (const [key, val] of Object.entries(evalResult)) {
      if (!val) {
        throw new Error(`Failed check in root index.html: ${key} is false`);
      }
    }

    console.log('\n[2] Testing www/index.html with Player Controller...');
    await win.loadFile(path.join(__dirname, '../www/index.html'));

    const evalWww = await win.webContents.executeJavaScript(`
      (() => {
        return {
          hasGPPlayer: typeof window.GP?.Player !== 'undefined',
          hasPlayTrack: typeof window.playTrack === 'function',
          hasTogglePlay: typeof window.togglePlay === 'function',
          hasPlayNext: typeof window.playNext === 'function',
          hasPlayPrev: typeof window.playPrev === 'function',
          hasToggleShuffle: typeof window.toggleShuffle === 'function',
          hasToggleRepeat: typeof window.toggleRepeat === 'function',
          isPlaylistArray: Array.isArray(window.playlist),
          hasAudioPlayerEl: !!document.getElementById('audio-player'),
          hasPlayBtnEl: !!document.getElementById('play-button')
        };
      })()
    `);

    console.log('WWW index.html Player Eval:', JSON.stringify(evalWww, null, 2));

    for (const [key, val] of Object.entries(evalWww)) {
      if (!val) {
        throw new Error(`Failed check in www/index.html: ${key} is false`);
      }
    }

    if (errors.length > 0) {
      console.error('\nConsole errors detected during run:');
      errors.forEach(e => console.error(e));
      process.exit(1);
    }

    console.log('\n====================================================');
    console.log('ELECTRON PLAYER SMOKE TEST PASSED WITH 0 ERRORS');
    console.log('====================================================');
    app.exit(0);
  } catch (err) {
    console.error('Test failed with error:', err);
    app.exit(1);
  }
});
