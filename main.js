const DISCORD_CLIENT_ID = "1525029080615882772";
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn } = require('child_process');

// --- Instant Hot-Update Bootstrap ---
// If a verified hot-update bundle with a strictly newer version than the built-in app.asar
// exists in userData/hot-update, delegate execution to hot-update/main.js.
// If the built-in app.asar is equal or newer (e.g. after a fresh .exe install), remove stale hot-update.
if (!global.__GP_HOT_BOOTSTRAPPED) {
  try {
    const parseVer = (v) => String(v || '').replace(/^[^\d]*/, '').split('.').map(n => parseInt(n, 10) || 0);
    const isStrictlyNewer = (remoteV, localV) => {
      const [rMaj = 0, rMin = 0, rPat = 0] = parseVer(remoteV);
      const [lMaj = 0, lMin = 0, lPat = 0] = parseVer(localV);
      if (rMaj !== lMaj) return rMaj > lMaj;
      if (rMin !== lMin) return rMin > lMin;
      return rPat > lPat;
    };
    const hotDir = path.join(app.getPath('userData'), 'hot-update');
    const hotPkgPath = path.join(hotDir, 'package.json');
    const hotMainPath = path.join(hotDir, 'main.js');
    const hotIndexPath = path.join(hotDir, 'index.html');
    if (fs.existsSync(hotPkgPath) && fs.existsSync(hotMainPath) && fs.existsSync(hotIndexPath)) {
      const hotPkg = JSON.parse(fs.readFileSync(hotPkgPath, 'utf8'));
      if (hotPkg.version && isStrictlyNewer(hotPkg.version, app.getVersion())) {
        global.__GP_HOT_BOOTSTRAPPED = hotPkg.version;
        global.__GP_HOT_DIR = hotDir;
        const Module = require('module');
        const asarNodeModules = path.join(__dirname, 'node_modules');
        if (!Module.globalPaths.includes(asarNodeModules)) {
          Module.globalPaths.push(asarNodeModules);
        }
        console.log(`[HotUpdate] Bootstrapping v${hotPkg.version} from ${hotDir}`);
        require(hotMainPath);
        return;
      } else {
        fs.rmSync(hotDir, { recursive: true, force: true });
      }
    }
  } catch (bootErr) {
    console.error('[HotUpdate] Bootstrap error, falling back to built-in app.asar:', bootErr);
  }
}

const DiscordRPC = require('discord-rpc');

// Set Windows AppUserModelId so taskbar & notifications group properly as GlassPlayer
if (process.platform === 'win32') {
  app.setAppUserModelId('com.glassplayer.app');
}

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

// ── Track Share Links: glassplayer:// protocol ─────────────────────────────
const SHARE_PROTOCOL = 'glassplayer';
const SHARE_LINK_MAX_LENGTH = 4096;
let pendingShareLink = null;

function extractShareLink(argv) {
  if (!Array.isArray(argv)) return null;
  const link = argv.find(arg => typeof arg === 'string' && arg.toLowerCase().startsWith(`${SHARE_PROTOCOL}://`));
  return link && link.length <= SHARE_LINK_MAX_LENGTH ? link : null;
}

function registerShareProtocol() {
  try {
    if (process.defaultApp && process.argv.length >= 2) {
      // Dev mode (`electron .`): register electron.exe + app path so links still open this project.
      app.setAsDefaultProtocolClient(SHARE_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient(SHARE_PROTOCOL);
    }
  } catch (err) {
    console.warn('[Share Links] Failed to register protocol:', err.message);
  }
}

function focusPrimaryWindow() {
  const window = getPrimaryWindow();
  if (!window) return;
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
}

function deliverShareLink(link) {
  if (!link) return;
  const window = getPrimaryWindow();
  if (window && !window.webContents.isDestroyed() && !window.webContents.isLoading()) {
    sendToWindow(window, 'open-share-link', link);
    focusPrimaryWindow();
  } else {
    // Renderer not ready yet — it will pull this via 'consume-pending-share-link'.
    pendingShareLink = link;
  }
}

pendingShareLink = extractShareLink(process.argv);

// Only one GlassPlayer instance: a clicked link must open in the already running player.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    focusPrimaryWindow();
    deliverShareLink(extractShareLink(argv));
  });
}

// macOS delivers protocol links via 'open-url' instead of argv.
app.on('open-url', (event, link) => {
  event.preventDefault();
  if (typeof link === 'string' && link.length <= SHARE_LINK_MAX_LENGTH) deliverShareLink(link);
});

ipcMain.handle('consume-pending-share-link', () => {
  const link = pendingShareLink;
  pendingShareLink = null;
  return link;
});

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

