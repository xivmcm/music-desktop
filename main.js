const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    frame: false,            // Hides default OS frames for custom window layout
    transparent: true,      // Allows the desktop to show through for glassmorphism
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

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
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
