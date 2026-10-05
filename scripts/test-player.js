/**
 * GlassPlayer - Core Player Controller Unit Tests
 * Tests js/player/player-controller.js
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

// Minimal DOM and Browser Mocks
const localStorageMock = (function () {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

function createMockElement(id = '', tag = 'div') {
  const listeners = {};
  const classListSet = new Set();
  const children = [];
  const dataset = {};
  let innerHTMLStr = '';

  const el = {
    id,
    tagName: tag.toUpperCase(),
    dataset,
    value: '0',
    max: 100,
    currentTime: 0,
    duration: 180,
    paused: true,
    volume: 1,
    src: '',
    textContent: '',
    style: {},
    disabled: false,
    children,
    get innerHTML() { return innerHTMLStr; },
    set innerHTML(val) {
      innerHTMLStr = val;
      if (val === '') children.length = 0;
    },
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
    querySelectorAll: function (sel) {
      const results = [];
      const match = (item) => {
        if (sel.startsWith('.') && item.classList.contains(sel.slice(1))) results.push(item);
        if (sel.startsWith('#') && item.id === sel.slice(1)) results.push(item);
        for (const c of (item.children || [])) match(c);
      };
      for (const c of children) match(c);
      return results;
    },
    querySelector: function (sel) {
      const all = this.querySelectorAll(sel);
      return all.length > 0 ? all[0] : null;
    },
    setAttribute: (k, v) => {},
    removeAttribute: (k) => {},
    matches: (sel) => false,
    play: async function () {
      el.paused = false;
      el.trigger('play');
      return Promise.resolve();
    },
    pause: function () {
      el.paused = true;
      el.trigger('pause');
    }
  };
  return el;
}

const elementsMap = {};
function getOrCreateElement(id, tag = 'div') {
  if (!elementsMap[id]) {
    elementsMap[id] = createMockElement(id, tag);
  }
  return elementsMap[id];
}

const mockAudioPlayer = createMockElement('audio-player', 'audio');

// Setup global context for VM
const mockWindow = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  localStorage: localStorageMock,
  fetch: async () => ({ status: 200, json: async () => ({ status: 'success' }) }),
  document: {
    getElementById: (id) => {
      if (id === 'audio-player') return mockAudioPlayer;
      return getOrCreateElement(id);
    },
    createElement: (tag) => createMockElement('', tag),
    querySelector: (sel) => {
      if (sel.startsWith('#')) return getOrCreateElement(sel.slice(1));
      return createMockElement('', 'div');
    },
    querySelectorAll: (sel) => [],
    readyState: 'complete',
    addEventListener: () => {}
  },
  audioPlayer: mockAudioPlayer,
  BACKEND_URL: 'http://localhost:3000/api',
  showToastNotification: () => {},
  addToHistory: () => {},
  updateLikeUI: () => {},
  getStorageKey: (k) => `gp_${k}`,
  GP: {
    Utils: {
      formatTime: (sec) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
      },
      parseDurationToSeconds: (d) => {
        const parts = String(d || '').split(':').map(Number);
        return parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
      }
    },
    Audio: {
      initAudioEffects: () => {},
      resumeAudioContext: () => {},
      applyAudioEffectsState: () => {}
    },
    Visualizer: {
      startVisualizer: () => { mockWindow.__visualizerStarted = true; },
      stopVisualizer: () => { mockWindow.__visualizerStopped = true; }
    },
    Theme: {
      applyDynamicCoverColor: () => { mockWindow.__dynamicCoverCalled = true; }
    },
    Lyrics: {
      syncLyricsToTime: (t) => { mockWindow.__lyricsSyncedTime = t; },
      loadLyrics: (track) => { mockWindow.__lyricsLoadedTrack = track; }
    },
    Social: {
      broadcastPlayerStatus: () => { mockWindow.__broadcastStatusCalled = true; }
    }
  }
};

mockWindow.window = mockWindow;

const context = vm.createContext(mockWindow);

// Run player-controller.js
const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'player', 'player-controller.js'), 'utf8');
vm.runInContext(code, context);

console.log('====================================================');
console.log('   GLASSPLAYER JS/PLAYER MODULE UNIT TESTS          ');
console.log('====================================================\n');

try {
  // Test 1: Namespace exists
  assert(context.window.GP.Player !== undefined, 'GP.Player namespace exists');

  // Test 2: Global Aliases exist
  assert(typeof context.window.playTrack === 'function', 'playTrack global alias exists');
  assert(typeof context.window.togglePlay === 'function', 'togglePlay global alias exists');
  assert(typeof context.window.playNext === 'function', 'playNext global alias exists');
  assert(typeof context.window.playPrev === 'function', 'playPrev global alias exists');
  assert(typeof context.window.seekToPercent === 'function', 'seekToPercent global alias exists');
  assert(typeof context.window.toggleShuffle === 'function', 'toggleShuffle global alias exists');
  assert(typeof context.window.toggleRepeat === 'function', 'toggleRepeat global alias exists');
  assert(typeof context.window.setPlayState === 'function', 'setPlayState global alias exists');
  assert(typeof context.window.getAudioStreamUrl === 'function', 'getAudioStreamUrl global alias exists');

  // Test 3: Reactive Getters / Setters on window
  assert(Array.isArray(context.window.playlist), 'window.playlist is reactive array');
  assert(context.window.currentTrackIndex === -1, 'window.currentTrackIndex default is -1');
  assert(context.window.isShuffle === false, 'window.isShuffle default is false');
  assert(context.window.isRepeat === false, 'window.isRepeat default is false');
  assert(context.window.isSeeking === false, 'window.isSeeking default is false');

  // Test 4: Queue Population
  const sampleTracks = [
    { id: 'track_1', title: 'Song Alpha', artist: 'Artist One', duration: '3:30', source: 'soundcloud' },
    { id: 'track_2', title: 'Song Beta', artist: 'Artist Two', duration: '4:15', source: 'soundcloud' },
    { id: 'track_3', title: 'Song Gamma', artist: 'Artist Three', duration: '2:45', source: 'soundcloud' }
  ];

  context.window.playlist = sampleTracks;
  assert(context.window.playlist.length === 3, 'window.playlist setter correctly updated queue length');
  assert(context.window.GP.Player.getPlaylist().length === 3, 'GP.Player.getPlaylist matches window.playlist');

  // Test 5: playTrack(0)
  context.window.playTrack(0);
  assert(context.window.currentTrackIndex === 0, 'playTrack(0) set currentTrackIndex to 0');
  assert(context.window.activePlayingTrack.id === 'track_1', 'activePlayingTrack is track_1');
  assert(context.window.currentTrackDuration === 210, 'Parsed track duration is 210 seconds');
  assert(context.window.__lyricsLoadedTrack.id === 'track_1', 'loadLyrics invoked for track_1');

  // Test 6: Next Track
  context.window.playNext();
  assert(context.window.currentTrackIndex === 1, 'playNext advanced currentTrackIndex to 1');
  assert(context.window.activePlayingTrack.id === 'track_2', 'activePlayingTrack is now track_2');

  context.window.playNext();
  assert(context.window.currentTrackIndex === 2, 'playNext advanced currentTrackIndex to 2');

  // Test 7: Queue Loop Back
  context.window.playNext();
  assert(context.window.currentTrackIndex === 0, 'playNext looped back from last track to 0');

  // Test 8: Prev Track
  context.window.playPrev();
  assert(context.window.currentTrackIndex === 2, 'playPrev at index 0 looped around to last track (2)');

  context.window.playPrev();
  assert(context.window.currentTrackIndex === 1, 'playPrev moved from 2 to 1');

  // Test 9: Toggle Shuffle
  const shuffleState1 = context.window.toggleShuffle();
  assert(shuffleState1 === true, 'toggleShuffle toggled isShuffle to true');
  assert(context.window.isShuffle === true, 'window.isShuffle getter returns true');

  // When shuffle is on, playNext picks randomly without crashing
  context.window.playNext();
  assert(context.window.currentTrackIndex >= 0 && context.window.currentTrackIndex < 3, 'Shuffle playNext set valid index');

  const shuffleState2 = context.window.toggleShuffle(false);
  assert(shuffleState2 === false, 'toggleShuffle(false) forced isShuffle to false');

  // Test 10: Toggle Repeat
  const repeatState1 = context.window.toggleRepeat();
  assert(repeatState1 === true, 'toggleRepeat toggled isRepeat to true');
  assert(context.window.isRepeat === true, 'window.isRepeat getter returns true');

  const repeatState2 = context.window.toggleRepeat(false);
  assert(repeatState2 === false, 'toggleRepeat(false) forced isRepeat to false');

  // Test 11: Seeking
  context.window.playTrack(0);
  context.window.seekToPercent(50);
  assert(context.window.currentSeekOffset === 105, 'seekToPercent(50) set offset to 105 seconds (50% of 210)');
  assert(mockAudioPlayer.src.includes('seek=105'), 'Stream URL contains seek=105 query parameter');

  // Test 12: Stream URL Generator
  const streamUrl = context.window.getAudioStreamUrl(sampleTracks[0]);
  assert(streamUrl.includes('id=track_1'), 'getAudioStreamUrl includes encoded track id');
  assert(streamUrl.includes('artist=Artist%20One'), 'getAudioStreamUrl includes encoded artist');

  const localTrack = { id: 'local_1', title: 'Local File', artist: 'Artist', source: 'local', blobUrl: 'blob:http://localhost/123' };
  const localStream = context.window.getAudioStreamUrl(localTrack);
  assert(localStream === 'blob:http://localhost/123', 'getAudioStreamUrl returns blobUrl directly for local track');

  // Test 13: Subsystem Integration Hooks
  mockAudioPlayer.trigger('play');
  assert(context.window.__visualizerStarted === true, 'audioPlayer play event started visualizer');
  assert(context.window.__broadcastStatusCalled === true, 'audioPlayer play event broadcast status to socket');

  mockAudioPlayer.trigger('pause');
  assert(context.window.__visualizerStopped === true, 'audioPlayer pause event stopped visualizer');

  // Test 14: Play/Pause Toggle
  mockAudioPlayer.paused = true;
  context.window.togglePlay();
  assert(mockAudioPlayer.paused === false, 'togglePlay resumed paused player');

  context.window.togglePlay();
  assert(mockAudioPlayer.paused === true, 'togglePlay paused playing player');

  console.log('\n----------------------------------------------------');
  console.log(`TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
  console.log('[ALL TESTS PASSED SUCCESSFULLY]');
  console.log('====================================================\n');
  process.exit(0);
} catch (e) {
  console.error('\n[FAILED TEST SUITE]:', e);
  process.exit(1);
}
