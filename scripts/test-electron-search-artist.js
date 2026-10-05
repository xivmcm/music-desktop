/**
 * Electron Smoke Test for GlassPlayer Search View, Infinite Scroll & Artist Profile Modules
 * Tests runtime namespaces, global aliases, DOM rendering, and event handlers in Electron.
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
    console.log('\n[1] Testing root index.html with Search & Artist Views...');
    await win.loadFile(path.join(__dirname, '../index.html'));

    const rootEval = await win.webContents.executeJavaScript(`
      (async () => {
        const hasGPSearch = typeof window.GP?.Views?.Search !== 'undefined';
        const hasGPArtist = typeof window.GP?.Views?.Artist !== 'undefined';

        // Search functions
        const hasPerformSearch = typeof window.performSearch === 'function';
        const hasRenderSearchResults = typeof window.renderSearchResults === 'function';
        const hasLoadMoreTracks = typeof window.loadMoreTracks === 'function';
        const hasUpdateLoadMoreButton = typeof window.updateLoadMoreButton === 'function';
        const hasGetSearchHistory = typeof window.getSearchHistory === 'function';
        const hasShowSearchHistory = typeof window.showSearchHistory === 'function';
        const hasAddToSearchHistory = typeof window.addToSearchHistory === 'function';
        const hasClearSearchHistory = typeof window.clearSearchHistory === 'function';

        // Artist functions
        const hasLoadArtistView = typeof window.loadArtistView === 'function';
        const hasOpenArtistProfile = typeof window.openArtistProfile === 'function';
        const hasCloseArtistProfile = typeof window.closeArtistProfile === 'function';
        const hasRenderArtistProfile = typeof window.renderArtistProfile === 'function';
        const hasRenderArtistProfileError = typeof window.renderArtistProfileError === 'function';
        const hasLoadArtistPlaylist = typeof window.loadArtistPlaylist === 'function';
        const hasIsArtistFollowed = typeof window.isArtistFollowed === 'function';
        const hasToggleFollowArtist = typeof window.toggleFollowArtist === 'function';
        const hasGetFollowedArtists = typeof window.getFollowedArtists === 'function';

        // Reactive properties
        const hasActiveSources = typeof window.activeSources === 'object' && window.activeSources.soundcloud === true;
        const hasCurrentSearchPage = typeof window.currentSearchPage === 'number';

        // Test Artist Profile DOM rendering
        const sampleArtist = {
          id: 'test_artist_42',
          name: 'Bladee Electron',
          followers: 84200,
          avatar: '',
          description: 'Shield Gang artist',
          tracks: [
            { id: 't_sc_1', title: 'Hotel Breakfast', artist: 'Bladee Electron', duration: '2:15' }
          ],
          playlists: [
            { id: 'pl_sc_1', name: 'The Fool', thumbnail: '', tracksCount: 13 }
          ]
        };

        window.renderArtistProfile(sampleArtist);
        const header = document.querySelector('.artist-header');
        const artistName = header ? header.querySelector('h2')?.textContent : '';
        const followBtn = header ? header.querySelector('#follow-artist-btn') : null;

        let followToggled = false;
        if (followBtn) {
          const wasFollowed = window.isArtistFollowed('test_artist_42');
          followBtn.click();
          const isNowFollowed = window.isArtistFollowed('test_artist_42');
          followToggled = (!wasFollowed && isNowFollowed);
        }

        // Test Search History Dropdown
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.value = '';
        window.addToSearchHistory('Yung Lean Test');
        window.showSearchHistory();
        const historyDropdown = document.getElementById('search-history-dropdown');
        const isHistoryVisible = historyDropdown && !historyDropdown.classList.contains('hidden');
        const hasSourcesRow = historyDropdown && historyDropdown.querySelector('.dropdown-sources-row') !== null;

        // Test Pagination button
        window.playlist = new Array(25).fill(null).map((_, i) => ({ id: 'p_' + i, title: 'Track ' + i }));
        window.updateLoadMoreButton(25);
        const hasLoadMoreBtn = document.getElementById('load-more-btn') !== null;

        return {
          hasGPSearch,
          hasGPArtist,
          hasPerformSearch,
          hasRenderSearchResults,
          hasLoadMoreTracks,
          hasUpdateLoadMoreButton,
          hasGetSearchHistory,
          hasShowSearchHistory,
          hasAddToSearchHistory,
          hasClearSearchHistory,
          hasLoadArtistView,
          hasOpenArtistProfile,
          hasCloseArtistProfile,
          hasRenderArtistProfile,
          hasRenderArtistProfileError,
          hasLoadArtistPlaylist,
          hasIsArtistFollowed,
          hasToggleFollowArtist,
          hasGetFollowedArtists,
          hasActiveSources,
          hasCurrentSearchPage,
          hasArtistHeader: !!header,
          artistNameMatches: artistName === 'Bladee Electron',
          followToggled,
          isHistoryVisible,
          hasSourcesRow,
          hasLoadMoreBtn
        };
      })()
    `);

    console.log('Root Evaluation Results:', rootEval);
    for (const [key, val] of Object.entries(rootEval)) {
      if (!val) {
        throw new Error(`Root check failed: ${key} is false`);
      }
    }
    console.log('[PASS] Root index.html Search & Artist Views verified.');

    console.log('\n[2] Testing www/index.html mirror with Search & Artist Views...');
    await win.loadFile(path.join(__dirname, '../www/index.html'));

    const wwwEval = await win.webContents.executeJavaScript(`
      (async () => {
        const hasGPSearch = typeof window.GP?.Views?.Search !== 'undefined';
        const hasGPArtist = typeof window.GP?.Views?.Artist !== 'undefined';
        const hasPerformSearch = typeof window.performSearch === 'function';
        const hasLoadArtistView = typeof window.loadArtistView === 'function';
        const hasActiveSources = typeof window.activeSources === 'object';
        const hasCurrentSearchPage = typeof window.currentSearchPage === 'number';

        const sampleArtist = {
          id: 'test_artist_www',
          name: 'Ecco2k WWW',
          followers: 45000,
          avatar: '',
          description: 'Stockholm designer',
          tracks: [],
          playlists: []
        };

        window.renderArtistProfile(sampleArtist);
        const header = document.querySelector('.artist-header');
        const artistName = header ? header.querySelector('h2')?.textContent : '';

        window.addToSearchHistory('Thaiboy WWW');
        window.showSearchHistory();
        const historyDropdown = document.getElementById('search-history-dropdown');
        const isHistoryVisible = historyDropdown && !historyDropdown.classList.contains('hidden');

        return {
          hasGPSearch,
          hasGPArtist,
          hasPerformSearch,
          hasLoadArtistView,
          hasActiveSources,
          hasCurrentSearchPage,
          hasArtistHeader: !!header,
          artistNameMatches: artistName === 'Ecco2k WWW',
          isHistoryVisible
        };
      })()
    `);

    console.log('WWW Evaluation Results:', wwwEval);
    for (const [key, val] of Object.entries(wwwEval)) {
      if (!val) {
        throw new Error(`WWW check failed: ${key} is false`);
      }
    }
    console.log('[PASS] www/index.html Search & Artist Views verified.');

    if (errors.length > 0) {
      console.error('\nConsole errors detected during Electron smoke test:');
      errors.forEach(e => console.error(e));
      process.exit(1);
    } else {
      console.log('\n[PASS] No console errors detected.');
      console.log('\n==============================================');
      console.log('ALL ELECTRON SMOKE TESTS PASSED!');
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