// ── Mini-player: pinned above all OS windows ───────────────────────────────
function enforceMiniPlayerOnTop(window) {
  if (!window || window.isDestroyed()) return;
  try {
    // 'screen-saver' is the highest z-order level — stays above taskbar & other topmost windows.
    window.setAlwaysOnTop(true, 'screen-saver', 1);
    if (typeof window.setVisibleOnAllWorkspaces === 'function') {
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    }
    if (typeof window.moveTop === 'function') window.moveTop();
  } catch (err) {
    console.warn('[Mini-player] Failed to pin window on top:', err.message);
  }
}

function releaseMiniPlayerOnTop(window) {
  if (!window || window.isDestroyed()) return;
  try {
    window.setAlwaysOnTop(false);
    if (typeof window.setVisibleOnAllWorkspaces === 'function') {
      window.setVisibleOnAllWorkspaces(false, { skipTransformProcessType: true });
    }
  } catch (err) {
    console.warn('[Mini-player] Failed to release always-on-top:', err.message);
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
  const isVideo = ['.mp4', '.webm', '.mov'].includes(safeExt);
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
    bgUrl: `file://${targetPath.replace(/\\/g, '/')}`,
    isVideo
  };
});

ipcMain.handle('native-auth-request', async (event, { url, method = 'GET', headers = {}, body = null, timeoutMs = 45000 }) => {
  try {
    const options = {
      method,
      headers: {
        'User-Agent': 'GlassPlayer/1.18.0 (Windows NT 10.0; Win64; x64)',
        ...headers
      },
      signal: AbortSignal.timeout(timeoutMs)
    };
    if (body) {
      options.body = typeof body === 'object' ? JSON.stringify(body) : body;
    }
    const response = await fetch(url, options);
    let data;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      data
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      statusText: err.message,
      error: err.message
    };
  }
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

    if (!trackData || trackData.isCleared) {
      try {
        rpcClient.clearActivity().catch(() => {});
      } catch (err) {}
      return;
    }

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

      // Add clickable buttons for Discord profile viewers (up to 2 buttons supported by Discord)
      const buttons = [];
      const trackUrl = trackData.permalink_url || trackData.url;
      if (trackUrl && typeof trackUrl === 'string' && /^https?:\/\//i.test(trackUrl)) {
        buttons.push({
          label: 'Слушать трек',
          url: trackUrl
        });
      }
      buttons.push({
        label: 'Сайт GlassPlayer',
        url: 'https://xivmcm.github.io/music-desktop/'
      });
      activity.buttons = buttons.slice(0, 2);

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
      enforceMiniPlayerOnTop(window);

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
    releaseMiniPlayerOnTop(window);

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

  function isConfidentLrclibMatch(candidate, songName, artist) {
    if (!candidate) return false;
    const cTitle = (candidate.trackName || '').toLowerCase().trim();
    const cArtist = (candidate.artistName || '').toLowerCase().trim();
    const sTitle = (songName || '').toLowerCase().trim();
    const sArtist = (artist || '').toLowerCase().trim();

    if (!cTitle || !cArtist) return false;

    if (sArtist && sArtist.length >= 2) {
      const artistMatches = (cArtist.length >= 2 && sArtist.includes(cArtist)) || cArtist.includes(sArtist);
      if (!artistMatches) {
        const sWords = sArtist.split(/\s+/).filter(w => w.length >= 3);
        const hasSharedWord = sWords.some(w => cArtist.includes(w));
        if (!hasSharedWord) return false;
      }
    }

    if (sTitle && sTitle.length >= 2) {
      const titleMatches = (cTitle.length >= 2 && sTitle.includes(cTitle)) || cTitle.includes(sTitle);
      if (!titleMatches) {
        const sWords = sTitle.split(/\s+/).filter(w => w.length >= 3);
        const hasSharedWord = sWords.some(w => cTitle.includes(w));
        if (!hasSharedWord) return false;
      }
    }

    return true;
  }

  function fetchHttpsText(url, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8'
        }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchHttpsText(res.headers.location, timeoutMs).then(resolve).catch(reject);
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });
  }

  async function fetchGeniusLyrics(query, songName = '', artist = '') {
    try {
      const searchUrl = `https://genius.com/api/search/multi?q=${encodeURIComponent(query)}`;
      const searchRaw = await fetchHttpsText(searchUrl, 4500);
      const searchData = JSON.parse(searchRaw);
      const sections = searchData?.response?.sections || [];
      const songSection = sections.find(s => s.type === 'song');
      const hits = songSection?.hits || [];
      if (!hits.length) return null;

      const cleanTitle = (songName || '').toLowerCase().trim();
      const cleanArtist = (artist || '').toLowerCase().trim();

      let bestHit = null;
      for (const h of hits) {
        const item = h.result;
        if (!item || !item.url) continue;
        const hitTitle = (item.title || '').toLowerCase().trim();
        const hitArtist = (item.artist_names || item.primary_artist?.name || '').toLowerCase().trim();

        if (cleanArtist && cleanArtist.length >= 2) {
          if (hitArtist.includes(cleanArtist) || cleanArtist.includes(hitArtist)) {
            bestHit = item;
            break;
          }
        } else if (cleanTitle && (hitTitle.includes(cleanTitle) || cleanTitle.includes(hitTitle))) {
          bestHit = item;
          break;
        }
      }

      if (!bestHit && hits.length > 0) {
        bestHit = hits[0].result;
      }

      if (!bestHit || !bestHit.url) return null;

      const pageHtml = await fetchHttpsText(bestHit.url, 5000);
      const containerRegex = /<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi;
      const matches = [];
      let match;
      while ((match = containerRegex.exec(pageHtml)) !== null) {
        matches.push(match[1]);
      }
      if (matches.length === 0) {
        const oldMatch = pageHtml.match(/<div class="lyrics"[^>]*>([\s\S]*?)<\/div>/i);
        if (oldMatch) matches.push(oldMatch[1]);
      }
      if (!matches.length) return null;

      let raw = matches.join('\n');
      raw = raw.replace(/<br\s*[\/]?>/gi, '\n');
      raw = raw.replace(/<\/p>/gi, '\n\n');
      raw = raw.replace(/<[^>]+>/g, '');
      raw = raw
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (m, code) => String.fromCharCode(code))
        .replace(/\u00a0/g, ' ');

      const cleaned = raw
        .replace(/^\d+\s+Contributors\s*/i, '')
        .replace(/Translations\s*[^\n]*\n/gi, '')
        .replace(/Embed\s*$/i, '')
        .split('\n')
        .map(l => l.trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (cleaned.length > 20) {
        return {
          format: 'plain',
          plainText: cleaned,
          source: 'Genius',
          songTitle: bestHit.title,
          artistName: bestHit.artist_names
        };
      }
      return null;
    } catch (err) {
      console.warn('[Genius Native] Error:', err.message);
      return null;
    }
  }

  ipcMain.handle('fetch-lyrics', async (event, terms) => {
    if (!terms) return null;
    const { artist, songName, directQuery } = terms;
    const activeVer = glassUpdater ? glassUpdater.currentVersion : '1.20.11';
    const LRCLIB_HEADERS = {
      'User-Agent': `GlassPlayer/${activeVer} (https://github.com/xivmcm/music-desktop)`,
      'Lrclib-Client': `GlassPlayer v${activeVer}`
    };

    // 1. Try LRCLIB with strict match validation
    const queries = [
      `https://lrclib.net/api/get?${new URLSearchParams({ track_name: songName, artist_name: artist })}`,
      `https://lrclib.net/api/search?q=${encodeURIComponent(directQuery)}`
    ];

    for (const url of queries) {
      try {
        const res = await fetch(url, { headers: LRCLIB_HEADERS, signal: AbortSignal.timeout(2500) });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const valid = data.filter(item => isConfidentLrclibMatch(item, songName, artist));
            const best = valid.find(item => item.syncedLyrics) || valid[0];
            if (best) {
              if (best.syncedLyrics) {
                return { format: 'lrc', lyrics: best.syncedLyrics, source: 'LRCLIB (Караоке)' };
              } else if (best.plainLyrics) {
                return { format: 'plain', plainText: best.plainLyrics, source: 'LRCLIB' };
              }
            }
          } else if (data && !Array.isArray(data)) {
            if (isConfidentLrclibMatch(data, songName, artist)) {
              if (data.syncedLyrics) {
                return { format: 'lrc', lyrics: data.syncedLyrics, source: 'LRCLIB (Караоке)' };
              } else if (data.plainLyrics) {
                return { format: 'plain', plainText: data.plainLyrics, source: 'LRCLIB' };
              }
            }
          }
        }
      } catch (e) {}
    }

    // 2. If LRCLIB had no confident match, fall back to Genius
    const geniusLyrics = await fetchGeniusLyrics(directQuery, songName, artist);
    if (geniusLyrics) {
      return geniusLyrics;
    }

    return null;
  });

  ipcMain.on('download-update', (event, targetUrl) => {
    glassUpdater.downloadUpdate(targetUrl);
  });

  ipcMain.on('install-update', () => {
    glassUpdater.installUpdate();
  });

  ipcMain.on('check-for-updates', () => {
    glassUpdater.checkForUpdates();
  });
}

