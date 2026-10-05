/**
 * Electron Smoke Test for GlassPlayer Home View, Recommendations & Carousel Module
 * Tests runtime namespaces, global aliases, carousel interactions, and Spotify mood cards in Electron.
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
      if (!msg.includes('Discord') && !msg.includes('Content-Security-Policy') && !msg.includes('URLSearchParams') && !msg.includes('fetch-lyrics') && !msg.includes('Spotify Recommendations') && !msg.includes('Failed to fetch')) {
        errors.push(`[Console Error] ${msg} (${src}:${line})`);
      }
    }
  });

  try {
    console.log('\n[1] Testing root index.html with Home View...');
    await win.loadFile(path.join(__dirname, '../index.html'));

    const rootEval = await win.webContents.executeJavaScript(`
      (async () => {
        const hasGPHome = typeof window.GP?.Views?.Home !== 'undefined';
        const hasLoadHomeView = typeof window.loadHomeView === 'function';
        const hasRenderHome = typeof window.renderHome === 'function';
        const hasRenderCarousel = typeof window.renderCarousel === 'function';
        const hasInvalidate = typeof window.invalidateHomeRecommendations === 'function';
        const hasGetGreeting = typeof window.getGreeting === 'function';
        const hasRenderTrackCardHorizontal = typeof window.renderTrackCardHorizontal === 'function';
        const hasRenderSpotifyHome = typeof window.renderSpotifyHome === 'function';
        const hasMoodCards = Array.isArray(window.MOOD_CARDS);

        const initialSource = window.activeHomeSource;

        // Test renderHome with sample sections and forYou data
        const sampleTracks = [
          { id: 'el_home_1', title: 'Electron Home Track 1', artist: 'Artist A', source: 'soundcloud', duration: '3:30', thumbnail: 'cover1.jpg' },
          { id: 'el_home_2', title: 'Electron Home Track 2', artist: 'Artist B', source: 'soundcloud', duration: '4:15', thumbnail: 'cover2.jpg' }
        ];

        window.renderHome(
          { trending: sampleTracks, top: sampleTracks },
          { source: 'Рекомендовано вам', tracks: sampleTracks, personalized: true }
        );

        const tracksContainer = document.getElementById('tracks-container');
        const hasHeader = document.querySelector('.home-welcome-header') !== null;
        const hasGreeting = hasHeader && document.querySelector('.welcome-greeting h2') !== null;
        const hasCapsule = document.querySelector('.sources-pill-capsule') !== null;
        const hasCarousel = document.querySelector('.carousel-banner-section') !== null;
        const hasGenreSection = document.querySelector('.genre-scroll-section') !== null;
        const hasChips = document.querySelectorAll('.genre-chip-btn').length > 0;

        // Test Carousel play-now button
        const playNowBtn = document.querySelector('.carousel-play-now-btn');
        let playStarted = false;
        if (playNowBtn) {
          playNowBtn.click();
          playStarted = Array.isArray(window.playlist) && window.playlist.length > 0;
        }

        // Test Spotify View switch
        window.activeHomeSource = 'spotify';
        window.renderHome({}, {});
        const hasSpotifyContainer = document.querySelector('.spotify-home-container') !== null;
        const hasMoodGrid = document.querySelector('.mood-grid') !== null;
        const hasMoodCardsInGrid = document.querySelectorAll('.mood-card').length === 13;

        // Switch back to soundcloud
        window.activeHomeSource = 'soundcloud';

        // Test cache invalidation
        window.cachedForYouData = { tracks: sampleTracks };
        window.invalidateHomeRecommendations();
        const cacheCleared = window.cachedForYouData === null;

        return {
          hasGPHome,
          hasLoadHomeView,
          hasRenderHome,
          hasRenderCarousel,
          hasInvalidate,
          hasGetGreeting,
          hasRenderTrackCardHorizontal,
          hasRenderSpotifyHome,
          hasMoodCards,
          initialSource,
          hasHeader,
          hasGreeting,
          hasCapsule,
          hasCarousel,
          hasGenreSection,
          hasChips,
          playStarted,
          hasSpotifyContainer,
          hasMoodGrid,
          hasMoodCardsInGrid,
          cacheCleared
        };
      })()
    `);

    console.log('Root index.html evaluation:', rootEval);
    for (const [key, val] of Object.entries(rootEval)) {
      if (val !== true && key !== 'initialSource') {
        throw new Error(`Root test failed for ${key}: expected true, got ${val}`);
      }
    }
    if (rootEval.initialSource !== 'soundcloud') {
      throw new Error(`Expected initialSource 'soundcloud', got ${rootEval.initialSource}`);
    }

    console.log('\n[2] Testing www/index.html with Home View...');
    await win.loadFile(path.join(__dirname, '../www/index.html'));

    const wwwEval = await win.webContents.executeJavaScript(`
      (async () => {
        const hasGPHome = typeof window.GP?.Views?.Home !== 'undefined';
        const hasLoadHomeView = typeof window.loadHomeView === 'function';
        const hasRenderCarousel = typeof window.renderCarousel === 'function';
        const hasRenderHome = typeof window.renderHome === 'function';
        const hasMoodCards = Array.isArray(window.MOOD_CARDS);

        const sampleTracks = [
          { id: 'www_home_1', title: 'WWW Track 1', artist: 'Artist 1', source: 'soundcloud', duration: '2:45' }
        ];

        window.renderHome(
          { trending: sampleTracks },
          { source: 'WWW Рекомендации', tracks: sampleTracks }
        );

        const hasHeader = document.querySelector('.home-welcome-header') !== null;
        const hasCarousel = document.querySelector('.carousel-banner-section') !== null;

        return {
          hasGPHome,
          hasLoadHomeView,
          hasRenderCarousel,
          hasRenderHome,
          hasMoodCards,
          hasHeader,
          hasCarousel
        };
      })()
    `);

    console.log('www/index.html evaluation:', wwwEval);
    for (const [key, val] of Object.entries(wwwEval)) {
      if (val !== true) {
        throw new Error(`WWW test failed for ${key}: expected true, got ${val}`);
      }
    }

    if (errors.length > 0) {
      console.error('\nConsole errors detected during test:');
      errors.forEach(e => console.error(e));
      process.exit(1);
    }

    console.log('\n========================================');
    console.log('ALL ELECTRON HOME SMOKE TESTS PASSED!');
    console.log('========================================\n');
    app.quit();
    process.exit(0);

  } catch (err) {
    console.error('\n[FAIL] Electron test encountered an error:', err);
    app.quit();
    process.exit(1);
  }
});
