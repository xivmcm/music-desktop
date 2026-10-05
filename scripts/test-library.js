/**
 * Unit Tests for GlassPlayer Media Library, Favorites & Playback History Module (js/views/library-view.js)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    passedTests++;
    console.log(`[PASS] ${message}`);
  }
}

// Lightweight DOM & Storage Mock
const localStorageMock = (function () {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (i) => Object.keys(store)[i] || null,
    get length() { return Object.keys(store).length; }
  };
})();

function createMockElement(id = '', tag = 'div') {
  const listeners = {};
  const classListSet = new Set();
  const children = [];
  const dataset = {};
  const attributes = {};
  let innerHTMLStr = '';
  let textContentStr = '';

  const el = {
    id,
    tagName: tag.toUpperCase(),
    dataset,
    value: '',
    checked: false,
    type: 'text',
    style: {},
    disabled: false,
    children,
    get innerHTML() { 
      return innerHTMLStr + children.map(c => c.innerHTML).join(''); 
    },
    set innerHTML(val) {
      innerHTMLStr = String(val || '');
      children.length = 0;
    },
    get textContent() { return textContentStr || innerHTMLStr.replace(/<[^>]*>/g, ''); },
    set textContent(val) { textContentStr = String(val || ''); },
    get className() { return Array.from(classListSet).join(' '); },
    set className(val) {
      classListSet.clear();
      String(val || '').split(/\s+/).filter(Boolean).forEach(c => classListSet.add(c));
    },
    classList: {
      add: (c) => classListSet.add(c),
      remove: (c) => classListSet.delete(c),
      toggle: (c, force) => {
        if (typeof force === 'boolean') {
          if (force) classListSet.add(c);
          else classListSet.delete(c);
          return force;
        }
        if (classListSet.has(c)) { classListSet.delete(c); return false; }
        classListSet.add(c); return true;
      },
      contains: (c) => classListSet.has(c)
    },
    addEventListener: (evt, handler) => {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(handler);
    },
    removeEventListener: (evt, handler) => {
      if (listeners[evt]) {
        listeners[evt] = listeners[evt].filter(h => h !== handler);
      }
    },
    dispatchEvent: (event) => {
      const handlers = listeners[event.type] || [];
      handlers.forEach(h => h(event));
    },
    trigger: (evtType, customData = {}) => {
      const handlers = listeners[evtType] || [];
      const evt = { type: evtType, target: el, currentTarget: el, stopPropagation: () => {}, preventDefault: () => {}, ...customData };
      handlers.forEach(h => h(evt));
    },
    appendChild: (child) => {
      child.parentNode = el;
      children.push(child);
      return child;
    },
    removeChild: (child) => {
      const idx = children.indexOf(child);
      if (idx !== -1) children.splice(idx, 1);
      return child;
    },
    setAttribute: (name, val) => { attributes[name] = String(val); },
    getAttribute: (name) => (name in attributes ? attributes[name] : null),
    removeAttribute: (name) => { delete attributes[name]; },
    querySelector: (sel) => {
      for (const child of children) {
        if (child.id && sel === `#${child.id}`) return child;
        if (sel.startsWith('.') && child.classList.contains(sel.slice(1))) return child;
        const found = child.querySelector(sel);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll: (sel) => {
      let results = [];
      for (const child of children) {
        if (child.id && sel === `#${child.id}`) results.push(child);
        if (sel.startsWith('.') && child.classList.contains(sel.slice(1))) results.push(child);
        results = results.concat(child.querySelectorAll(sel));
      }
      return results;
    },
    click: () => {
      el.trigger('click');
    }
  };

  return el;
}

const elementsRegistry = {};
function getOrCreateElement(id, tag = 'div') {
  if (!elementsRegistry[id]) {
    elementsRegistry[id] = createMockElement(id, tag);
  }
  return elementsRegistry[id];
}

const mockDoc = {
  getElementById: (id) => getOrCreateElement(id),
  querySelector: (sel) => {
    if (sel.startsWith('#')) return getOrCreateElement(sel.slice(1));
    for (const key of Object.keys(elementsRegistry)) {
      const el = elementsRegistry[key];
      if (sel.startsWith('.') && el.classList.contains(sel.slice(1))) return el;
      const found = el.querySelector(sel);
      if (found) return found;
    }
    return null;
  },
  querySelectorAll: (sel) => {
    let matches = [];
    for (const key of Object.keys(elementsRegistry)) {
      const el = elementsRegistry[key];
      if (sel.startsWith('.') && el.classList.contains(sel.slice(1))) matches.push(el);
      matches = matches.concat(el.querySelectorAll(sel));
    }
    return matches;
  },
  createElement: (tag) => createMockElement('', tag),
  addEventListener: () => {},
  body: createMockElement('body', 'body')
};

// Setup Environment
const sandbox = {
  window: {},
  document: mockDoc,
  localStorage: localStorageMock,
  console: console,
  setTimeout: (cb) => { cb(); return 1; },
  clearTimeout: () => {},
  getStorageKey: (type) => `gp_${type}_guest`,
  currentUser: null,
  activeView: 'home',
  playlist: [],
  currentTrackIndex: 0,
  searchInput: getOrCreateElement('search-input', 'input'),
  welcomeScreen: getOrCreateElement('welcome-screen'),
  tracksContainer: getOrCreateElement('tracks-container'),
  loadingIndicator: getOrCreateElement('loading-indicator'),
  renderTracks: (tracks, container) => {
    const target = container || getOrCreateElement('tracks-container');
    target.innerHTML = '';
    (tracks || []).forEach(t => {
      const card = createMockElement(`track-${t.id}`, 'div');
      card.className = 'track-card';
      card.dataset.trackId = t.id;
      const btn = createMockElement(`like-${t.id}`, 'button');
      btn.className = 'like-btn';
      card.appendChild(btn);
      target.appendChild(card);
    });
  },
  updateActiveTab: (tab) => {
    sandbox.activeView = tab;
  },
  showToast: (msg) => {
    sandbox.lastToast = msg;
  },
  invalidateHomeRecommendations: () => {
    sandbox.homeRecommendationsInvalidated = true;
  }
};

sandbox.window = sandbox;
sandbox.window.document = mockDoc;
sandbox.window.localStorage = localStorageMock;
sandbox.window.getStorageKey = sandbox.getStorageKey;
sandbox.window.renderTracks = sandbox.renderTracks;
sandbox.window.updateActiveTab = sandbox.updateActiveTab;
sandbox.window.showToast = sandbox.showToast;
sandbox.window.invalidateHomeRecommendations = sandbox.invalidateHomeRecommendations;
sandbox.window.playlist = sandbox.playlist;
sandbox.window.currentTrackIndex = sandbox.currentTrackIndex;
sandbox.window.activeView = sandbox.activeView;

// Mock window.GP and sub-namespaces
sandbox.window.GP = {
  Utils: {
    formatTime: (s) => `${Math.floor(s/60)}:${Math.floor(s%60)}`,
    escapeHtml: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    getFallbackCoverUrl: () => 'data:image/svg+xml;default'
  },
  LocalDB: {
    getLocalTracks: async () => [
      { id: 'local_1', title: 'Local Track 1', artist: 'Artist A', source: 'local', addedAt: 1000 },
      { id: 'local_2', title: 'Local Track 2', artist: 'Artist B', source: 'local', addedAt: 2000 }
    ],
    importLocalAudioFiles: async (files) => files.length
  }
};

const context = vm.createContext(sandbox);

// Load js/views/library-view.js
const libraryCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'library-view.js'), 'utf8');
vm.runInContext(libraryCode, context);

console.log('\n--- Step 2.8.4 Media Library, Favorites & History Unit Tests ---\n');

// 1. Namespace & Exports Verification
assert(context.window.GP && context.window.GP.Views && context.window.GP.Views.Library, 'window.GP.Views.Library exists');
assert(typeof context.window.GP.Views.Library.getLikedTracks === 'function', 'GP.Views.Library.getLikedTracks is a function');
assert(typeof context.window.GP.Views.Library.saveLikedTracks === 'function', 'GP.Views.Library.saveLikedTracks is a function');
assert(typeof context.window.GP.Views.Library.loadLikedTracks === 'function', 'GP.Views.Library.loadLikedTracks is a function');
assert(typeof context.window.GP.Views.Library.isTrackLiked === 'function', 'GP.Views.Library.isTrackLiked is a function');
assert(typeof context.window.GP.Views.Library.toggleLike === 'function', 'GP.Views.Library.toggleLike is a function');
assert(typeof context.window.GP.Views.Library.updateLikeUI === 'function', 'GP.Views.Library.updateLikeUI is a function');
assert(typeof context.window.GP.Views.Library.getPlayHistory === 'function', 'GP.Views.Library.getPlayHistory is a function');
assert(typeof context.window.GP.Views.Library.savePlayHistory === 'function', 'GP.Views.Library.savePlayHistory is a function');
assert(typeof context.window.GP.Views.Library.addToHistory === 'function', 'GP.Views.Library.addToHistory is a function');
assert(typeof context.window.GP.Views.Library.clearHistory === 'function', 'GP.Views.Library.clearHistory is a function');
assert(typeof context.window.GP.Views.Library.loadHistoryView === 'function', 'GP.Views.Library.loadHistoryView is a function');
assert(typeof context.window.GP.Views.Library.renderHistory === 'function', 'GP.Views.Library.renderHistory is a function');
assert(typeof context.window.GP.Views.Library.loadFavorites === 'function', 'GP.Views.Library.loadFavorites is a function');
assert(typeof context.window.GP.Views.Library.renderLocalTracks === 'function', 'GP.Views.Library.renderLocalTracks is a function');

// Compatibility exports on window
assert(typeof context.window.getLikedTracks === 'function', 'window.getLikedTracks is exported');
assert(typeof context.window.saveLikedTracks === 'function', 'window.saveLikedTracks is exported');
assert(typeof context.window.loadLikedTracks === 'function', 'window.loadLikedTracks is exported');
assert(typeof context.window.toggleLike === 'function', 'window.toggleLike is exported');
assert(typeof context.window.updateLikeUI === 'function', 'window.updateLikeUI is exported');
assert(typeof context.window.loadFavorites === 'function', 'window.loadFavorites is exported');
assert(typeof context.window.renderLocalTracks === 'function', 'window.renderLocalTracks is exported');
assert(typeof context.window.addToHistory === 'function', 'window.addToHistory is exported');
assert(typeof context.window.loadHistoryView === 'function', 'window.loadHistoryView is exported');
assert(typeof context.window.renderHistory === 'function', 'window.renderHistory is exported');

// 2. Storage & Reactive likedTrackIds Verification
localStorageMock.clear();
const testLikes = [
  { id: 'track_1', title: 'Song 1', artist: 'Artist 1' },
  { id: 'track_2', title: 'Song 2', artist: 'Artist 2' }
];
context.window.saveLikedTracks(testLikes);
const retrievedLikes = context.window.getLikedTracks();
assert(Array.isArray(retrievedLikes) && retrievedLikes.length === 2, 'getLikedTracks reads saved tracks from localStorage');
assert(retrievedLikes[0].id === 'track_1', 'Saved track retains id');

// Test loadLikedTracks
context.window.loadLikedTracks();
assert(typeof context.window.likedTrackIds.has === 'function', 'window.likedTrackIds has Set interface');
assert(context.window.likedTrackIds.has('track_1') === true, 'likedTrackIds contains track_1');
assert(context.window.likedTrackIds.has('track_2') === true, 'likedTrackIds contains track_2');
assert(context.window.likedTrackIds.has('track_3') === false, 'likedTrackIds does not contain unliked track_3');
assert(context.window.GP.Views.Library.isTrackLiked('track_1') === true, 'isTrackLiked returns true for liked track');
assert(context.window.GP.Views.Library.isTrackLiked('track_999') === false, 'isTrackLiked returns false for unliked track');

// Reactive setter for likedTrackIds
context.window.likedTrackIds = new Set(['track_abc']);
assert(context.window.likedTrackIds.has('track_abc') === true, 'Reactive setter updates likedTrackIds');
assert(context.window.GP.Views.Library.isTrackLiked('track_abc') === true, 'isTrackLiked reflects reactive setter update');

// 3. Toggle Like Verification
localStorageMock.clear();
context.window.likedTrackIds = new Set();
const mockEvt = {
  stopPropagation: () => {},
  currentTarget: createMockElement('like-btn-1', 'button')
};
const newTrack = { id: 'track_100', title: 'Hit Song', artist: 'Famous Artist' };

// Toggle on (Like)
async function testLikeFlow() {
  await context.window.toggleLike(mockEvt, newTrack);
  assert(context.window.likedTrackIds.has('track_100') === true, 'toggleLike adds track to likedTrackIds');
  const storedAfterLike = context.window.getLikedTracks();
  assert(context.window.homeRecommendationsInvalidated === true, 'invalidateHomeRecommendations called on toggleLike');

  // Toggle off (Unlike)
  await context.window.toggleLike(mockEvt, newTrack);
  assert(context.window.likedTrackIds.has('track_100') === false, 'toggleLike removes track from likedTrackIds');
  const storedAfterUnlike = context.window.getLikedTracks();
  assert(!storedAfterUnlike.some(t => t.id === 'track_100'), 'toggleLike removes track from localStorage');

  // 4. Subtab State & Navigation
  assert(context.window.currentLibrarySubTab === 'favorites', 'Default currentLibrarySubTab is favorites');
  context.window.currentLibrarySubTab = 'local';
  assert(context.window.currentLibrarySubTab === 'local', 'currentLibrarySubTab reactive setter works');
  assert(context.window.GP.Views.Library.getCurrentLibrarySubTab() === 'local', 'getCurrentLibrarySubTab returns updated value');

  // Test loadFavorites('local')
  await context.window.loadFavorites('local');
  assert(context.window.activeView === 'library', 'loadFavorites sets activeView to library');
  assert(context.window.currentLibrarySubTab === 'local', 'loadFavorites switches subtab to local');

  // Test loadFavorites('favorites')
  await context.window.loadFavorites('favorites');
  assert(context.window.currentLibrarySubTab === 'favorites', 'loadFavorites switches subtab to favorites');

  // 5. Playback History Verification
  localStorageMock.clear();
  assert(context.window.getPlayHistory().length === 0, 'Initial play history is empty');

  // Add track to history
  const histTrack1 = { id: 'hist_1', title: 'Track 1', artist: 'Artist 1', duration: 180 };
  const histTrack2 = { id: 'hist_2', title: 'Track 2', artist: 'Artist 2', duration: 240 };
  context.window.addToHistory(histTrack1);
  assert(context.window.getPlayHistory().length === 1, 'addToHistory adds first track');
  assert(context.window.getPlayHistory()[0].id === 'hist_1', 'First track is at front of history');
  assert(sandbox.homeRecommendationsInvalidated === true, 'addToHistory invalidates home recommendations');

  context.window.addToHistory(histTrack2);
  let hist = context.window.getPlayHistory();
  assert(hist.length === 2 && hist[0].id === 'hist_2', 'Second track unshifted to front of history');

  // Deduplication
  context.window.addToHistory(histTrack1);
  hist = context.window.getPlayHistory();
  assert(hist.length === 2 && hist[0].id === 'hist_1', 'Re-adding track 1 moves it to front without duplicate');

  // History overflow test (max 50)
  for (let i = 10; i < 70; i++) {
    context.window.addToHistory({ id: `hist_${i}`, title: `Song ${i}`, artist: 'Various' });
  }
  hist = context.window.getPlayHistory();
  assert(hist.length === 50, 'History is capped at 50 tracks');

  // Render history
  context.window.renderHistory();
  assert(Array.isArray(context.window.playlist) && context.window.playlist.length === 50, 'renderHistory sets playlist to history');

  // Clear history
  context.window.GP.Views.Library.clearHistory();
  assert(context.window.getPlayHistory().length === 0, 'clearHistory clears localStorage history');

  // Load history view
  context.window.loadHistoryView();
  assert(context.window.activeView === 'history', 'loadHistoryView updates activeView to history');

  console.log(`\n========================================`);
  console.log(`ALL TESTS PASSED: ${passedTests} / ${totalTests}`);
  console.log(`========================================\n`);
}

testLikeFlow().catch(err => {
  console.error('[FAIL] Async test error:', err);
  process.exit(1);
});