class GlassUpdater {
  constructor() {
    this.currentVersion = this.resolveCurrentVersion();
    this.latestUpdate = null;
    this.downloadedInstallerPath = null;
    this.downloadedHotUpdatePath = null;
    this.isDownloading = false;
  }

  resolveCurrentVersion() {
    if (global.__GP_HOT_BOOTSTRAPPED) return global.__GP_HOT_BOOTSTRAPPED;
    try {
      const activeDir = global.__GP_HOT_DIR || __dirname;
      const pkgPath = path.join(activeDir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg?.version) return pkg.version;
      }
    } catch (_) {}
    return app.getVersion();
  }

  isNewerVersion(remoteVersion, localVersion = this.currentVersion) {
    const parse = (v) => String(v).replace(/^[^\d]*/, '').split('.').map(n => parseInt(n, 10) || 0);
    const [rMajor = 0, rMinor = 0, rPatch = 0] = parse(remoteVersion);
    const [lMajor = 0, lMinor = 0, lPatch = 0] = parse(localVersion);
    if (rMajor !== lMajor) return rMajor > lMajor;
    if (rMinor !== lMinor) return rMinor > lMinor;
    return rPatch > lPatch;
  }

  async checkForUpdates() {
    this.currentVersion = this.resolveCurrentVersion();
    sendToPrimaryWindow('update-status', 'checking');
    try {
      const [ghRes, vjRes] = await Promise.allSettled([
        this.checkGitHubReleases(),
        this.checkVersionJson()
      ]);
      const ghInfo = ghRes.status === 'fulfilled' ? ghRes.value : null;
      const vjInfo = vjRes.status === 'fulfilled' ? vjRes.value : null;

      let updateInfo = null;
      if (ghInfo && vjInfo) {
        if (this.isNewerVersion(vjInfo.version, ghInfo.version)) {
          updateInfo = vjInfo;
        } else if (this.isNewerVersion(ghInfo.version, vjInfo.version)) {
          updateInfo = ghInfo;
        } else {
          // Same version: combine GitHub release asset info with hotUpdate metadata from version.json
          updateInfo = {
            ...ghInfo,
            hotUpdate: vjInfo.hotUpdate || null
          };
        }
      } else {
        updateInfo = vjInfo || ghInfo;
      }

      if (updateInfo && this.isNewerVersion(updateInfo.version)) {
        this.latestUpdate = updateInfo;

        // 1. Check if verified Hot-Update bundle (~675 KB) is already cached in Temp
        const hotTempPath = path.join(app.getPath('temp'), `GlassPlayer-HotUpdate-${updateInfo.version}.gz`);
        if (fs.existsSync(hotTempPath)) {
          try {
            const raw = fs.readFileSync(hotTempPath);
            const expectedSha = updateInfo.hotUpdate?.sha256;
            const actualSha = crypto.createHash('sha256').update(raw).digest('hex');
            if (!expectedSha || actualSha === expectedSha) {
              const parsed = JSON.parse(zlib.gunzipSync(raw).toString('utf8'));
              if (parsed && parsed.version === updateInfo.version && parsed.files) {
                console.log(`[GlassUpdater] Cached Hot-Update bundle verified for v${updateInfo.version} (${raw.length} bytes).`);
                this.downloadedHotUpdatePath = hotTempPath;
                sendToPrimaryWindow('update-status', 'available', updateInfo);
                sendToPrimaryWindow('update-ready', updateInfo);
                return;
              }
            }
          } catch (hotErr) {
            console.warn('[GlassUpdater] Failed to verify cached hot-update:', hotErr.message);
          }
        }

        // 2. Check if full installer is already downloaded and cached in Temp
        const tempPath = path.join(app.getPath('temp'), `GlassPlayer-Setup-${updateInfo.version}.exe`);
        const expectedSize = updateInfo.size || 0;
        if (fs.existsSync(tempPath)) {
          try {
            const stat = fs.statSync(tempPath);
            if ((expectedSize > 0 && Math.abs(stat.size - expectedSize) < 2048) || (!expectedSize && stat.size > 50 * 1024 * 1024)) {
              console.log(`[GlassUpdater] Cached complete installer verified for v${updateInfo.version} (${stat.size} bytes).`);
              this.downloadedInstallerPath = tempPath;
              sendToPrimaryWindow('update-status', 'available', updateInfo);
              sendToPrimaryWindow('update-ready', updateInfo);
              return;
            }
          } catch (statErr) {
            console.warn('[GlassUpdater] Failed to verify cached installer:', statErr.message);
          }
        }

        sendToPrimaryWindow('update-status', 'available', updateInfo);
        // Start silent background download (prefers lightweight ~675 KB Hot-Update if available)
        this.downloadUpdate(updateInfo.downloadUrl, true);
      } else {
        this.latestUpdate = null;
        sendToPrimaryWindow('update-status', 'not-available');
      }
    } catch (err) {
      console.error('[GlassUpdater] Update check error:', err.message);
      sendToPrimaryWindow('update-status', 'error', err.message);
    }
  }

  async checkGitHubReleases() {
    try {
      const res = await fetch('https://api.github.com/repos/xivmcm/music-desktop/releases/latest', {
        headers: { 'User-Agent': 'GlassPlayer-Desktop-App' },
        signal: AbortSignal.timeout(6000)
      });
      if (!res.ok) return null;
      const data = await res.json();
      const version = String(data.tag_name || data.name || '').replace(/^v/, '');
      const exeAsset = (data.assets || []).find(a => a.name.endsWith('.exe'));
      
      // If release does not have an .exe asset yet, return null to fallback to version.json
      if (!exeAsset) {
        console.warn(`[GlassUpdater] Release v${version} found on GitHub, but no .exe asset is available yet.`);
        return null;
      }

      return {
        version,
        changelog: data.body || 'Новые улучшения и исправления ошибок',
        downloadUrl: exeAsset.browser_download_url,
        filename: exeAsset.name || `GlassPlayer-Setup-${version}.exe`,
        size: exeAsset.size || 0
      };
    } catch (e) {
      return null;
    }
  }

  async checkVersionJson() {
    const urls = [
      `https://raw.githubusercontent.com/xivmcm/music-desktop/main/docs/version.json?t=${Date.now()}`,
      `https://xivmcm.github.io/music-desktop/version.json?t=${Date.now()}`
    ];
    for (const u of urls) {
      try {
        const res = await fetch(u, {
          headers: { 'Cache-Control': 'no-cache' },
          signal: AbortSignal.timeout(6000)
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (!data || !data.version) continue;
        const downloadUrl = data.platforms?.win64?.url || data.windows?.url || `https://github.com/xivmcm/music-desktop/releases/latest/download/GlassPlayer-Setup-${data.version}.exe`;
        const filename = data.platforms?.win64?.filename || data.windows?.filename || `GlassPlayer-Setup-${data.version}.exe`;
        return {
          version: data.version,
          changelog: data.changelog || 'Обновление GlassPlayer',
          downloadUrl,
          filename,
          hotUpdate: data.hotUpdate || null
        };
      } catch (_) {}
    }
    return null;
  }

  isTrustedDownloadUrl(candidateUrl) {
    try {
      const parsedUrl = new URL(candidateUrl);
      const host = parsedUrl.hostname.toLowerCase();
      return host === 'github.com' ||
        host.endsWith('.github.com') ||
        host.endsWith('.githubusercontent.com') ||
        host.endsWith('.github.io') ||
        host.endsWith('.windows.net');
    } catch (_) {
      return false;
    }
  }

  downloadFileAtomically(fileUrl, destPath) {
    const partPath = `${destPath}.part`;
    const streamOnce = (currentUrl, redirectsLeft = 5) => new Promise((resolve, reject) => {
      const req = https.get(currentUrl, { headers: { 'User-Agent': 'GlassPlayer-Desktop' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
          const next = new URL(res.headers.location, currentUrl).toString();
          return streamOnce(next, redirectsLeft - 1).then(resolve).catch(reject);
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
        let downloadedBytes = 0;
        let lastReportTime = 0;
        let failed = false;
        const file = fs.createWriteStream(partPath);

        const fail = (err) => {
          if (failed) return;
          failed = true;
          res.destroy();
          file.destroy();
          fs.unlink(partPath, () => {});
          reject(err);
        };

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const now = Date.now();
          if (now - lastReportTime > 120 || downloadedBytes === totalBytes) {
            lastReportTime = now;
            const percent = totalBytes > 0 ? Math.min(99, (downloadedBytes / totalBytes) * 100) : 50;
            sendToPrimaryWindow('update-progress', percent);
          }
        });
        res.on('aborted', () => fail(new Error('Connection aborted')));
        res.on('error', fail);
        file.on('error', fail);

        res.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            if (failed) return;
            if (totalBytes > 0 && downloadedBytes !== totalBytes) {
              return fail(new Error(`Incomplete download (${downloadedBytes}/${totalBytes})`));
            }
            try {
              if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
              fs.renameSync(partPath, destPath);
              resolve(destPath);
            } catch (e) {
              fail(e);
            }
          });
        });
      });

      req.setTimeout(30000, () => req.destroy(new Error('Download timeout')));
      req.on('error', reject);
    });

    return streamOnce(fileUrl);
  }

  async downloadHotUpdate(hotInfo, versionStr) {
    const candidateUrls = [hotInfo.url, hotInfo.fallbackUrl].filter(u => u && this.isTrustedDownloadUrl(u));
    if (candidateUrls.length === 0) return false;

    const hotTempPath = path.join(app.getPath('temp'), `GlassPlayer-HotUpdate-${versionStr}.gz`);
    for (const hotUrl of candidateUrls) {
      try {
        await this.downloadFileAtomically(`${hotUrl}?t=${Date.now()}`, hotTempPath);
        const raw = fs.readFileSync(hotTempPath);
        if (hotInfo.sha256) {
          const actualSha = crypto.createHash('sha256').update(raw).digest('hex');
          if (actualSha !== hotInfo.sha256) {
            throw new Error(`Hot-update SHA-256 mismatch (expected ${hotInfo.sha256.slice(0, 12)}, got ${actualSha.slice(0, 12)})`);
          }
        }
        const parsed = JSON.parse(zlib.gunzipSync(raw).toString('utf8'));
        if (!parsed || parsed.version !== versionStr || !parsed.files || typeof parsed.files !== 'object') {
          throw new Error('Invalid hot-update bundle structure');
        }
        console.log(`[GlassUpdater] Hot-update v${versionStr} downloaded and verified (${(raw.length / 1024).toFixed(1)} KB).`);
        this.downloadedHotUpdatePath = hotTempPath;
        return true;
      } catch (err) {
        console.warn(`[GlassUpdater] Hot-update attempt from ${hotUrl} failed:`, err.message);
        try { if (fs.existsSync(hotTempPath)) fs.unlinkSync(hotTempPath); } catch (_) {}
      }
    }
    return false;
  }

  async downloadUpdate(targetUrl, isBackground = false) {
    if (this.isDownloading) return;

    const versionStr = this.latestUpdate?.version || 'latest';

    // Clean up older installer & hot-update leftovers in Temp folder
    try {
      const tempDir = app.getPath('temp');
      const files = fs.readdirSync(tempDir);
      for (const f of files) {
        if (
          (f.startsWith('GlassPlayer-Setup-') || f.startsWith('GlassPlayer-HotUpdate-')) &&
          (f.endsWith('.exe') || f.endsWith('.gz') || f.endsWith('.part')) &&
          !f.includes(versionStr)
        ) {
          try { fs.unlinkSync(path.join(tempDir, f)); } catch (_) {}
        }
      }
    } catch (_) {}

    // 1. Prefer lightweight ~675 KB Instant Hot-Update bundle if metadata is available
    if (this.latestUpdate?.hotUpdate?.url) {
      this.isDownloading = true;
      const hotSuccess = await this.downloadHotUpdate(this.latestUpdate.hotUpdate, versionStr);
      if (hotSuccess) {
        this.isDownloading = false;
        sendToPrimaryWindow('update-progress', 100);
        sendToPrimaryWindow('update-ready', this.latestUpdate);
        return;
      }
      this.isDownloading = false;
    }

    // 2. Fallback to full NSIS .exe installer
    let url = targetUrl || this.latestUpdate?.downloadUrl;
    if (!url) {
      if (!isBackground) sendToPrimaryWindow('update-status', 'error', 'No download URL provided');
      return;
    }

    if (!this.isTrustedDownloadUrl(url)) {
      console.warn('[GlassUpdater] Blocked untrusted download URL:', url);
      url = this.latestUpdate?.downloadUrl;
    }

    const tempPath = path.join(app.getPath('temp'), `GlassPlayer-Setup-${versionStr}.exe`);
    this.downloadedInstallerPath = tempPath;

    // Check if fully downloaded already in cache
    const expectedSize = this.latestUpdate?.size || 0;
    if (fs.existsSync(tempPath)) {
      try {
        const stat = fs.statSync(tempPath);
        if ((expectedSize > 0 && Math.abs(stat.size - expectedSize) < 2048) || (!expectedSize && stat.size > 50 * 1024 * 1024)) {
          console.log(`[GlassUpdater] Reusing existing complete installer (${stat.size} bytes).`);
          this.isDownloading = false;
          sendToPrimaryWindow('update-progress', 100);
          sendToPrimaryWindow('update-ready', this.latestUpdate);
          return;
        }
      } catch (err) {
        // Continue downloading
      }
    }

    this.isDownloading = true;

    try {
      await this.downloadFileAtomically(url, tempPath);
      this.isDownloading = false;
      sendToPrimaryWindow('update-progress', 100);
      sendToPrimaryWindow('update-ready', this.latestUpdate);
    } catch (err) {
      this.isDownloading = false;
      console.error('[GlassUpdater Download Error]:', err.message);
      if (!isBackground) {
        sendToPrimaryWindow('update-status', 'error', `Ошибка загрузки: ${err.message}`);
      }
    }
  }

  applyHotUpdateInPlace() {
    if (!this.downloadedHotUpdatePath || !fs.existsSync(this.downloadedHotUpdatePath)) {
      return false;
    }
    try {
      const raw = fs.readFileSync(this.downloadedHotUpdatePath);
      const bundle = JSON.parse(zlib.gunzipSync(raw).toString('utf8'));
      if (!bundle || !bundle.version || !bundle.files) {
        throw new Error('Malformed hot-update bundle');
      }

      const userDataDir = app.getPath('userData');
      const hotDir = path.join(userDataDir, 'hot-update');
      const stagingDir = path.join(userDataDir, 'hot-update-staging');

      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
      fs.mkdirSync(stagingDir, { recursive: true });

      for (const [relPath, b64] of Object.entries(bundle.files)) {
        // Prevent path traversal
        const safeRel = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
        const targetFile = path.join(stagingDir, safeRel);
        fs.mkdirSync(path.dirname(targetFile), { recursive: true });
        fs.writeFileSync(targetFile, Buffer.from(b64, 'base64'));
      }

      if (fs.existsSync(hotDir)) {
        fs.rmSync(hotDir, { recursive: true, force: true });
      }
      fs.renameSync(stagingDir, hotDir);

      global.__GP_HOT_DIR = hotDir;
      global.__GP_HOT_BOOTSTRAPPED = bundle.version;
      this.currentVersion = bundle.version;
      this.latestUpdate = null;

      console.log(`[GlassUpdater] Applied instant hot-update v${bundle.version} without closing window!`);
      const win = getPrimaryWindow();
      if (win && !win.isDestroyed()) {
        win.loadFile(path.join(hotDir, 'index.html'));
      }
      return true;
    } catch (err) {
      console.error('[GlassUpdater] Hot-update apply error, falling back to installer if available:', err);
      return false;
    }
  }

  installUpdate() {
    // 1. Try instant zero-close Hot-Update first (~0.15s in-place reload, no window close!)
    if (this.downloadedHotUpdatePath && fs.existsSync(this.downloadedHotUpdatePath)) {
      if (this.applyHotUpdateInPlace()) {
        return;
      }
    }

    // 2. Fallback to full NSIS .exe installer
    if (!this.downloadedInstallerPath || !fs.existsSync(this.downloadedInstallerPath)) {
      console.error('[GlassUpdater] Installer file not found:', this.downloadedInstallerPath);
      sendToPrimaryWindow('update-status', 'error', 'Файл обновления не найден');
      return;
    }

    try {
      console.log('[GlassUpdater] Preparing clean runner for installer:', this.downloadedInstallerPath);
      
      if (process.platform === 'win32') {
        const tempDir = app.getPath('temp');
        const installerPath = this.downloadedInstallerPath;
        const appExe = process.execPath;
        const installDir = path.dirname(appExe);
        const vbsPath = path.join(tempDir, 'gp-update-runner.vbs');
        const logPath = path.join(tempDir, 'gp-updater.log');

        const escVbs = (str) => String(str).replace(/"/g, '""');

        // Native Windows GUI-subsystem runner (wscript.exe + UTF-16LE BOM VBScript).
        // Unlike console binaries (powershell.exe / cmd.exe) which abort immediately when
        // spawned with DETACHED_PROCESS + stdio:'ignore', wscript.exe is a GUI binary that
        // runs completely hidden, survives app.quit(), handles Cyrillic paths natively via
        // UTF-16LE, removes legacy >260-char unpacked paths that broke NSIS atomicRMDir,
        // and runs from %TEMP% so it never locks the installation directory.
        const vbsLines = [
          'On Error Resume Next',
          'Set sh = CreateObject("WScript.Shell")',
          'Set fso = CreateObject("Scripting.FileSystemObject")',
          `tempDir = "${escVbs(tempDir)}"`,
          `logPath = "${escVbs(logPath)}"`,
          `installerPath = "${escVbs(installerPath)}"`,
          `appExe = "${escVbs(appExe)}"`,
          `installDir = "${escVbs(installDir)}"`,
          'fallbackDir = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\\Programs\\music-desktop"',
          'fallbackExe = fallbackDir & "\\GlassPlayer.exe"',
          'sh.CurrentDirectory = tempDir',
          '',
          'Set lf = fso.OpenTextFile(logPath, 2, True, -1)',
          'lf.WriteLine Now & " [Runner] Started. Waiting 600ms for app.quit..."',
          'lf.Close',
          '',
          'WScript.Sleep 600',
          'killCode = sh.Run("taskkill.exe /F /IM GlassPlayer.exe /T", 0, True)',
          'WScript.Sleep 1000',
          '',
          'sh.Run "cmd.exe /c rmdir /s /q """ & installDir & "\\resources\\app.asar.unpacked""", 0, True',
          'sh.Run "cmd.exe /c rmdir /s /q """ & fallbackDir & "\\resources\\app.asar.unpacked""", 0, True',
          '',
          'Set lf = fso.OpenTextFile(logPath, 8, True, -1)',
          'lf.WriteLine Now & " [Runner] taskkill exit=" & killCode & ", launching installer: " & installerPath',
          'lf.Close',
          '',
          'instCode = -1',
          'If fso.FileExists(installerPath) Then',
          '  instCode = sh.Run("""" & installerPath & """ --updated /S", 0, True)',
          '  If instCode <> 0 Then',
          '    WScript.Sleep 1500',
          '    sh.Run "taskkill.exe /F /IM GlassPlayer.exe /T", 0, True',
          '    WScript.Sleep 800',
          '    instCode = sh.Run("""" & installerPath & """ --updated /S", 0, True)',
          '  End If',
          'End If',
          '',
          'Set lf = fso.OpenTextFile(logPath, 8, True, -1)',
          'lf.WriteLine Now & " [Runner] Installer finished with code=" & instCode & ". Relaunching app..."',
          'lf.Close',
          '',
          'WScript.Sleep 1000',
          'If fso.FileExists(appExe) Then',
          '  sh.Run """" & appExe & """", 1, False',
          'ElseIf fso.FileExists(fallbackExe) Then',
          '  sh.Run """" & fallbackExe & """", 1, False',
          'End If'
        ].join('\r\n');

        const bom = Buffer.from([0xFF, 0xFE]);
        const body = Buffer.from(vbsLines, 'utf16le');
        fs.writeFileSync(vbsPath, Buffer.concat([bom, body]));

        const sysRoot = process.env.SystemRoot || 'C:\\Windows';
        const wscriptExe = path.join(sysRoot, 'System32', 'wscript.exe');
        const child = spawn(wscriptExe, ['//B', '//NoLogo', vbsPath], {
          cwd: tempDir,
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        });
        child.unref();
      } else {
        const installer = spawn(this.downloadedInstallerPath, ['--updated', '/S'], {
          detached: true,
          stdio: 'ignore'
        });
        installer.unref();
      }

      setTimeout(() => {
        app.removeAllListeners('window-all-closed');
        BrowserWindow.getAllWindows().forEach(w => {
          if (!w.isDestroyed()) w.destroy();
        });
        app.quit();
      }, 300);
    } catch (e) {
      console.error('[GlassUpdater Launch Error]:', e);
      sendToPrimaryWindow('update-status', 'error', `Ошибка запуска обновления: ${e.message}`);
    }
  }
}

