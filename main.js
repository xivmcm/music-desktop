const DISCORD_CLIENT_ID = "1525029080615882772";
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const DiscordRPC = require('discord-rpc');

// Discord RPC configuration
let rpcConnected = false;
let rpcClient = null;

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

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    frame: false,            // Hides default OS frames for custom window layout
    transparent: true,      // Allows the desktop to show through for glassmorphism
    hasShadow: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  // Notify renderer of window maximize events to toggle rounded corners
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-status', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-status', false);
  });

  // Register IPC listeners for custom title bar controls
  ipcMain.on('window-minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    mainWindow.close();
  });

  // Discord RPC presence handler
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
          const startTimestamp = Math.floor(now - (trackData.position * 1000));
          activity.startTimestamp = startTimestamp;
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

  // Mini-player mode handler
  let isMiniPlayer = false;
  let normalBounds = null;

  ipcMain.on('toggle-mini-player', () => {
    isMiniPlayer = !isMiniPlayer;
    if (isMiniPlayer) {
      if (!mainWindow.isMaximized()) {
        normalBounds = mainWindow.getBounds();
      } else {
        mainWindow.unmaximize();
        normalBounds = mainWindow.getBounds();
      }
      mainWindow.setResizable(true);
      mainWindow.setMinimumSize(320, 100);
      mainWindow.setAlwaysOnTop(true);
      
      smoothResize(mainWindow, 320, 100, 200, () => {
        mainWindow.setResizable(false);
        mainWindow.webContents.send('mini-player-toggled', true);
      });
    } else {
      mainWindow.setResizable(true);
      mainWindow.setMinimumSize(800, 600);
      mainWindow.setAlwaysOnTop(false);
      
      const targetWidth = normalBounds ? normalBounds.width : 1000;
      const targetHeight = normalBounds ? normalBounds.height : 700;

      smoothResize(mainWindow, targetWidth, targetHeight, 200, () => {
        if (normalBounds) {
          mainWindow.setBounds(normalBounds);
        }
        mainWindow.webContents.send('mini-player-toggled', false);
      });
    }
  });

  // Auto-Updater configuration
  autoUpdater.autoDownload = false;

  autoUpdater.on('checking-for-update', () => {
    mainWindow.webContents.send('update-status', 'checking');
  });

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update-status', 'available', info.version);
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send('update-status', 'not-available');
  });

  autoUpdater.on('error', (err) => {
    mainWindow.webContents.send('update-status', 'error', err.message);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow.webContents.send('update-progress', progressObj.percent);
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update-ready');
  });

  // IPC listener for downloads and installation requests
  ipcMain.on('download-update', () => {
    autoUpdater.downloadUpdate();
  });

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
  });

  // Check for updates shortly after app shows up
  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.error('[Auto-Updater Error] Fail to search for updates:', err);
      });
    }, 4000);
  });
}

app.whenReady().then(() => {
  initDiscordRPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
