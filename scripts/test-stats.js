/**
 * Unit tests for GlassPlayer Listening Statistics & Analytics Engine (v1.20.5)
 * (js/views/stats-view.js and js/player/player-controller.js)
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

// Mock DOM element
class MockDOMElement {
  constructor(id = '', tagName = 'div') {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.classList = {
      _classes: new Set(),
      add: (...cls) => cls.forEach(c => this.classList._classes.add(c)),
      remove: (...cls) => cls.forEach(c => this.classList._classes.delete(c)),
      contains: (c) => this.classList._classes.has(c),
      toggle: (c, state) => {
        if (state !== undefined) {
          if (state) this.classList._classes.add(c);
          else this.classList._classes.delete(c);
        } else {
          if (this.classList._classes.has(c)) this.classList._classes.delete(c);
          else this.classList._classes.add(c);
        }
      }
    };
    this.children = [];
    this._innerHTML = '';
    this.dataset = {};
    this.style = {};
    this.listeners = {};
  }

  get className() {
    return Array.from(this.classList._classes).join(' ');
  }

  set className(val) {
    this.classList._classes = new Set((val || '').split(/\s+/).filter(Boolean));
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    this._innerHTML = val;
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
  }

  addEventListener(event, fn) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(fn);
  }

  querySelector(sel) {
    return this._findChild(this, sel);
  }

  querySelectorAll(sel) {
    const results = [];
    this._findAll(this, sel, results);
    return results;
  }

  _findChild(node, sel) {
    for (const child of node.children) {
      if (this._matches(child, sel)) return child;
      const found = this._findChild(child, sel);
      if (found) return found;
    }
    return null;
  }

  _findAll(node, sel, results) {
    for (const child of node.children) {
      if (this._matches(child, sel)) results.push(child);
      this._findAll(child, sel, results);
    }
  }

  _matches(node, sel) {
    if (sel.startsWith('.')) return node.classList.contains(sel.slice(1));
    if (sel.startsWith('#')) return node.id === sel.slice(1);
    return node.tagName.toLowerCase() === sel.toLowerCase();
  }
}

const mockElements = {
  'tracks-container': new MockDOMElement('tracks-container'),
  'audio-player': {
    currentTime: 0,
    duration: 180,
    paused: false,
    addEventListener: function(event, fn) {
      this.listeners = this.listeners || {};
      this.listeners[event] = this.listeners[event] || [];
      this.listeners[event].push(fn);
    },
    removeEventListener: () => {}
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
  Object,
  Boolean,
  Promise,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  performance: { now: () => Date.now() },
  window: null,
  document: {
    readyState: 'complete',
    getElementById: (id) => mockElements[id] || null,
    createElement: (tag) => new MockDOMElement('', tag),
    querySelector: (sel) => {
      for (const el of Object.values(mockElements)) {
        if (el._matches && el._matches(el, sel)) return el;
      }
      return new MockDOMElement('', 'div');
    },
    querySelectorAll: (sel) => [],
    addEventListener: () => {}
  },
  localStorage: {
    _data: {},
    getItem: function (k) { return this._data[k] || null; },
    setItem: function (k, v) { this._data[k] = String(v); },
    removeItem: function (k) { delete this._data[k]; }
  },
  showToastNotification: () => {},
  playlist: [
    { id: 'track_1', title: 'Трубы, Бетонные', artist: 'CrazyFrog28', duration: '3:00', thumbnail: 'thumb1.jpg' }
  ],
  currentTrackIndex: 0,
  audioPlayer: mockElements['audio-player'],
  GP: {}
};

sandbox.window = sandbox;

console.log('====================================================');
console.log('   GLASSPLAYER STATS & ANALYTICS UNIT TESTS         ');
console.log('====================================================\n');

// 1. Run utils.js first
const utilsCode = fs.readFileSync(path.join(__dirname, '../js/core/utils.js'), 'utf8');
vm.runInNewContext(utilsCode, sandbox);

// 2. Setup legacy data to verify migration
sandbox.localStorage.setItem('gp_stats_total_seconds', '298080'); // 82.8 hours
sandbox.localStorage.setItem('gp_stats_counts', JSON.stringify({
  'track_1': { id: 'track_1', title: 'Трубы, Бетонные', artist: 'CrazyFrog28', thumbnail: 'thumb1.jpg', count: 4, lastPlayedAt: Date.now() },
  'track_2': { id: 'track_2', title: 'Illuminati', artist: 'benjamingotbenz', thumbnail: 'thumb2.jpg', count: 2, lastPlayedAt: Date.now() }
}));

// 3. Run player-controller.js
const playerCode = fs.readFileSync(path.join(__dirname, '../js/player/player-controller.js'), 'utf8');
vm.runInNewContext(playerCode, sandbox);

// Test 1: Namespace and methods exist
assert(sandbox.GP && sandbox.GP.Player, 'GP.Player namespace exists');
assert(typeof sandbox.getUnifiedListeningStats === 'function', 'getUnifiedListeningStats is exported');
assert(typeof sandbox.recordListeningSeconds === 'function', 'recordListeningSeconds is exported');

// Test 2: Migration of legacy hours and tracks
const initialStats = sandbox.getUnifiedListeningStats();
assert(initialStats.totalSeconds >= 298080, `Legacy 82.8 hours successfully migrated (totalSeconds: ${initialStats.totalSeconds})`);
assert(initialStats.tracks['track_1'] && initialStats.tracks['track_1'].count === 4, 'Legacy track_1 count (4) preserved');
assert(initialStats.tracks['track_2'] && initialStats.tracks['track_2'].count === 2, 'Legacy track_2 count (2) preserved');
assert(initialStats.artists['CrazyFrog28'] && initialStats.artists['CrazyFrog28'].count >= 4, 'Artist CrazyFrog28 aggregated from legacy counts');

// Test 3: Playback time recording
const beforeSec = initialStats.totalSeconds;
sandbox.recordListeningSeconds(15);
const afterSec = sandbox.getUnifiedListeningStats().totalSeconds;
assert(afterSec === beforeSec + 15, 'recordListeningSeconds accurately incremented playback time');

// Test 4: Track increment & Repeat Loop counting
const testTrack = { id: 'track_1', title: 'Трубы, Бетонные', artist: 'CrazyFrog28', duration: '3:00', thumbnail: 'thumb1.jpg' };
sandbox.playlist = [testTrack];
sandbox.currentTrackIndex = 0;

const curTrackCount = sandbox.getUnifiedListeningStats().tracks['track_1'].count;
sandbox.incrementPlayCount(testTrack);
const newTrackCount = sandbox.getUnifiedListeningStats().tracks['track_1'].count;
assert(newTrackCount === curTrackCount + 1, 'incrementPlayCount incremented play count for track_1');

// Test 5: Verify resetPlayCountSession allows repeat loop to count again
sandbox.resetPlayCountSession(testTrack);
sandbox.playCountSession.continuousSeconds = 35; // Listened for > 30s
sandbox.maybeCommitQualifiedPlay();
const afterRepeatCount = sandbox.getUnifiedListeningStats().tracks['track_1'].count;
assert(afterRepeatCount === newTrackCount + 1, 'Repeat replay qualified and counted +1 play after session reset');

// 4. Run stats-view.js
const statsViewCode = fs.readFileSync(path.join(__dirname, '../js/views/stats-view.js'), 'utf8');
vm.runInNewContext(statsViewCode, sandbox);

assert(sandbox.GP.Views && sandbox.GP.Views.Stats, 'GP.Views.Stats namespace exists');
assert(typeof sandbox.GP.Views.Stats.renderStatsView === 'function', 'renderStatsView function exists');
assert(typeof sandbox.GP.Views.Stats.formatDuration === 'function', 'formatDuration function exists');
assert(typeof sandbox.GP.Views.Stats.aggregateStatsForPeriod === 'function', 'aggregateStatsForPeriod function exists');

// Test 6: Duration formatting
assert(sandbox.GP.Views.Stats.formatDuration(45) === '45 сек', 'Format < 60s is formatted in seconds');
assert(sandbox.GP.Views.Stats.formatDuration(180) === '3 мин', 'Format 180s is 3 мин');
assert(sandbox.GP.Views.Stats.formatDuration(3600) === '1 ч', 'Format 3600s is 1 ч');
assert(sandbox.GP.Views.Stats.formatDuration(298080).includes('д') || sandbox.GP.Views.Stats.formatDuration(298080).includes('ч'), 'Format 82.8h is formatted properly');

// Test 7: Period aggregation
const periodAll = sandbox.GP.Views.Stats.aggregateStatsForPeriod(sandbox.getUnifiedListeningStats(), 'all');
assert(Array.isArray(periodAll.topTracks), 'topTracks is an array');
assert(periodAll.topTracks.length >= 2, 'Top tracks contains at least 2 tracks');
assert(periodAll.topTracks[0].id === 'track_1', 'Top #1 track is track_1');
assert(periodAll.heroTrack && periodAll.heroTrack.id === 'track_1', 'Hero spotlight track is track_1');
assert(Array.isArray(periodAll.slots) && periodAll.slots.length === 4, 'Time of day slots has 4 quadrants');

// Test 8: Render stats view into container
const container = mockElements['tracks-container'];
sandbox.renderStatsView(container);
assert(container.children.length === 1, 'renderStatsView rendered dashboard into container');
const dashboard = container.children[0];
assert(dashboard.classList.contains('stats-dashboard'), 'Dashboard has .stats-dashboard class');

console.log('\n----------------------------------------------------');
console.log(`TEST RESULTS: ${passCount} / ${passCount + failCount} PASSED`);
if (failCount === 0) {
  console.log('[ALL STATS TESTS PASSED SUCCESSFULLY]');
  process.exit(0);
} else {
  console.error(`[SOME TESTS FAILED: ${failCount}]`);
  process.exit(1);
}
console.log('====================================================\n');
