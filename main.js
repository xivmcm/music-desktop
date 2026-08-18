const DISCORD_CLIENT_ID = "1525029080615882772";
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const DiscordRPC = require('discord-rpc');

// Configure Chromium DNS-over-HTTPS (DoH) before app ready to bypass DNS blocking in RU (Cloudflare + Google + Yandex + AdGuard + Quad9)
app.commandLine.appendSwitch('enable-features', 'DnsOverHttps');
app.commandLine.appendSwitch('dns-over-https-templates', 'https://cloudflare-dns.com/dns-query,https://dns.google/dns-query,https://common.dot.dns.yandex.net/dns-query,https://dns.adguard-dns.com/dns-query,https://dns.quad9.net/dns-query');

// Discord RPC configuration
let rpcConnected = false;
let rpcClient = null;
let mainWindow = null;
let ipcHandlersRegistered = false;
const windowStates = new WeakMap();
const NORMAL_MINIMUM_SIZE = [950, 650];

function getEventWindow(event) {
  if (!event?.sender || event.sender.isDestroyed()) return null;
  const window = BrowserWindow.fromWebContents(event.sender);
  return window && !window.isDestroyed() ? window : null;
}

function sendToWindow(window, channel, ...args) {
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return;
  window.webContents.send(channel, ...args);
}

function getPrimaryWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  return BrowserWindow.getAllWindows().find(window => !window.isDestroyed()) || null;
}

function sendToPrimaryWindow(channel, ...args) {
  sendToWindow(getPrimaryWindow(), channel, ...args);
}

function initDiscordRPC() {
  const isValidId = DISCORD_CLIENT_ID && /^\d+$/.test(DISCORD_CLIENT_ID) && DISCORD_CLIENT_ID !== "ЗАМЕНИ_МЕНЯ";
  if (!isValidId) {
    console.log('[Discord RPC] Client ID is invalid or not configured ("ЗАМЕНИ_МЕНЯ"). Skipping Rich Presence initialization.');
    return;
  }

  try {
    DiscordRPC.register(DISCORD_CLIENT_ID);
    rpcClient = new DiscordRPC.Client({ transport: 'ipc' });
    
    rpcClient.on('ready', () => {
      rpcConnected = true;
      console.log('[Discord RPC] Rich Presence client is connected and ready.');
    });

    rpcClient.on('error', (err) => {
      console.error('[Discord RPC] Client error:', err);
      rpcConnected = false;
    });

    rpcClient.login({ clientId: DISCORD_CLIENT_ID }).catch(err => {
      console.warn('[Discord RPC] Failed to login (Discord might not be running):', err.message);
      rpcConnected = false;
    });
  } catch (err) {
    console.error('[Discord RPC] Failed to initialize:', err);
  }
}

function smoothResize(window, targetWidth, targetHeight, duration = 200, callback) {
  const startBounds = window.getBounds();
  const startTime = Date.now();
  
  const step = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing: easeOutCubic
    const t = progress - 1;
    const ease = t * t * t + 1;
    
    const curWidth = Math.round(startBounds.width + (targetWidth - startBounds.width) * ease);
    const curHeight = Math.round(startBounds.height + (targetHeight - startBounds.height) * ease);
    
    const curX = Math.round(startBounds.x + ((startBounds.x + (startBounds.width - curWidth) / 2) - startBounds.x) * ease);
    const curY = Math.round(startBounds.y + ((startBounds.y + (startBounds.height - curHeight) / 2) - startBounds.y) * ease);
    
    window.setBounds({
      x: curX,
      y: curY,
      width: curWidth,
      height: curHeight
    });
    
    if (progress < 1) {
      setTimeout(step, 10);
    } else {
      if (callback) callback();
    }
  };
  step();
}

ipcMain.handle('save-theme-background', async (event, payload = {}) => {
  const themesDir = path.join(app.getPath('userData'), 'themes');
  await fs.promises.mkdir(themesDir, { recursive: true });

  const originalName = payload.name || payload.sourcePath || 'theme-background';
  const extFromName = path.extname(originalName).toLowerCase();
  const safeExt = extFromName && extFromName.length <= 8 ? extFromName : '.png';
  const id = `theme_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const targetPath = path.join(themesDir, `${id}${safeExt}`);

  if (payload.sourcePath) {
    await fs.promises.copyFile(payload.sourcePath, targetPath);
  } else if (payload.dataUrl) {
    const base64 = String(payload.dataUrl).replace(/^data:[^;]+;base64,/, '');
    await fs.promises.writeFile(targetPath, Buffer.from(base64, 'base64'));
  } else {
    throw new Error('No theme background source provided');
  }

  return {
    id,
    bgPath: targetPath,
    bgUrl: `file://${targetPath.replace(/\\/g, '/')}`
  };
});

