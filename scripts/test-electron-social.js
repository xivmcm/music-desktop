/**
 * Electron Smoke Test for GlassPlayer Social, Auth & Collaboration Subsystem
 * Tests runtime namespaces, global aliases, and DOM interaction in Chromium/Electron.
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
    console.log('[1] Testing root index.html with Social Modules...');
    await win.loadFile(path.join(__dirname, '../index.html'));

    const evalResult = await win.webContents.executeJavaScript(`
      (() => {
        const hasGPSocial = typeof window.GP?.Social !== 'undefined';
        const hasAuthNS = typeof window.GP?.Social?.Auth !== 'undefined';
        const hasSocketNS = typeof window.GP?.Social?.Socket !== 'undefined';
        const hasFriendsNS = typeof window.GP?.Social?.Friends !== 'undefined';

        const hasInitAuth = typeof window.initAuth === 'function';
        const hasHandleAuthSubmit = typeof window.handleAuthSubmit === 'function';
        const hasHandleLogout = typeof window.handleLogout === 'function';
        const hasLoadProfiles = typeof window.loadProfiles === 'function';
        const hasSwitchUserProfile = typeof window.switchUserProfile === 'function';
        const hasCreateUserProfile = typeof window.createUserProfile === 'function';
        const hasDeleteUserProfile = typeof window.deleteUserProfile === 'function';
        const hasOpenAuthModal = typeof window.openAuthModal === 'function';
        const hasConnectWS = typeof window.connectWS === 'function';
        const hasBroadcastPlayerStatus = typeof window.broadcastPlayerStatus === 'function';
        const hasLoadMutualFriends = typeof window.loadMutualFriends === 'function';
        const hasRenderFriendActivity = typeof window.renderFriendActivity === 'function';
        const hasPlayFriendTrack = typeof window.playFriendTrack === 'function';
        const hasOpenCollabModal = typeof window.openCollabModal === 'function';
        const hasSyncPlaylists = typeof window.syncPlaylistsFromServer === 'function';
        const hasSearchUsers = typeof window.searchOtherUsers === 'function';
        const hasRenderUsers = typeof window.renderFindFriendsList === 'function';

        const hasFriendStatuses = window.friendStatuses instanceof Map;
        const hasMutualFriends = Array.isArray(window.mutualFriends);

        // Check DOM elements
        const authModal = document.getElementById('auth-modal');
        const collabModal = document.getElementById('collab-modal');
        const findFriendsModal = document.getElementById('find-friends-modal');
        const activityPanel = document.getElementById('friend-activity-panel');

        // Test modal interaction
        window.openAuthModal();
        const authModalOpen = authModal && !authModal.classList.contains('hidden');

        return {
          hasGPSocial,
          hasAuthNS,
          hasSocketNS,
          hasFriendsNS,
          hasInitAuth,
          hasHandleAuthSubmit,
          hasHandleLogout,
          hasLoadProfiles,
          hasSwitchUserProfile,
          hasCreateUserProfile,
          hasDeleteUserProfile,
          hasOpenAuthModal,
          hasConnectWS,
          hasBroadcastPlayerStatus,
          hasLoadMutualFriends,
          hasRenderFriendActivity,
          hasPlayFriendTrack,
          hasOpenCollabModal,
          hasSyncPlaylists,
          hasSearchUsers,
          hasRenderUsers,
          hasFriendStatuses,
          hasMutualFriends,
          hasAuthModalEl: !!authModal,
          hasCollabModalEl: !!collabModal,
          hasFindFriendsModalEl: !!findFriendsModal,
          hasActivityPanelEl: !!activityPanel,
          authModalOpen,
          hasLyrics: typeof window.GP?.Lyrics !== 'undefined',
          hasTheme: typeof window.GP?.Theme !== 'undefined',
          hasLocalDB: typeof window.GP?.LocalDB !== 'undefined',
          hasVisualizer: typeof window.GP?.Visualizer !== 'undefined',
          hasAudio: typeof window.GP?.Audio !== 'undefined',
          hasUtils: typeof window.GP?.Utils !== 'undefined'
        };
      })()
    `);

    console.log('Root index.html Social Eval:', JSON.stringify(evalResult, null, 2));

    for (const [key, val] of Object.entries(evalResult)) {
      if (!val) {
        throw new Error(`Failed check in root index.html: ${key} is false`);
      }
    }

    console.log('\n[2] Testing www/index.html with Social Modules...');
    await win.loadFile(path.join(__dirname, '../www/index.html'));

    const evalWww = await win.webContents.executeJavaScript(`
      (() => {
        return {
          hasGPSocial: typeof window.GP?.Social !== 'undefined',
          hasAuthNS: typeof window.GP?.Social?.Auth !== 'undefined',
          hasSocketNS: typeof window.GP?.Social?.Socket !== 'undefined',
          hasFriendsNS: typeof window.GP?.Social?.Friends !== 'undefined',
          hasInitAuth: typeof window.initAuth === 'function',
          hasLoadProfiles: typeof window.loadProfiles === 'function',
          hasConnectWS: typeof window.connectWS === 'function',
          hasRenderFriendActivity: typeof window.renderFriendActivity === 'function',
          hasAuthModalEl: !!document.getElementById('auth-modal'),
          hasCollabModalEl: !!document.getElementById('collab-modal'),
          hasFriendStatuses: window.friendStatuses instanceof Map,
          hasMutualFriends: Array.isArray(window.mutualFriends)
        };
      })()
    `);

    console.log('WWW index.html Social Eval:', JSON.stringify(evalWww, null, 2));

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
    console.log('ELECTRON SOCIAL SMOKE TEST PASSED WITH 0 ERRORS');
    console.log('====================================================');
    app.exit(0);
  } catch (err) {
    console.error('Test failed with error:', err);
    app.exit(1);
  }
});
