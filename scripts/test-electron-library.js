/**
 * Electron Smoke Test for GlassPlayer Media Library, Favorites & Playback History Module
 * Tests runtime namespaces, global aliases, likes reactive state, local collection, and history queue in Electron.
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
    console.log('\n[1] Testing root index.html with Library & History View...');
    await win.loadFile(path.join(__dirname, '../index.html'));

    const rootEval = await win.webContents.executeJavaScript(`
      (async () => {
        const hasGPLibrary = typeof window.GP?.Views?.Library !== 'undefined';
        const hasGetLikedTracks = typeof window.getLikedTracks === 'function';
        const hasSaveLikedTracks = typeof window.saveLikedTracks === 'function';
        const hasLoadLikedTracks = typeof window.loadLikedTracks === 'function';
        const hasToggleLike = typeof window.toggleLike === 'function';
        const hasUpdateLikeUI = typeof window.updateLikeUI === 'function';
        const hasLoadFavorites = typeof window.loadFavorites === 'function';
        const hasRenderLocalTracks = typeof window.renderLocalTracks === 'function';
        const hasGetPlayHistory = typeof window.getPlayHistory === 'function';
        const hasSavePlayHistory = typeof window.savePlayHistory === 'function';
        const hasAddToHistory = typeof window.addToHistory === 'function';
        const hasClearHistory = typeof window.clearHistory === 'function';
        const hasLoadHistoryView = typeof window.loadHistoryView === 'function';
        const hasRenderHistory = typeof window.renderHistory === 'function';

        const isLikedTrackIdsSet = window.likedTrackIds instanceof Set;
        const initialSubTab = window.currentLibrarySubTab;

        // Test toggleLike in Electron runtime
        const testTrack = {
          id: 'test_el_track_1',
          title: 'Electron Test Song',
          artist: 'Glass Artist',
          source: 'cloud',
          duration: 210,
          thumbnail: 'test.jpg'
        };

        await window.toggleLike(null, testTrack);
        const likedAfterToggle = window.likedTrackIds.has('test_el_track_1');
        const storedLikes = window.getLikedTracks();
        const storedOk = storedLikes.some(t => t.id === 'test_el_track_1');

        // Toggle back off
        await window.toggleLike(null, testTrack);
        const unlikedAfterToggle = !window.likedTrackIds.has('test_el_track_1');

        // Test loadFavorites
        await window.loadFavorites('favorites');
        const viewIsLibrary = window.activeView === 'library';
        const subTabIsFavs = window.currentLibrarySubTab === 'favorites';

        // Test loadFavorites('local')
        await window.loadFavorites('local');
        const subTabIsLocal = window.currentLibrarySubTab === 'local';
        const tracksContainer = document.getElementById('tracks-container');
        const hasContainer = tracksContainer !== null;

        // Test addToHistory & renderHistory
        window.addToHistory(testTrack);
        const histAfterAdd = window.getPlayHistory();
        const histAddedOk = histAfterAdd.some(t => t.id === 'test_el_track_1');

        window.renderHistory();
        const historyQueueActive = Array.isArray(window.playlist) && window.playlist.some(t => t.id === 'test_el_track_1');

        // Clean up history
        window.clearHistory();
        const histCleared = window.getPlayHistory().length === 0;

        return {
          hasGPLibrary,
          hasGetLikedTracks,
          hasSaveLikedTracks,
          hasLoadLikedTracks,
          hasToggleLike,
          hasUpdateLikeUI,
          hasLoadFavorites,
          hasRenderLocalTracks,
          hasGetPlayHistory,
          hasSavePlayHistory,
          hasAddToHistory,
          hasClearHistory,
          hasLoadHistoryView,
          hasRenderHistory,
          isLikedTrackIdsSet,
          initialSubTab,
          likedAfterToggle,
          storedOk,
          unlikedAfterToggle,
          viewIsLibrary,
          subTabIsFavs,
          subTabIsLocal,
          hasContainer,
          histAddedOk,
          historyQueueActive,
          histCleared
        };
      })()
    `);

    console.log('Root index.html evaluation:', rootEval);
    for (const [key, val] of Object.entries(rootEval)) {
      if (val !== true && key !== 'initialSubTab') {
        throw new Error(`Root test failed for ${key}: expected true, got ${val}`);
      }
    }
    if (rootEval.initialSubTab !== 'favorites') {
      throw new Error(`Expected initialSubTab 'favorites', got ${rootEval.initialSubTab}`);
    }

    console.log('\n[2] Testing www/index.html with Library & History View...');
    await win.loadFile(path.join(__dirname, '../www/index.html'));

    const wwwEval = await win.webContents.executeJavaScript(`
      (async () => {
        const hasGPLibrary = typeof window.GP?.Views?.Library !== 'undefined';
        const hasToggleLike = typeof window.toggleLike === 'function';
        const hasLoadFavorites = typeof window.loadFavorites === 'function';
        const hasAddToHistory = typeof window.addToHistory === 'function';
        const isLikedTrackIdsSet = window.likedTrackIds instanceof Set;

        const testTrack = {
          id: 'test_www_track_1',
          title: 'WWW Test Song',
          artist: 'WWW Artist'
        };

        await window.toggleLike(null, testTrack);
        const liked = window.likedTrackIds.has('test_www_track_1');
        await window.toggleLike(null, testTrack);
        const unliked = !window.likedTrackIds.has('test_www_track_1');

        window.addToHistory(testTrack);
        const histOk = window.getPlayHistory().some(t => t.id === 'test_www_track_1');
        window.clearHistory();

        return {
          hasGPLibrary,
          hasToggleLike,
          hasLoadFavorites,
          hasAddToHistory,
          isLikedTrackIdsSet,
          liked,
          unliked,
          histOk
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
    console.log('ALL ELECTRON SMOKE TESTS PASSED!');
    console.log('========================================\n');
    app.quit();
    process.exit(0);

  } catch (err) {
    console.error('\n[FAIL] Electron test encountered an error:', err);
    app.quit();
    process.exit(1);
  }
});
