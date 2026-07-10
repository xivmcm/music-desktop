const { contextBridge, ipcRenderer } = require('electron');

// Expose secure window control and auto-update API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, status, version) => callback(status, version)),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (event, percent) => callback(percent)),
  onUpdateReady: (callback) => ipcRenderer.on('update-ready', () => callback()),
  downloadUpdate: () => ipcRenderer.send('download-update'),
  installUpdate: () => ipcRenderer.send('install-update'),
  updatePresence: (trackData) => ipcRenderer.send('update-presence', trackData),
  toggleMiniPlayer: () => ipcRenderer.send('toggle-mini-player'),
  onMiniPlayerToggled: (callback) => ipcRenderer.on('mini-player-toggled', (event, active) => callback(active)),
  onWindowMaximizedStatus: (callback) => ipcRenderer.on('window-maximized-status', (event, maximized) => callback(maximized))
});
