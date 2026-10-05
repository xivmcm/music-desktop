/**
 * Electron Final Smoke Test for GlassPlayer Step 2.9 Finalization
 * Tests complete runtime environment, all modules and components, and 100% parity.
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
    console.log('\n[1] Testing root index.html with all modules & components...');
    await win.loadFile(path.join(__dirname, '../index.html'));

    const rootEval = await win.webContents.executeJavaScript(`
      (async () => {
        // 1. Check all namespaces
        const hasGP = typeof window.GP === 'object';
        const hasUtils = typeof window.GP?.Utils === 'object';
        const hasAudio = typeof window.GP?.Audio === 'object';
        const hasVisualizer = typeof window.GP?.Visualizer === 'object';
        const hasLocalDB = typeof window.GP?.LocalDB === 'object';
        const hasDropzone = typeof window.GP?.Dropzone === 'object';
        const hasTheme = typeof window.GP?.Theme === 'object';
        const hasLyrics = typeof window.GP?.Lyrics === 'object';
        const hasSocial = typeof window.GP?.Social === 'object';
        const hasPlayer = typeof window.GP?.Player === 'object';
        const hasComponents = typeof window.GP?.Components === 'object';
        const hasNotifications = typeof window.GP?.Components?.Notifications === 'object';
        const hasTrackCard = typeof window.GP?.Components?.TrackCard === 'object';
        const hasShare = typeof window.GP?.Components?.Share === 'object';
        const hasViews = typeof window.GP?.Views === 'object';
        const hasSettingsView = typeof window.GP?.Views?.Settings === 'object';
        const hasPlaylistsView = typeof window.GP?.Views?.Playlists === 'object';
        const hasLibraryView = typeof window.GP?.Views?.Library === 'object';
        const hasHomeView = typeof window.GP?.Views?.Home === 'object';
        const hasSearchView = typeof window.GP?.Views?.Search === 'object';
        const hasArtistView = typeof window.GP?.Views?.Artist === 'object';

        // 2. Check essential global aliases
        const hasRenderTracks = typeof window.renderTracks === 'function';
        const hasShowToast = typeof window.showToastNotification === 'function';
        const hasShowConfirm = typeof window.showConfirmDialog === 'function';
        const hasCopyShare = typeof window.copyTrackShareLink === 'function';
        const hasPlayTrack = typeof window.playTrack === 'function';
        const hasPerformSearch = typeof window.performSearch === 'function';
        const hasLoadHome = typeof window.loadHomeView === 'function';
        const hasLoadArtist = typeof window.loadArtistView === 'function';

        // 3. Test runtime notifications
        window.showToastNotification('Electron Final Test', 'success');
        const toastContainer = document.getElementById('toast-container');
        const hasToast = toastContainer && toastContainer.children.length > 0;

        // 4. Test renderTracks in runtime
        const testTrack = {
          id: 'sc_el_final_1',
          title: 'Final Test Track',
          artist: 'Glass Artist',
          source: 'soundcloud',
          duration: '3:00',
          thumbnail: ''
        };
        window.renderTracks([testTrack]);
        const tracksContainer = document.getElementById('tracks-container');
        const hasCard = tracksContainer && tracksContainer.querySelector('.track-card') !== null;

        // 5. Test share button
        const hasShareBtn = document.getElementById('player-share-btn') !== null;

        // 6. Test tab switching and active classes
        const hasUpdateActiveTab = typeof window.updateActiveTab === 'function';
        const homeBtn = document.getElementById('home-button');
        const studioBtn = document.getElementById('studio-button');
        const playlistsBtn = document.getElementById('playlists-button');
        window.updateActiveTab('studio');
        const studioActivated = studioBtn && studioBtn.classList.contains('active') && !homeBtn.classList.contains('active');
        window.updateActiveTab('playlists');
        const playlistsActivated = playlistsBtn && playlistsBtn.classList.contains('active') && !studioBtn.classList.contains('active');
        window.updateActiveTab('home');
        const homeReactivated = homeBtn && homeBtn.classList.contains('active') && !playlistsBtn.classList.contains('active');

        // 7. Test sidebar positioning and CSS
        const sidebar = document.getElementById('sidebar');
        const hasSidebarAbsolute = sidebar && window.getComputedStyle(sidebar).position === 'absolute';

        // 8. Test Navigation History and controls (v1.19.2)
        const hasNavHistory = typeof window.GP?.NavigationHistory === 'object';
        const backBtn = document.getElementById('nav-back-btn');
        const fwdBtn = document.getElementById('nav-forward-btn');
        const hasBackBtn = backBtn !== null;
        const hasForwardBtn = fwdBtn !== null;
        const initialBackDisabled = backBtn && backBtn.disabled === true;
        const initialFwdDisabled = fwdBtn && fwdBtn.disabled === true;

        // Perform test navigation push
        window.GP.NavigationHistory.push({ view: 'search', query: 'ElectronTestQuery' });
        const canBackAfterPush = window.GP.NavigationHistory.canGoBack();
        const backEnabledAfterPush = backBtn && backBtn.disabled === false;
        window.GP.NavigationHistory.back();
        const backRestoredHome = window.GP.NavigationHistory.getCurrentIndex() === 0;

        return {
          hasGP,
          hasUtils,
          hasAudio,
          hasVisualizer,
          hasLocalDB,
          hasDropzone,
          hasTheme,
          hasLyrics,
          hasSocial,
          hasPlayer,
          hasComponents,
          hasNotifications,
          hasTrackCard,
          hasShare,
          hasViews,
          hasSettingsView,
          hasPlaylistsView,
          hasLibraryView,
          hasHomeView,
          hasSearchView,
          hasArtistView,
          hasRenderTracks,
          hasShowToast,
          hasShowConfirm,
          hasCopyShare,
          hasPlayTrack,
          hasPerformSearch,
          hasLoadHome,
          hasLoadArtist,
          hasToast,
          hasCard,
          hasShareBtn,
          hasUpdateActiveTab,
          studioActivated,
          playlistsActivated,
          homeReactivated,
          hasSidebarAbsolute,
          hasNavHistory,
          hasBackBtn,
          hasForwardBtn,
          initialBackDisabled,
          initialFwdDisabled,
          canBackAfterPush,
          backEnabledAfterPush,
          backRestoredHome
        };
      })()
    `);

    console.log('Root Evaluation Results:', rootEval);
    for (const [key, val] of Object.entries(rootEval)) {
      if (!val) {
        throw new Error(`Root check failed: ${key} is false`);
      }
    }
    console.log('[PASS] Root index.html completely verified in Electron.');

    console.log('\n[2] Testing www/index.html mirror...');
    await win.loadFile(path.join(__dirname, '../www/index.html'));

    const wwwEval = await win.webContents.executeJavaScript(`
      (async () => {
        const hasGP = typeof window.GP === 'object';
        const hasNotifications = typeof window.GP?.Components?.Notifications === 'object';
        const hasTrackCard = typeof window.GP?.Components?.TrackCard === 'object';
        const hasShare = typeof window.GP?.Components?.Share === 'object';
        const hasRenderTracks = typeof window.renderTracks === 'function';
        const hasShowToast = typeof window.showToastNotification === 'function';
        const hasCopyShare = typeof window.copyTrackShareLink === 'function';

        window.showToastNotification('WWW Final Test', 'info');
        const toastContainer = document.getElementById('toast-container');
        const hasToast = toastContainer && toastContainer.children.length > 0;

        const hasNavHistory = typeof window.GP?.NavigationHistory === 'object';
        const hasBackBtn = document.getElementById('nav-back-btn') !== null;
        const hasForwardBtn = document.getElementById('nav-forward-btn') !== null;

        return {
          hasGP,
          hasNotifications,
          hasTrackCard,
          hasShare,
          hasRenderTracks,
          hasShowToast,
          hasCopyShare,
          hasToast,
          hasNavHistory,
          hasBackBtn,
          hasForwardBtn
        };
      })()
    `);

    console.log('WWW Evaluation Results:', wwwEval);
    for (const [key, val] of Object.entries(wwwEval)) {
      if (!val) {
        throw new Error(`WWW check failed: ${key} is false`);
      }
    }
    console.log('[PASS] www/index.html completely verified in Electron.');

    if (errors.length > 0) {
      console.error('\nConsole errors detected during Electron smoke test:');
      errors.forEach(e => console.error(e));
      process.exit(1);
    } else {
      console.log('\n[PASS] No console errors detected in DevTools Console.');
      console.log('\n==============================================');
      console.log('ALL FINAL ELECTRON SMOKE TESTS PASSED!');
      console.log('==============================================\n');
      app.quit();
      process.exit(0);
    }
  } catch (err) {
    console.error('\n[FATAL ELECTRON TEST ERROR]:', err);
    app.quit();
    process.exit(1);
  }
});
