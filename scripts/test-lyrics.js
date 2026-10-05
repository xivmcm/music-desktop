/**
 * Unit tests for GlassPlayer Synced Lyrics & Karaoke Engine
 * (js/lyrics/lyrics-engine.js)
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

// Mock DOM elements
class MockDOMElement {
  constructor(id = '', tagName = 'div') {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.classList = {
      _classes: new Set(),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c),
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
    this.clientHeight = 400;
    this.offsetTop = 0;
    this.scrollTop = 0;
    this.listeners = {};
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

  scrollTo(options) {
    this.scrollTop = options.top;
  }
}

const mockElements = {
  'lyrics-overlay': new MockDOMElement('lyrics-overlay'),
  'lyrics-ambient-bg': new MockDOMElement('lyrics-ambient-bg'),
  'lyrics-content': new MockDOMElement('lyrics-content'),
  'lyrics-track-title': new MockDOMElement('lyrics-track-title'),
  'lyrics-track-artist': new MockDOMElement('lyrics-track-artist'),
  'lyrics-track-cover': new MockDOMElement('lyrics-track-cover', 'img'),
  'lyrics-source-badge': new MockDOMElement('lyrics-source-badge'),
  'lyrics-close-btn': new MockDOMElement('lyrics-close-btn'),
  'lyrics-btn': new MockDOMElement('lyrics-btn'),
  'audio-player': {
    currentTime: 10,
    addEventListener: () => {},
    removeEventListener: () => {}
  }
};

const domEvents = {};
let rafId = 1;

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
  requestAnimationFrame: (cb) => { cb(); return rafId++; },
  window: null,
  document: {
    readyState: 'complete',
    getElementById: (id) => mockElements[id] || null,
    createElement: (tag) => new MockDOMElement('', tag),
    addEventListener: (evt, fn) => {
      domEvents[evt] = domEvents[evt] || [];
      domEvents[evt].push(fn);
    }
  },
  localStorage: {
    _data: {},
    getItem: function (k) { return this._data[k] || null; },
    setItem: function (k, v) { this._data[k] = String(v); },
    removeItem: function (k) { delete this._data[k]; }
  },
  showToastNotification: () => {},
  playlist: [
    { id: 'track_1', title: 'Test Song', artist: 'Test Artist', thumbnail: 'thumb.jpg' }
  ],
  currentTrackIndex: 0,
  audioPlayer: mockElements['audio-player'],
  GP: {}
};

sandbox.window = sandbox;

console.log('====================================================');
console.log('     GLASSPLAYER JS/LYRICS-ENGINE UNIT TESTS        ');
console.log('====================================================\n');

// 1. Run utils.js first
const utilsCode = fs.readFileSync(path.join(__dirname, '../js/core/utils.js'), 'utf8');
vm.runInNewContext(utilsCode, sandbox);

// 2. Run lyrics-engine.js
const lyricsCode = fs.readFileSync(path.join(__dirname, '../js/lyrics/lyrics-engine.js'), 'utf8');
vm.runInNewContext(lyricsCode, sandbox);

assert(sandbox.GP && sandbox.GP.Lyrics, 'GP.Lyrics namespace exists');
assert(typeof sandbox.cleanLyricsQuery === 'function', 'cleanLyricsQuery function exists');
assert(typeof sandbox.syncLyricsToTime === 'function', 'syncLyricsToTime function exists');
assert(typeof sandbox.renderLRCLines === 'function', 'renderLRCLines function exists');
assert(typeof sandbox.openLyricsOverlay === 'function', 'openLyricsOverlay function exists');
assert(typeof sandbox.closeLyricsOverlay === 'function', 'closeLyricsOverlay function exists');
assert(typeof sandbox.lyricsState === 'object', 'lyricsState object exists');

// 3. Test cleanLyricsQuery
const query1 = sandbox.cleanLyricsQuery('MAYOT - 21 (Official Audio) #rap [HQ]', 'MAYOT');
assert(query1.artist === 'MAYOT', 'Artist parsed correctly from title');
assert(query1.songName === '21', 'Song name cleaned of labels and brackets');
assert(query1.directQuery === 'MAYOT 21', 'Direct query formulated cleanly');

// 4. Test renderLRCLines
const sampleLRC = [
  { time: 5, text: 'First line of the song' },
  { time: 10, text: 'Second line of the song' },
  { time: 15, text: 'Third line of the song' }
];

sandbox.lyricsState.lrcLines = sampleLRC;
sandbox.renderLRCLines(sampleLRC);

const content = mockElements['lyrics-content'];
assert(content.children.length === 3, 'renderLRCLines created 3 line DOM elements');
assert(content.children[0].dataset.time == '5', 'Line dataset time matches LRC');
assert(content.children[0].textContent === 'First line of the song', 'Line text matches LRC');

// 5. Test syncLyricsToTime (time synchronization and zero-overhead guard)
// Current time: 4s (before line 1)
sandbox.syncLyricsToTime(4);
assert(sandbox.lyricsState.lastActiveIdx === -1, 'Time 4s: no line is active');

// Current time: 6s (line 0 active)
sandbox.syncLyricsToTime(6);
assert(sandbox.lyricsState.lastActiveIdx === 0, 'Time 6s: line 0 is active');
assert(content.children[0].classList.contains('active'), 'Line 0 DOM element has "active" class');

// Current time: 8s (still line 0 active -> guard should exit early without mutating DOM)
sandbox.syncLyricsToTime(8);
assert(sandbox.lyricsState.lastActiveIdx === 0, 'Time 8s: line 0 remains active (guard prevents redundant DOM work)');

// Current time: 12s (line 1 active, line 0 becomes past)
sandbox.syncLyricsToTime(12);
assert(sandbox.lyricsState.lastActiveIdx === 1, 'Time 12s: line 1 is active');
assert(content.children[0].classList.contains('past'), 'Line 0 marked as past');
assert(content.children[1].classList.contains('active'), 'Line 1 marked as active');

// 6. Test open & close overlay
sandbox.openLyricsOverlay();
assert(sandbox.lyricsState.isOpen === true, 'openLyricsOverlay sets isOpen to true');
assert(mockElements['lyrics-overlay'].classList.contains('visible'), 'overlay element marked visible');

sandbox.closeLyricsOverlay();
assert(sandbox.lyricsState.isOpen === false, 'closeLyricsOverlay sets isOpen to false');
assert(!mockElements['lyrics-overlay'].classList.contains('visible'), 'overlay element removes visible');

// 7. Test reactive properties
assert(Array.isArray(sandbox.currentLyrics), 'window.currentLyrics returns array');
assert(typeof sandbox.isLyricsModalOpen === 'boolean', 'window.isLyricsModalOpen returns boolean');

console.log('\n----------------------------------------------------');
console.log(`TEST RESULTS: ${passCount} / ${passCount + failCount} PASSED`);
if (failCount === 0) {
  console.log('[ALL TESTS PASSED SUCCESSFULLY]');
} else {
  console.error(`[SOME TESTS FAILED: ${failCount}]`);
  process.exit(1);
}
console.log('====================================================\n');