function registerIpcHandlers() {
  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;

  ipcMain.on('window-minimize', (event) => {
    getEventWindow(event)?.minimize();
  });

  ipcMain.on('window-maximize', (event) => {
    const window = getEventWindow(event);
    if (!window) return;
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });

  ipcMain.on('window-close', (event) => {
    getEventWindow(event)?.close();
  });

  ipcMain.on('update-presence', (event, trackData) => {
    if (!rpcClient || !rpcConnected) return;

    try {
      const activity = {
        largeImageKey: trackData.artwork_url || 'glassplayer_logo',
        largeImageText: 'GlassPlayer',
        instance: false,
      };

      if (trackData.isPaused) {
        activity.details = `[На паузе] ${trackData.title || 'Unknown'}`;
        activity.state = trackData.artist || 'Unknown';
        activity.smallImageKey = 'pause_icon';
        activity.smallImageText = 'На паузе';
      } else {
        activity.details = trackData.title || 'Unknown';
        activity.state = trackData.artist || 'Unknown';
        activity.smallImageKey = 'play_icon';
        activity.smallImageText = 'Воспроизведение';

        if (trackData.position !== undefined && trackData.duration) {
          const now = Date.now();
          activity.startTimestamp = Math.floor(now - (trackData.position * 1000));
          if (trackData.duration > trackData.position) {
            activity.endTimestamp = Math.floor(now + ((trackData.duration - trackData.position) * 1000));
          }
        }
      }

      rpcClient.setActivity(activity).catch(err => {
        console.error('[Discord RPC] Failed to set activity:', err.message);
      });
    } catch (err) {
      console.error('[Discord RPC] Error setting presence activity:', err);
    }
  });

  ipcMain.on('toggle-mini-player', (event) => {
    const window = getEventWindow(event);
    const state = window && windowStates.get(window);
    if (!window || !state) return;

    // Debounce toggle requests to prevent rapid duplicate calls
    if (state.isTogglingMini) return;
    state.isTogglingMini = true;
    setTimeout(() => {
      if (state) state.isTogglingMini = false;
    }, 250);

    if (state.resizeLockTimer) {
      clearTimeout(state.resizeLockTimer);
      state.resizeLockTimer = null;
    }

    state.isMiniPlayer = !state.isMiniPlayer;
    if (state.isMiniPlayer) {
      state.wasMaximized = window.isMaximized();
      state.normalBounds = state.wasMaximized
        ? window.getNormalBounds()
        : window.getBounds();
      if (state.wasMaximized) window.unmaximize();

      window.setResizable(true);
      window.setMinimumSize(370, 110);
      window.setAlwaysOnTop(true, 'floating');

      const currentBounds = window.getBounds();
      const newWidth = 370;
      const newHeight = 110;
      const newX = Math.round(currentBounds.x + (currentBounds.width - newWidth) / 2);
      const newY = Math.round(currentBounds.y + (currentBounds.height - newHeight) / 2);
      window.setBounds({ x: newX, y: newY, width: newWidth, height: newHeight });

      state.resizeLockTimer = setTimeout(() => {
        state.resizeLockTimer = null;
        if (!window.isDestroyed() && state.isMiniPlayer) {
          window.setResizable(false);
        }
      }, 100);

      sendToWindow(window, 'mini-player-toggled', true);
      return;
    }

    window.setResizable(true);
    window.setMinimumSize(...NORMAL_MINIMUM_SIZE);
    window.setAlwaysOnTop(false);

    if (state.normalBounds) {
      window.setBounds(state.normalBounds);
    } else {
      window.setSize(1100, 750);
      window.center();
    }
    sendToWindow(window, 'mini-player-toggled', false);

    if (state.wasMaximized) {
      setImmediate(() => {
        if (!window.isDestroyed() && !state.isMiniPlayer) window.maximize();
      });
    }
    state.wasMaximized = false;
  });

  ipcMain.handle('fetch-lyrics', async (event, terms) => {
    if (!terms) return null;
    const { artist, songName, directQuery, rawCleanQuery, titleOnlyQuery } = terms;
    const LRCLIB_HEADERS = {
      'User-Agent': 'GlassPlayer/1.17.6 (https://github.com/xivmcm/music-desktop)',
      'Lrclib-Client': 'GlassPlayer v1.17.6'
    };

    const queries = [
      `https://lrclib.net/api/get?${new URLSearchParams({ track_name: songName, artist_name: artist })}`,
      `https://lrclib.net/api/search?q=${encodeURIComponent(directQuery)}`,
      `https://lrclib.net/api/search?q=${encodeURIComponent(rawCleanQuery)}`,
      `https://lrclib.net/api/search?q=${encodeURIComponent(titleOnlyQuery)}`
    ];

    for (const url of queries) {
      try {
        const res = await fetch(url, { headers: LRCLIB_HEADERS, signal: AbortSignal.timeout(2500) });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const best = data.find(item => item.syncedLyrics) || data[0];
            if (best.syncedLyrics) {
              return { format: 'lrc', lyrics: best.syncedLyrics, source: 'LRCLIB (Караоке)' };
            } else if (best.plainLyrics) {
              return { format: 'plain', plainText: best.plainLyrics, source: 'LRCLIB' };
            }
          } else if (data && !Array.isArray(data)) {
            if (data.syncedLyrics) {
              return { format: 'lrc', lyrics: data.syncedLyrics, source: 'LRCLIB (Караоке)' };
            } else if (data.plainLyrics) {
              return { format: 'plain', plainText: data.plainLyrics, source: 'LRCLIB' };
            }
          }
        }
      } catch (e) {}
    }
    return null;
  });

  ipcMain.on('download-update', () => {
    autoUpdater.downloadUpdate();
  });

  ipcMain.on('install-update', () => {
    try {
      app.removeAllListeners('window-all-closed');
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) window.destroy();
      });
    } catch (error) {
      console.error('[Auto-Updater] Error destroying windows prior to install:', error);
    }
    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true);
    });
  });

  ipcMain.on('check-for-updates', (event) => {
    const window = getEventWindow(event);
    autoUpdater.checkForUpdates().catch(err => {
      sendToWindow(window, 'update-status', 'error', err.message);
    });
  });

  autoUpdater.autoDownload = false;
  autoUpdater.on('checking-for-update', () => {
    sendToPrimaryWindow('update-status', 'checking');
  });
  autoUpdater.on('update-available', (info) => {
    sendToPrimaryWindow('update-status', 'available', info.version);
  });
  autoUpdater.on('update-not-available', () => {
    sendToPrimaryWindow('update-status', 'not-available');
  });
  autoUpdater.on('error', (err) => {
    sendToPrimaryWindow('update-status', 'error', err.message);
  });
  autoUpdater.on('download-progress', (progressObj) => {
    sendToPrimaryWindow('update-progress', progressObj.percent);
  });
  autoUpdater.on('update-downloaded', () => {
    sendToPrimaryWindow('update-ready');
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 950,
    minHeight: 650,
    frame: false,            // Hides default OS frames for custom window layout
    transparent: true,      // Allows desktop transparency for glassmorphism
    backgroundColor: '#00000000', // Fully transparent background
    hasShadow: false,       // Disable DWM shadow quad that creates black borders on Windows
    thickFrame: false,      // Disable DWM thick frame that creates black quad margins
    show: false,            // Prevent white flashes on load
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const window = mainWindow;
  const state = {
    isMiniPlayer: false,
    normalBounds: null,
    wasMaximized: false,
    resizeLockTimer: null,
    updateCheckTimer: null
  };
  windowStates.set(window, state);

  window.loadFile('index.html');

  window.once('ready-to-show', () => {
    window.show();
    state.updateCheckTimer = setTimeout(() => {
      state.updateCheckTimer = null;
      if (window.isDestroyed()) return;
      autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.error('[Auto-Updater Error] Fail to search for updates:', err);
      });
    }, 4000);
  });

  // Notify renderer of window maximize events to toggle rounded corners
  window.on('maximize', () => {
    sendToWindow(window, 'window-maximized-status', true);
  });

  window.on('unmaximize', () => {
    sendToWindow(window, 'window-maximized-status', false);
  });

  // A renderer reload must not leave a 370x110 window showing the full layout.
  window.webContents.on('did-finish-load', () => {
    sendToWindow(window, 'mini-player-toggled', state.isMiniPlayer);
  });

  // Mini-player state is owned by the window and controlled by the one-time IPC handlers.
  window.on('closed', () => {
    if (state.resizeLockTimer) clearTimeout(state.resizeLockTimer);
    if (state.updateCheckTimer) clearTimeout(state.updateCheckTimer);
    windowStates.delete(window);
    if (mainWindow === window) mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Configure native DNS-over-HTTPS (DoH) in Electron to bypass DNS blocking in RU
  try {
    if (typeof app.configureHostResolver === 'function') {
      app.configureHostResolver({
        secureDnsMode: 'secure',
        secureDnsServers: [
          'https://cloudflare-dns.com/dns-query',
          'https://dns.google/dns-query',
          'https://common.dot.dns.yandex.net/dns-query',
          'https://dns.adguard-dns.com/dns-query',
          'https://dns.quad9.net/dns-query'
        ]
      });
      console.log('[DNS-over-HTTPS] Secure DoH host resolver configured successfully.');
    }
  } catch (dohErr) {
    console.warn('[DNS-over-HTTPS Warning] Failed to configure DoH:', dohErr.message);
  }

  initDiscordRPC();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
