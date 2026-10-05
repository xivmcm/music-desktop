/**
 * Unit tests for GlassPlayer Local Library modules
 * (js/library/local-db.js & js/library/dropzone.js)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${message}`);
    failCount++;
  }
}

// In-memory IndexedDB Mock for Unit Testing
class MockIDBDatabase {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this.objectStoreNames = {
      _stores: new Set(),
      contains: (name) => this.objectStoreNames._stores.has(name)
    };
    this._data = new Map();
  }

  createObjectStore(name, options) {
    this.objectStoreNames._stores.add(name);
    if (!this._data.has(name)) {
      this._data.set(name, new Map());
    }
    return { name, options };
  }

  transaction(storeNames, mode) {
    const db = this;
    const storeName = Array.isArray(storeNames) ? storeNames[0] : storeNames;
    const map = db._data.get(storeName) || new Map();

    return {
      objectStore: () => ({
        put: (item) => {
          map.set(item.id, item);
          const req = { onsuccess: null, onerror: null };
          setTimeout(() => req.onsuccess && req.onsuccess({ target: { result: item.id } }), 0);
          return req;
        },
        get: (id) => {
          const result = map.get(id);
          const req = { onsuccess: null, onerror: null, result };
          setTimeout(() => req.onsuccess && req.onsuccess({ target: { result } }), 0);
          return req;
        },
        getAll: () => {
          const result = Array.from(map.values());
          const req = { onsuccess: null, onerror: null, result };
          setTimeout(() => req.onsuccess && req.onsuccess({ target: { result } }), 0);
          return req;
        },
        delete: (id) => {
          map.delete(id);
          const req = { onsuccess: null, onerror: null };
          setTimeout(() => req.onsuccess && req.onsuccess({ target: {} }), 0);
          return req;
        }
      })
    };
  }
}

const mockIDBFactory = {
  open: (name, version) => {
    const req = { onsuccess: null, onerror: null, onupgradeneeded: null };
    setTimeout(() => {
      const db = new MockIDBDatabase(name, version);
      if (req.onupgradeneeded) {
        req.onupgradeneeded({ target: { result: db } });
      }
      if (req.onsuccess) {
        req.onsuccess({ target: { result: db } });
      }
    }, 0);
    return req;
  }
};

const revokedUrls = [];
const mockURL = {
  createObjectURL: (blob) => `blob:http://localhost/mock-${Math.random().toString(36).slice(2)}`,
  revokeObjectURL: (url) => revokedUrls.push(url)
};

const domEvents = {};
const mockElements = {
  'drop-overlay': {
    classList: {
      _classes: new Set(['hidden']),
      add: (c) => mockElements['drop-overlay'].classList._classes.add(c),
      remove: (c) => mockElements['drop-overlay'].classList._classes.delete(c),
      contains: (c) => mockElements['drop-overlay'].classList._classes.has(c)
    }
  }
};

const sandbox = {
  console,
  Math,
  Date,
  Set,
  Map,
  Array,
  Number,
  String,
  Promise,
  setTimeout,
  clearTimeout,
  window: null,
  document: {
    readyState: 'complete',
    getElementById: (id) => mockElements[id] || null,
    createElement: (tag) => ({
      preload: '',
      src: '',
      duration: 180,
      addEventListener: (evt, fn) => {
        if (evt === 'loadedmetadata') setTimeout(fn, 10);
      },
      removeAttribute: () => {}
    }),
    addEventListener: (evt, fn) => {
      domEvents[evt] = domEvents[evt] || [];
      domEvents[evt].push(fn);
    }
  },
  indexedDB: mockIDBFactory,
  URL: mockURL,
  innerWidth: 1000,
  innerHeight: 700,
  addEventListener: (evt, fn) => {
    domEvents[evt] = domEvents[evt] || [];
    domEvents[evt].push(fn);
  },
  showToastNotification: (msg, type) => {},
  formatTime: (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`,
  activeView: 'library',
  loadFavorites: () => {},
  GP: {}
};

sandbox.window = sandbox;

console.log('====================================================');
console.log('   GLASSPLAYER JS/LIBRARY MODULES UNIT TESTS        ');
console.log('====================================================\n');

// 1. Load local-db.js
const localDbCode = fs.readFileSync(path.join(__dirname, '../js/library/local-db.js'), 'utf8');
vm.runInNewContext(localDbCode, sandbox);

assert(sandbox.GP && sandbox.GP.LocalDB, 'GP.LocalDB namespace exists');
assert(typeof sandbox.GP.LocalDB.initLocalAudioDB === 'function', 'initLocalAudioDB function exists');
assert(typeof sandbox.GP.LocalDB.saveLocalTrack === 'function', 'saveLocalTrack function exists');
assert(typeof sandbox.GP.LocalDB.getLocalTracks === 'function', 'getLocalTracks function exists');
assert(typeof sandbox.GP.LocalDB.deleteLocalTrack === 'function', 'deleteLocalTrack function exists');
assert(typeof sandbox.GP.LocalDB.importLocalAudioFiles === 'function', 'importLocalAudioFiles function exists');
assert(typeof sandbox.GP.LocalDB.readLocalAudioDuration === 'function', 'readLocalAudioDuration function exists');
assert(typeof sandbox.saveLocalTrack === 'function', 'saveLocalTrack global alias exists');
assert(typeof sandbox.getLocalTracks === 'function', 'getLocalTracks global alias exists');
assert(typeof sandbox.deleteLocalTrack === 'function', 'deleteLocalTrack global alias exists');

(async () => {
  try {
    // 2. Test saving track
    const mockFile = {
      name: 'Artist Name - Song Title.mp3',
      size: 5000000,
      type: 'audio/mpeg'
    };

    const saved = await sandbox.saveLocalTrack(mockFile);
    assert(saved.id && saved.id.startsWith('local_'), 'saveLocalTrack generates local_ ID');
    assert(saved.artist === 'Artist Name', 'Artist parsed from filename correctly');
    assert(saved.title === 'Song Title', 'Title parsed from filename correctly');
    assert(saved.duration === 180, 'Audio duration read from probe correctly');

    // 3. Test retrieving tracks
    const tracks = await sandbox.getLocalTracks();
    assert(tracks.length === 1, 'getLocalTracks returns saved track');
    assert(tracks[0].id === saved.id, 'Retrieved track matches saved ID');
    assert(tracks[0].streamUrl && tracks[0].streamUrl.startsWith('blob:'), 'Blob URL generated and mapped to streamUrl');
    assert(tracks[0].duration === '3:00', 'Duration formatted as mm:ss');

    // 4. Test deleting track
    await sandbox.deleteLocalTrack(saved.id);
    const afterDelete = await sandbox.getLocalTracks();
    assert(afterDelete.length === 0, 'deleteLocalTrack removes track from DB');
    assert(revokedUrls.length > 0, 'URL.revokeObjectURL called on deleted track blob');

    // 5. Test Dropzone module
    const dropzoneCode = fs.readFileSync(path.join(__dirname, '../js/library/dropzone.js'), 'utf8');
    vm.runInNewContext(dropzoneCode, sandbox);

    assert(sandbox.GP && sandbox.GP.Dropzone, 'GP.Dropzone namespace exists');
    assert(typeof sandbox.GP.Dropzone.initDropzone === 'function', 'initDropzone function exists');
    assert(typeof sandbox.GP.Dropzone.handleDropFiles === 'function', 'handleDropFiles function exists');
    assert(typeof sandbox.initDropzone === 'function', 'initDropzone global alias exists');

    // Test dragover listener
    assert(domEvents['dragover'] && domEvents['dragover'].length > 0, 'dragover listener attached');
    const dragoverHandler = domEvents['dragover'][0];
    let prevented = false;
    dragoverHandler({ preventDefault: () => { prevented = true; } });
    assert(prevented, 'dragover event default prevented');
    assert(!mockElements['drop-overlay'].classList.contains('hidden'), 'drop overlay shown on dragover');

    // Test dragleave listener
    const dragleaveHandler = domEvents['dragleave'][0];
    dragleaveHandler({ clientX: -5, clientY: -5 });
    assert(mockElements['drop-overlay'].classList.contains('hidden'), 'drop overlay hidden on dragleave out of bounds');

    // Test handleDropFiles with valid audio file
    const dropFile = { name: 'Test - Sample.mp3', size: 1000, type: 'audio/mpeg' };
    await sandbox.GP.Dropzone.handleDropFiles([dropFile]);
    const dropTracks = await sandbox.getLocalTracks();
    assert(dropTracks.length === 1 && dropTracks[0].title === 'Sample', 'handleDropFiles successfully imported audio file into DB');

    console.log('\n----------------------------------------------------');
    console.log(`TEST RESULTS: ${passCount} / ${passCount + failCount} PASSED`);
    if (failCount === 0) {
      console.log('[ALL TESTS PASSED SUCCESSFULLY]');
    } else {
      console.error(`[SOME TESTS FAILED: ${failCount}]`);
      process.exit(1);
    }
    console.log('====================================================\n');
  } catch (err) {
    console.error('[UNCAUGHT TEST EXCEPTION]:', err);
    process.exit(1);
  }
})();
