const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.on('console-message', (ev, level, msg, line, src) => {
    console.log('[RENDERER CONSOLE]', level, msg);
  });

  win.webContents.on('did-finish-load', () => {
    console.log('[MAIN] did-finish-load fired');
  });

  win.webContents.on('did-fail-load', (ev, code, desc, url) => {
    console.error('[MAIN] did-fail-load:', code, desc, url);
  });

  win.once('ready-to-show', () => {
    console.log('[MAIN] ready-to-show fired! Window bounds:', win.getBounds(), 'isVisible:', win.isVisible());
    win.show();
    win.focus();
    console.log('[MAIN] win.show() called! isVisible now:', win.isVisible());
    setTimeout(() => {
      app.exit(0);
    }, 4000);
  });

  win.loadFile(path.join(__dirname, '../index.html'));
});
