/**
 * Unit Tests for GlassPlayer Playlists & Collections View Module (js/views/playlists-view.js)
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
    value: '0',
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
    dispatchEvent: (event) => {
      const handlers = listeners[event.type] || [];
      handlers.forEach(h => h(event));
    },
    trigger: (evtType, customData = {}) => {
      const handlers = listeners[evtType] || [];
      const evt = { type: evtType, ...customData };
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
    remove: function () {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    },
    querySelectorAll: function (sel) {
      const results = [];
      const match = (item) => {
        if (sel.startsWith('.') && item.classList.contains(sel.slice(1))) results.push(item);
        else if (sel.startsWith('#') && item.id === sel.slice(1)) results.push(item);
        else if (sel.toLowerCase() === item.tagName.toLowerCase()) results.push(item);
        for (const c of (item.children || [])) match(c);
      };
      for (const c of children) match(c);
      return results;
    },
    querySelector: function (sel) {
      const all = this.querySelectorAll(sel);
      return all.length > 0 ? all[0] : null;
    },
    setAttribute: (k, v) => { attributes[k] = String(v); },
    getAttribute: (k) => attributes[k] || null,
    removeAttribute: (k) => { delete attributes[k]; },
    toggleAttribute: (k, force) => {
      if (force) attributes[k] = '';
      else delete attributes[k];
    },
    focus: () => {}
  };
  return el;
}

const elementsMap = {
  'search-input': createMockElement('search-input', 'input'),
  'welcome-screen': createMockElement('welcome-screen', 'div'),
  'tracks-container': createMockElement('tracks-container', 'div'),
  'loading-indicator': createMockElement('loading-indicator', 'div'),
  'playlists-button': createMockElement('playlists-button', 'button'),
  'playlist-modal': createMockElement('playlist-modal', 'div'),
  'new-playlist-input': createMockElement('new-playlist-input', 'input'),
  'cancel-playlist-btn': createMockElement('cancel-playlist-btn', 'button'),
  'save-playlist-btn': createMockElement('save-playlist-btn', 'button'),
  'playlist-menu': createMockElement('playlist-menu', 'div'),
  'playlist-menu-list': createMockElement('playlist-menu-list', 'div')
};

const documentMock = {
  getElementById: (id) => elementsMap[id] || null,
  createElement: (tag) => createMockElement('', tag),
  querySelectorAll: () => [],
  querySelector: () => null,
  body: createMockElement('body', 'body'),
  addEventListener: () => {}
};

let playedIndex = null;
const playerMock = {
  playTrack: (idx) => { playedIndex = idx; }
};

// Create VM context
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  localStorage: localStorageMock,
  document: documentMock,
  btoa: (str) => Buffer.from(str).toString('base64'),
  atob: (str) => Buffer.from(str, 'base64').toString('utf8'),
  APP_VERSION: '1.19.1',
  DEFAULT_MIRRORS: ['https://music-backend-iyni.onrender.com'],
  API_URL: 'https://music-backend-iyni.onrender.com',
  BACKEND_URL: 'https://music-backend-iyni.onrender.com/api',
  currentUser: null,
  currentProfile: 'Default',
  getStorageOwnerSuffix: () => 'Default',
  getStorageKey: (k) => `gp_${k}_Default`,
  playlist: [],
  GP: {
    Player: playerMock,
    Views: {}
  }
};
sandbox.window = sandbox;

vm.createContext(sandbox);

// Load js/views/playlists-view.js
const playlistsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'playlists-view.js'), 'utf8');
vm.runInContext(playlistsCode, sandbox);

console.log('====================================================');
console.log('   GLASSPLAYER JS/VIEWS/PLAYLISTS-VIEW UNIT TESTS   ');
console.log('====================================================\n');

// 1. Namespace & Global Aliases
assert(typeof sandbox.GP?.Views?.Playlists === 'object', 'GP.Views.Playlists namespace exists');
assert(typeof sandbox.getPlaylists === 'function', 'getPlaylists global alias exists');
assert(typeof sandbox.savePlaylists === 'function', 'savePlaylists global alias exists');
assert(typeof sandbox.loadPlaylistsView === 'function', 'loadPlaylistsView global alias exists');
assert(typeof sandbox.renderPlaylists === 'function', 'renderPlaylists global alias exists');
assert(typeof sandbox.renderPlaylistsView === 'function', 'renderPlaylistsView global alias exists');
assert(typeof sandbox.renderPlaylistsList === 'function', 'renderPlaylistsList global alias exists');
assert(typeof sandbox.renderPlaylistTracksView === 'function', 'renderPlaylistTracksView global alias exists');
assert(typeof sandbox.openPlaylist === 'function', 'openPlaylist global alias exists');
assert(typeof sandbox.closePlaylist === 'function', 'closePlaylist global alias exists');
assert(typeof sandbox.createPlaylist === 'function', 'createPlaylist global alias exists');
assert(typeof sandbox.deletePlaylist === 'function', 'deletePlaylist global alias exists');
assert(typeof sandbox.renamePlaylist === 'function', 'renamePlaylist global alias exists');
assert(typeof sandbox.addTrackToPlaylist === 'function', 'addTrackToPlaylist global alias exists');
assert(typeof sandbox.addTrackToPlaylistId === 'function', 'addTrackToPlaylistId global alias exists');
assert(typeof sandbox.removeTrackFromPlaylist === 'function', 'removeTrackFromPlaylist global alias exists');
assert(typeof sandbox.removeTrackFromPlaylistId === 'function', 'removeTrackFromPlaylistId global alias exists');
assert(typeof sandbox.playPlaylist === 'function', 'playPlaylist global alias exists');
assert(typeof sandbox.showPlaylistMenu === 'function', 'showPlaylistMenu global alias exists');
assert(typeof sandbox.mergeAndSyncPlaylists === 'function', 'mergeAndSyncPlaylists global alias exists');
assert(typeof sandbox.loadFriendProfile === 'function', 'loadFriendProfile global alias exists');
assert(typeof sandbox.showFriendLikedTracks === 'function', 'showFriendLikedTracks global alias exists');
assert(typeof sandbox.showFriendPlaylistTracks === 'function', 'showFriendPlaylistTracks global alias exists');

// 2. Reactive properties
assert(sandbox.activePlaylistId === null, 'activePlaylistId defaults to null');
sandbox.activePlaylistId = 'pl_12345';
assert(sandbox.activePlaylistId === 'pl_12345', 'activePlaylistId setter updates property');

assert(sandbox.selectedTrackForPlaylist === null, 'selectedTrackForPlaylist defaults to null');
sandbox.selectedTrackForPlaylist = { id: 'tr_1', title: 'Song 1' };
assert(sandbox.selectedTrackForPlaylist.id === 'tr_1', 'selectedTrackForPlaylist setter updates property');
sandbox.selectedTrackForPlaylist = null;

// 3. CRUD: createPlaylist
sandbox.createPlaylist('Favorites Compilation');
let list = sandbox.getPlaylists();
assert(list.length === 1, 'createPlaylist added one playlist');
assert(list[0].name === 'Favorites Compilation', 'Playlist name matches');
assert(list[0].id.startsWith('pl_'), 'Playlist ID has pl_ prefix');
const plId = list[0].id;

// Deduplication on creation
sandbox.createPlaylist('Favorites Compilation');
list = sandbox.getPlaylists();
assert(list.length === 1, 'Duplicate playlist name rejected');

// 4. CRUD: addTrackToPlaylistId
const sampleTrack1 = { id: 'track_101', title: 'Summer Breeze', artist: 'Artist One', duration: 195, thumbnail: 'cover.jpg' };
const sampleTrack2 = { id: 'track_102', title: 'Night Ride', artist: 'Artist Two', duration: 210, thumbnail: 'cover2.jpg' };

sandbox.addTrackToPlaylistId(plId, sampleTrack1);
list = sandbox.getPlaylists();
assert(list[0].tracks.length === 1, 'addTrackToPlaylistId added track to playlist');
assert(list[0].tracks[0].title === 'Summer Breeze', 'Track title matches');

// Deduplication on track addition
sandbox.addTrackToPlaylistId(plId, sampleTrack1);
list = sandbox.getPlaylists();
assert(list[0].tracks.length === 1, 'Same track not duplicated in playlist');

sandbox.addTrackToPlaylistId(plId, sampleTrack2);
list = sandbox.getPlaylists();
assert(list[0].tracks.length === 2, 'Added second track to playlist');

// 5. CRUD: renamePlaylist
const renameRes = sandbox.renamePlaylist(plId, 'Chill Summer Beats');
assert(renameRes === true, 'renamePlaylist returned true');
list = sandbox.getPlaylists();
assert(list[0].name === 'Chill Summer Beats', 'Playlist name updated in storage');

// 6. Queue integration & playback: playPlaylist
playedIndex = null;
sandbox.playPlaylist(plId, 0);
assert(sandbox.playlist.length === 2, 'playPlaylist populated window.playlist');
assert(sandbox.playlist[0].id === 'track_101', 'First track in queue is Summer Breeze');
assert(playedIndex === 0, 'playTrack(0) invoked via GP.Player');

// 7. CRUD: removeTrackFromPlaylistId
sandbox.removeTrackFromPlaylistId(plId, 'track_101');
list = sandbox.getPlaylists();
assert(list[0].tracks.length === 1, 'removeTrackFromPlaylistId removed track');
assert(list[0].tracks[0].id === 'track_102', 'Remaining track is track_102');

// 8. CRUD: deletePlaylist
sandbox.deletePlaylist(plId);
list = sandbox.getPlaylists();
assert(list.length === 0, 'deletePlaylist removed playlist from storage');

// 9. Collaborative: mergeAndSyncPlaylists
const cloudPlaylists = [
  { id: 'cloud_1', name: 'Work Focus', tracks: [] },
  { id: 'cloud_2', name: 'Road Trip', tracks: [] }
];
sandbox.createPlaylist('Offline Gym Hits');
sandbox.mergeAndSyncPlaylists(cloudPlaylists);
const merged = sandbox.getPlaylists();
assert(merged.length === 3, 'mergeAndSyncPlaylists merged cloud and local without loss');
assert(merged.some(p => p.name === 'Offline Gym Hits'), 'Offline playlist retained');
assert(merged.some(p => p.name === 'Work Focus'), 'Cloud playlist 1 added');
assert(merged.some(p => p.name === 'Road Trip'), 'Cloud playlist 2 added');

// 10. Rendering & DOM integration
sandbox.renderPlaylists();
const tracksContainer = elementsMap['tracks-container'];
assert(!tracksContainer.classList.contains('hidden'), 'tracksContainer unhidden after renderPlaylists');
assert(tracksContainer.innerHTML.includes('Your Playlists'), 'Header contains Your Playlists');

sandbox.openPlaylist(merged[0].id);
assert(sandbox.activePlaylistId === merged[0].id, 'openPlaylist set activePlaylistId');

sandbox.closePlaylist();
assert(sandbox.activeView === 'playlists', 'closePlaylist navigated back to playlists');

console.log('\n----------------------------------------------------');
console.log(`TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
if (passedTests === totalTests) {
  console.log('[ALL TESTS PASSED SUCCESSFULLY]');
}
console.log('====================================================\n');