const glassUpdater = new GlassUpdater();

function createWindow() {
  const activeAppDir = global.__GP_HOT_DIR || __dirname;
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
    icon: path.join(activeAppDir, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(activeAppDir, 'preload.js'),
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

  console.log('[MAIN] Loading index.html from:', activeAppDir);
  window.loadFile(path.join(activeAppDir, 'index.html'));

  const displayWindow = () => {
    if (window && !window.isDestroyed()) {
      console.log('[MAIN] Showing window now! Bounds:', window.getBounds());
      if (window.isMinimized()) window.restore();
      window.show();
      window.setAlwaysOnTop(true);
      window.focus();
      setTimeout(() => {
        if (!state.isMiniPlayer && window && !window.isDestroyed()) {
          window.setAlwaysOnTop(false);
        }
      }, 500);
    }
  };

  window.once('ready-to-show', () => {
    console.log('[MAIN] ready-to-show event fired!');
    displayWindow();
    state.updateCheckTimer = setTimeout(() => {
      state.updateCheckTimer = null;
      if (window.isDestroyed()) return;
      glassUpdater.checkForUpdates();
    }, 4000);
  });

  // Fallback to guarantee window visibility even if ready-to-show is delayed
  setTimeout(displayWindow, 1500);

  window.webContents.on('did-finish-load', () => {
    console.log('[MAIN] did-finish-load event fired!');
  });

  window.webContents.on('render-process-gone', (e, details) => {
    console.error('[MAIN] Renderer process gone:', details);
  });



  // Notify renderer of window maximize events to toggle rounded corners
  window.on('maximize', () => {
    sendToWindow(window, 'window-maximized-status', true);
  });

  window.on('unmaximize', () => {
    sendToWindow(window, 'window-maximized-status', false);
  });

  // Windows can silently drop the topmost flag (focus loss, restore, other topmost apps).
  // While in mini-player mode, re-pin it on every such event.
  const reassertMiniPlayerOnTop = () => {
    if (state.isMiniPlayer) enforceMiniPlayerOnTop(window);
  };
  window.on('blur', reassertMiniPlayerOnTop);
  window.on('restore', reassertMiniPlayerOnTop);
  window.on('show', reassertMiniPlayerOnTop);
  window.on('always-on-top-changed', (event, isAlwaysOnTop) => {
    if (!isAlwaysOnTop && state.isMiniPlayer) {
      setImmediate(reassertMiniPlayerOnTop);
    }
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
  // Duplicate instance: link was forwarded to the running player via 'second-instance'.
  if (!hasSingleInstanceLock) return;

  registerShareProtocol();

  // Configure native DNS-over-HTTPS (DoH) in Electron with automatic OS DNS fallback
  try {
    if (typeof app.configureHostResolver === 'function') {
      app.configureHostResolver({
        enableBuiltInResolver: true,
        secureDnsMode: 'automatic',
        secureDnsServers: [
          'https://cloudflare-dns.com/dns-query',
          'https://dns.google/dns-query',
          'https://dns.quad9.net/dns-query'
        ]
      });
      console.log('[DNS-over-HTTPS] Automatic DoH host resolver with OS fallback configured.');
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
