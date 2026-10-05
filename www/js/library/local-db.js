/**
 * GlassPlayer - IndexedDB Local Audio Database Module
 * Namespace: window.GP.LocalDB
 * Manages local offline music storage, blob caching, and track CRUD operations.
 */

(function (window) {
  'use strict';

  const DB_NAME = 'GlassPlayerLocalDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'local_tracks';

  let dbInstance = null;
  const localBlobUrls = new Map();

  function readLocalAudioDuration(file) {
    return new Promise((resolve) => {
      if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
        return resolve(0);
      }
      const probe = document.createElement('audio');
      let objectUrl = '';
      try {
        objectUrl = URL.createObjectURL(file);
      } catch (err) {
        return resolve(0);
      }

      let settled = false;
      const finish = (duration = 0) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        probe.removeAttribute('src');
        try {
          URL.revokeObjectURL(objectUrl);
        } catch (e) {}
        resolve(Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0);
      };

      const timeoutId = setTimeout(() => finish(0), 4000);
      probe.preload = 'metadata';
      probe.addEventListener('loadedmetadata', () => finish(probe.duration), { once: true });
      probe.addEventListener('error', () => finish(0), { once: true });
      probe.src = objectUrl;
    });
  }

  function initLocalAudioDB() {
    return new Promise((resolve, reject) => {
      if (dbInstance) return resolve(dbInstance);
      if (typeof indexedDB === 'undefined') {
        return reject(new Error('IndexedDB is not supported in this environment'));
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = (e) => {
        dbInstance = e.target.result;
        resolve(dbInstance);
      };

      request.onerror = (e) => {
        console.error('[IndexedDB Error]:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  async function saveLocalTrack(file) {
    const db = await initLocalAudioDB();
    const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const rawName = file.name ? file.name.replace(/\.[^/.]+$/, "") : 'audio_track';
    let title = rawName;
    let artist = 'Локальный файл';

    if (rawName.includes(' - ')) {
      const parts = rawName.split(' - ');
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }

    const detectedDuration = await readLocalAudioDuration(file);
    const trackObj = {
      id,
      title,
      artist,
      source: 'local',
      duration: detectedDuration,
      fileSize: file.size || 0,
      blob: file,
      addedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(trackObj);
      req.onsuccess = () => resolve(trackObj);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function getLocalTracks() {
    try {
      const db = await initLocalAudioDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => {
          const tracks = req.result || [];
          const formatTimeFn = (typeof window !== 'undefined' && window.formatTime) ||
            (window.GP && window.GP.Utils && window.GP.Utils.formatTime) ||
            ((s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

          const mapped = tracks.map(t => {
            let blobUrl = localBlobUrls.get(t.id);
            if (!blobUrl && typeof URL !== 'undefined' && URL.createObjectURL && t.blob) {
              try {
                blobUrl = URL.createObjectURL(t.blob);
                localBlobUrls.set(t.id, blobUrl);
              } catch (e) {
                blobUrl = '';
              }
            }
            return {
              id: t.id,
              title: t.title,
              artist: t.artist,
              source: 'local',
              duration: t.duration ? formatTimeFn(t.duration) : '—:—',
              durationSeconds: t.duration || 0,
              addedAt: t.addedAt || 0,
              fileSize: t.fileSize || t.blob?.size || 0,
              thumbnail: '',
              streamUrl: blobUrl,
              blobUrl: blobUrl
            };
          });
          resolve(mapped);
        };

        req.onerror = () => resolve([]);
      });
    } catch (err) {
      console.error('[IndexedDB Get Error]:', err);
      return [];
    }
  }

  async function deleteLocalTrack(id) {
    const db = await initLocalAudioDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => {
        const blobUrl = localBlobUrls.get(id);
        if (blobUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
          try {
            URL.revokeObjectURL(blobUrl);
          } catch (e) {}
        }
        localBlobUrls.delete(id);
        resolve();
      };

      req.onerror = (e) => reject(e.target.error);
    });
  }

  function revokeAllBlobUrls() {
    if (typeof URL !== 'undefined' && URL.revokeObjectURL) {
      localBlobUrls.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {}
      });
    }
    localBlobUrls.clear();
  }

  async function importLocalAudioFiles(files) {
    let added = 0;
    let failed = 0;

    for (const file of files) {
      try {
        await saveLocalTrack(file);
        added += 1;
      } catch (error) {
        failed += 1;
        console.error(`[Local Library] Failed to import ${file.name}:`, error);
      }
    }

    const toast = typeof window !== 'undefined' && window.showToastNotification;
    if (typeof toast === 'function') {
      if (added) toast(`Добавлено: ${added}`, 'success', 'Медиатека');
      if (failed) toast(`Не удалось добавить: ${failed}. Проверьте формат и свободное место.`, 'error', 'Медиатека');
    }

    return { added, failed };
  }

  // --- Namespace & Export ---
  window.GP = window.GP || {};
  window.GP.LocalDB = {
    DB_NAME,
    DB_VERSION,
    STORE_NAME,
    initLocalAudioDB,
    saveLocalTrack,
    getLocalTracks,
    deleteLocalTrack,
    importLocalAudioFiles,
    readLocalAudioDuration,
    revokeAllBlobUrls,
    getBlobUrls: () => localBlobUrls,
    getInstance: () => dbInstance
  };

  // Backward compatibility global exports
  window.initLocalAudioDB = initLocalAudioDB;
  window.saveLocalTrack = saveLocalTrack;
  window.getLocalTracks = getLocalTracks;
  window.deleteLocalTrack = deleteLocalTrack;
  window.importLocalAudioFiles = importLocalAudioFiles;
  window.readLocalAudioDuration = readLocalAudioDuration;
  window.revokeAllBlobUrls = revokeAllBlobUrls;
  window.localBlobUrls = localBlobUrls;

  Object.defineProperty(window, 'dbInstance', {
    get: () => dbInstance,
    set: (val) => { dbInstance = val; },
    configurable: true
  });

})(typeof window !== 'undefined' ? window : global);
