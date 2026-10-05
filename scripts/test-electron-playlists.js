/**
 * Electron Smoke Test for GlassPlayer Playlists & Collections View Module
 * Tests runtime namespaces, global aliases, CRUD, queue integration, and modals in Electron.
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
    console.log('\n[1] Testing root index.html with Playlists View...');
    await win.loadFile(path.join(__dirname, '../index.html'));

    const rootEval = await win.webContents.executeJavaScript(`
      (() => {
        const hasGPPlaylists = typeof window.GP?.Views?.Playlists !== 'undefined';
        const hasGetPlaylists = typeof window.getPlaylists === 'function';
        const hasSavePlaylists = typeof window.savePlaylists === 'function';
        const hasLoadPlaylistsView = typeof window.loadPlaylistsView === 'function';
        const hasRenderPlaylists = typeof window.renderPlaylists === 'function';
        const hasOpenPlaylist = typeof window.openPlaylist === 'function';
        const hasClosePlaylist = typeof window.closePlaylist === 'function';
        const hasCreatePlaylist = typeof window.createPlaylist === 'function';
        const hasDeletePlaylist = typeof window.deletePlaylist === 'function';
        const hasRenamePlaylist = typeof window.renamePlaylist === 'function';
        const hasAddTrack = typeof window.addTrackToPlaylistId === 'function';
        const hasRemoveTrack = typeof window.removeTrackFromPlaylistId === 'function';
        const hasPlayPlaylist = typeof window.playPlaylist === 'function';
        const hasShowMenu = typeof window.showPlaylistMenu === 'function';
        const hasMerge = typeof window.mergeAndSyncPlaylists === 'function';
        const hasLoadFriend = typeof window.loadFriendProfile === 'function';

        // Check DOM elements for modals
        const hasModal = document.getElementById('playlist-modal') !== null;
        const hasInput = document.getElementById('new-playlist-input') !== null;
        const hasCancelBtn = document.getElementById('cancel-playlist-btn') !== null;
        const hasSaveBtn = document.getElementById('save-playlist-btn') !== null;
        const hasMenu = document.getElementById('playlist-menu') !== null;
        const hasMenuList = document.getElementById('playlist-menu-list') !== null;

        // Perform CRUD operations test in Electron runtime
        window.createPlaylist('Electron Rock Mix');
        const playlists = window.getPlaylists();
        const createdPl = playlists.find(p => p.name === 'Electron Rock Mix');
        const createdOk = Boolean(createdPl && createdPl.id);

        if (createdPl) {
          window.addTrackToPlaylistId(createdPl.id, {
            id: 'el_track_1',
            title: 'Rock Anthem',
            artist: 'Electron Band',
            duration: 180,
            thumbnail: 'cover.png'
          });
        }

        const plWithTrack = window.getPlaylists().find(p => p.id === createdPl?.id);
        const trackAdded = Boolean(plWithTrack && plWithTrack.tracks && plWithTrack.tracks.length === 1);

        // Open playlist and test view rendering
        window.openPlaylist(createdPl.id);
        const tracksContainer = document.getElementById('tracks-container');
        const hasPlayAllBtn = document.getElementById('playlist-play-all-btn') !== null;
        const hasBackBtn = document.getElementById('back-to-playlists') !== null;
        const isTracksView = window.activeView === 'playlist-tracks';

        // Test playPlaylist fills queue
        window.playPlaylist(createdPl.id, 0);
        const queueFilled = Array.isArray(window.playlist) && window.playlist.length === 1 && window.playlist[0].id === 'el_track_1';

        // Clean up
        window.deletePlaylist(createdPl.id);
        const isDeleted = !window.getPlaylists().some(p => p.id === createdPl.id);

        return {
          hasGPPlaylists,
          hasGetPlaylists,
          hasSavePlaylists,
          hasLoadPlaylistsView,
          hasRenderPlaylists,
          hasOpenPlaylist,
          hasClosePlaylist,
          hasCreatePlaylist,
          hasDeletePlaylist,
          hasRenamePlaylist,
          hasAddTrack,
          hasRemoveTrack,
          hasPlayPlaylist,
          hasShowMenu,
          hasMerge,
          hasLoadFriend,
          hasModal,
          hasInput,
          hasCancelBtn,
          hasSaveBtn,
          hasMenu,
          hasMenuList,
          createdOk,
          trackAdded,
          hasPlayAllBtn,
          hasBackBtn,
          isTracksView,
          queueFilled,
          isDeleted
        };
      })()
    `);

    console.log('Root index.html Playlists Eval:', JSON.stringify(rootEval, null, 2));

    if (!rootEval.hasGPPlaylists || !rootEval.createdOk || !rootEval.trackAdded || !rootEval.queueFilled || !rootEval.isDeleted) {
      throw new Error('Root index.html Playlists Eval failed validation!');
    }

    console.log('\n[2] Testing www/index.html with Playlists View...');
    await win.loadFile(path.join(__dirname, '../www/index.html'));

    const wwwEval = await win.webContents.executeJavaScript(`
      (() => {
        const hasGPPlaylists = typeof window.GP?.Views?.Playlists !== 'undefined';
        const hasGetPlaylists = typeof window.getPlaylists === 'function';
        const hasRenderPlaylists = typeof window.renderPlaylists === 'function';
        const hasOpenPlaylist = typeof window.openPlaylist === 'function';
        const hasCreatePlaylist = typeof window.createPlaylist === 'function';

        return {
          hasGPPlaylists,
          hasGetPlaylists,
          hasRenderPlaylists,
          hasOpenPlaylist,
          hasCreatePlaylist
        };
      })()
    `);

    console.log('WWW index.html Playlists Eval:', JSON.stringify(wwwEval, null, 2));

    if (!wwwEval.hasGPPlaylists || !wwwEval.hasGetPlaylists || !wwwEval.hasCreatePlaylist) {
      throw new Error('WWW index.html Playlists Eval failed validation!');
    }

    if (errors.length > 0) {
      console.error('\nFAIL: Encountered Console Errors during Electron test:');
      errors.forEach(e => console.error(e));
      process.exit(1);
    }

    console.log('\n====================================================');
    console.log('ELECTRON PLAYLISTS SMOKE TEST PASSED WITH 0 ERRORS');
    console.log('====================================================\n');
    app.quit();
    process.exit(0);

  } catch (err) {
    console.error('\nEXCEPTION during Electron Playlists smoke test:', err);
    app.quit();
    process.exit(1);
  }
});
