/**
 * Unit Tests for GlassPlayer Components (Notifications, TrackCard, Share)
 * Tests js/components/notifications.js, js/components/track-card.js, js/components/share.js
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
const domStore = {};

function createMockElement(id = '', tag = 'div') {
  const listeners = {};
  const classListSet = new Set();
  const children = [];
  const dataset = {};
  const styleObj = {};
  let innerHTMLStr = '';
  let textContentStr = '';
  let currentId = id;

  const el = {
    tagName: tag.toUpperCase(),
    dataset,
    value: '',
    checked: false,
    type: 'text',
    disabled: false,
    hidden: false,
    style: {
      setProperty: (k, v) => { styleObj[k] = v; },
      getPropertyValue: (k) => styleObj[k] || '',
      ...styleObj
    },
    children,
    parentElement: null,
    classList: {
      add: (...cls) => cls.forEach(c => classListSet.add(c)),
      remove: (...cls) => cls.forEach(c => classListSet.delete(c)),
      toggle: (c, force) => {
        if (typeof force === 'boolean') {
          if (force) classListSet.add(c); else classListSet.delete(c);
          return force;
        }
        if (classListSet.has(c)) { classListSet.delete(c); return false; }
        classListSet.add(c); return true;
      },
      contains: (c) => classListSet.has(c)
    },
    addEventListener: (event, handler) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    removeEventListener: (event, handler) => {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(h => h !== handler);
    },
    dispatchEvent: (event) => {
      const type = typeof event === 'string' ? event : event.type;
      const handlers = listeners[type] || [];
      const evObj = typeof event === 'string' ? { type, target: el, stopPropagation: () => {} } : event;
      handlers.forEach(h => h(evObj));
    },
    click: () => {
      const handlers = listeners['click'] || [];
      handlers.forEach(h => h({ type: 'click', target: el, stopPropagation: () => {} }));
    },
    focus: () => {},
    setAttribute: (k, v) => { dataset[k] = v; },
    getAttribute: (k) => dataset[k] || null,
    removeAttribute: (k) => { delete dataset[k]; },
    append: (...items) => {
      items.forEach(item => {
        if (typeof item === 'string') {
          const textNode = createMockElement('', 'span');
          textNode.textContent = item;
          el.appendChild(textNode);
        } else if (item) {
          el.appendChild(item);
        }
      });
    },
    insertAdjacentElement: (pos, item) => {
      if (el.parentElement) {
        el.parentElement.appendChild(item);
      }
      return item;
    },
    appendChild: (child) => {
      if (child) {
        child.parentElement = el;
        children.push(child);
      }
      return child;
    },
    removeChild: (child) => {
      const idx = children.indexOf(child);
      if (idx !== -1) {
        if (child.id && domStore[child.id] === child) delete domStore[child.id];
        child.parentElement = null;
        children.splice(idx, 1);
      }
      return child;
    },
    remove: () => {
      if (currentId && domStore[currentId] === el) delete domStore[currentId];
      if (el.parentElement) {
        el.parentElement.removeChild(el);
      }
    },
    querySelector: (sel) => {
      if (sel.startsWith('#')) {
        const targetId = sel.slice(1);
        if (el.id === targetId) return el;
        for (const child of children) {
          const res = child.querySelector ? child.querySelector(sel) : null;
          if (res) return res;
        }
      }
      if (sel.startsWith('.')) {
        const classes = sel.split('.').filter(Boolean);
        const match = classes.every(c => el.classList.contains(c));
        if (match) return el;
        for (const child of children) {
          const res = child.querySelector ? child.querySelector(sel) : null;
          if (res) return res;
        }
      }
      for (const child of children) {
        if (child.tagName && child.tagName.toLowerCase() === sel.toLowerCase()) return child;
        const res = child.querySelector ? child.querySelector(sel) : null;
        if (res) return res;
      }
      if (sel === 'span' && innerHTMLStr.includes('<span')) {
        const spanEl = createMockElement('', 'span');
        el.appendChild(spanEl);
        return spanEl;
      }
      return null;
    },
    querySelectorAll: (sel) => {
      const result = [];
      function collect(node) {
        if (sel.startsWith('.')) {
          const cls = sel.slice(1);
          if (node.classList && node.classList.contains(cls)) result.push(node);
        } else if (sel.startsWith('#')) {
          const targetId = sel.slice(1);
          if (node.id === targetId) result.push(node);
        } else if (node.tagName && node.tagName.toLowerCase() === sel.toLowerCase()) {
          result.push(node);
        }
        if (node.children) node.children.forEach(collect);
      }
      children.forEach(collect);
      return result;
    },
    closest: (sel) => {
      let cur = el;
      while (cur) {
        if (sel.startsWith('.') && cur.classList && cur.classList.contains(sel.slice(1))) return cur;
        if (sel.startsWith('#') && cur.id === sel.slice(1)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
  };

  Object.defineProperty(el, 'innerHTML', {
    get: () => {
      if (children.length > 0) {
        return (innerHTMLStr ? innerHTMLStr + '\n' : '') + children.map(c => c.innerHTML).join('\n');
      }
      return innerHTMLStr;
    },
    set: (val) => {
      innerHTMLStr = String(val);
      children.length = 0;
      if (innerHTMLStr.includes('id="')) {
        const matches = innerHTMLStr.matchAll(/id="([^"]+)"/g);
        for (const m of matches) {
          const sub = createMockElement(m[1]);
          sub.parentElement = el;
          children.push(sub);
        }
      }
      if (innerHTMLStr.includes('class="')) {
        const matches = innerHTMLStr.matchAll(/class="([^"]+)"/g);
        for (const m of matches) {
          const classes = m[1].split(/\s+/);
          const sub = createMockElement('');
          classes.forEach(c => sub.classList.add(c));
          sub.parentElement = el;
          children.push(sub);
        }
      }
    }
  });

  Object.defineProperty(el, 'textContent', {
    get: () => textContentStr || innerHTMLStr.replace(/<[^>]*>/g, ''),
    set: (val) => { textContentStr = String(val); innerHTMLStr = String(val); }
  });

  Object.defineProperty(el, 'className', {
    get: () => Array.from(classListSet).join(' '),
    set: (val) => {
      classListSet.clear();
      if (val) String(val).split(/\s+/).filter(Boolean).forEach(c => classListSet.add(c));
    }
  });

  Object.defineProperty(el, 'id', {
    get: () => currentId,
    set: (val) => {
      if (currentId && domStore[currentId] === el) delete domStore[currentId];
      currentId = String(val || '');
      if (currentId) domStore[currentId] = el;
    }
  });

  if (currentId) {
    domStore[currentId] = el;
  }

  return el;
}

const mockBody = createMockElement('body', 'body');
const mockDocument = {
  getElementById: (id) => domStore[id] || null,
  querySelector: (sel) => {
    if (sel.startsWith('#')) return mockDocument.getElementById(sel.slice(1));
    for (const id in domStore) {
      const match = domStore[id].querySelector ? domStore[id].querySelector(sel) : null;
      if (match) return match;
    }
    return null;
  },
  createElement: (tag) => createMockElement('', tag),
  body: mockBody,
  addEventListener: () => {},
  removeEventListener: () => {}
};

// Setup Environment
const sandbox = {
  window: {},
  document: mockDocument,
  navigator: {
    clipboard: {
      writeText: async (text) => true
    }
  },
  console: console,
  setTimeout: (fn, ms) => {
    if (ms <= 50) {
      fn();
      return 1;
    }
    return 999;
  },
  clearTimeout: () => {},
  requestAnimationFrame: (fn) => { fn(); return 1; },
  Date: Date,
  URL: URL,
  URLSearchParams: URLSearchParams,
  DEFAULT_MIRRORS: ['https://music-backend-iyni.onrender.com'],
  playlist: [],
  currentTrackIndex: 0,
  activePlayingTrack: null,
  likedTrackIds: new Set(),
  activeView: 'home',
  currentLibrarySubTab: 'all',
  playTrack: () => {},
  togglePlay: () => {},
  toggleLike: () => {},
  loadArtistView: () => {},
  performSearch: () => {},
  addEventListener: () => {},
  removeEventListener: () => {}
};
sandbox.window = sandbox;
sandbox.global = sandbox;

// Create elements expected by components
const tracksContainer = createMockElement('tracks-container', 'div');
mockBody.appendChild(tracksContainer);
const playerLikeBtn = createMockElement('player-like-btn', 'button');
mockBody.appendChild(playerLikeBtn);
const audioPlayer = createMockElement('audio-player', 'audio');
mockBody.appendChild(audioPlayer);

// Load component scripts
const notifCode = fs.readFileSync(path.join(__dirname, '../js/components/notifications.js'), 'utf8');
const trackCardCode = fs.readFileSync(path.join(__dirname, '../js/components/track-card.js'), 'utf8');
const shareCode = fs.readFileSync(path.join(__dirname, '../js/components/share.js'), 'utf8');

const context = vm.createContext(sandbox);
vm.runInContext(notifCode, context);
vm.runInContext(trackCardCode, context);
vm.runInContext(shareCode, context);

async function runTests() {
  console.log('\n=== Starting Components Unit Tests (Notifications, TrackCard, Share) ===\n');

  // --- Suite 1: Notifications Component ---
  console.log('[Suite 1: Notifications Component]');
  assert(context.GP.Components && typeof context.GP.Components === 'object', 'GP.Components namespace exists');
  assert(typeof context.GP.Components.Notifications === 'object', 'GP.Components.Notifications namespace exists');
  assert(typeof context.GP.Components.Notifications.showToastNotification === 'function', 'showToastNotification exported');
  assert(typeof context.GP.Components.Notifications.showConfirmDialog === 'function', 'showConfirmDialog exported');
  assert(context.window.showToastNotification === context.GP.Components.Notifications.showToastNotification, 'window.showToastNotification alias exists');
  assert(context.window.showConfirmDialog === context.GP.Components.Notifications.showConfirmDialog, 'window.showConfirmDialog alias exists');

  // Test toast creation
  context.window.showToastNotification('Test Message', 'success', 'Success Title');
  const toastContainer = domStore['toast-container'];
  assert(toastContainer !== null, 'toast-container created in DOM');
  assert(toastContainer.children.length > 0, 'Toast element appended to container');
  const toastEl = toastContainer.children[0];
  assert(toastEl.classList.contains('toast-success'), 'Toast has correct type class');

  // Test confirm dialog
  const confirmPromise = context.window.showConfirmDialog({
    title: 'Подтвердите действие',
    message: 'Вы уверены?',
    confirmLabel: 'Да'
  });
  const overlay = mockBody.children.find(c => c.classList && c.classList.contains('gp-confirm-overlay'));
  assert(overlay !== null, 'gp-confirm-overlay rendered in DOM');
  const confirmBtn = overlay.querySelector('.gp-confirm-button.confirm');
  assert(confirmBtn !== null, 'Confirm button rendered in dialog');
  confirmBtn.click();
  const confirmed = await confirmPromise;
  assert(confirmed === true, 'showConfirmDialog resolved to true on confirm click');

  // --- Suite 2: Track Card Component ---
  console.log('\n[Suite 2: Track Card Component]');
  assert(typeof context.GP.Components.TrackCard === 'object', 'GP.Components.TrackCard namespace exists');
  assert(typeof context.GP.Components.TrackCard.renderTracks === 'function', 'renderTracks exported');
  assert(context.window.renderTracks === context.GP.Components.TrackCard.renderTracks, 'window.renderTracks alias exists');

  const sampleTracks = [
    { id: 'sc_track_1', title: 'Solar Eclipse', artist: 'Bladee', source: 'soundcloud', duration: '3:15' },
    { id: 'sp_track_2', title: 'Hennessy & Sailor Moon', artist: 'Yung Lean', source: 'spotify', duration: '4:10' }
  ];

  context.window.renderTracks(sampleTracks, tracksContainer);
  const grid = tracksContainer.querySelector('.tracks-layout-grid');
  assert(grid !== null, 'tracks-layout-grid rendered');
  assert(grid.children.length === 2, '2 track cards rendered in grid');

  const firstCard = grid.children[0];
  assert(firstCard.dataset.trackId === 'sc_track_1', 'First card has correct dataset trackId');
  assert(firstCard.querySelector('.card-title') !== null, 'Card contains title');
  assert(firstCard.querySelector('.artist-link') !== null, 'Card contains artist link');
  assert(firstCard.querySelector('.like-btn') !== null, 'Card contains like button');

  // --- Suite 3: Track Sharing Component ---
  console.log('\n[Suite 3: Track Sharing Component]');
  assert(typeof context.GP.Components.Share === 'object', 'GP.Components.Share namespace exists');
  assert(typeof context.GP.Components.Share.isTrackShareable === 'function', 'isTrackShareable exported');
  assert(typeof context.GP.Components.Share.buildTrackShareUrl === 'function', 'buildTrackShareUrl exported');
  assert(typeof context.GP.Components.Share.copyTrackShareLink === 'function', 'copyTrackShareLink exported');
  assert(typeof context.GP.Components.Share.playSharedTrack === 'function', 'playSharedTrack exported');
  assert(typeof context.GP.Components.Share.handleIncomingShareLink === 'function', 'handleIncomingShareLink exported');
  assert(typeof context.GP.Components.Share.initPlayerShareButton === 'function', 'initPlayerShareButton exported');

  // Test isTrackShareable
  assert(context.window.isTrackShareable(sampleTracks[0]) === true, 'SoundCloud track is shareable');
  assert(context.window.isTrackShareable(sampleTracks[1]) === true, 'Spotify track is shareable');
  assert(context.window.isTrackShareable({ id: 'loc_1', source: 'local' }) === false, 'Local track is NOT shareable');

  // Test buildTrackShareUrl
  const shareUrl = context.window.buildTrackShareUrl(sampleTracks[0]);
  assert(typeof shareUrl === 'string' && shareUrl.includes('/share/track'), 'Share URL contains endpoint');
  assert(shareUrl.includes('id=sc_track_1'), 'Share URL contains track id');
  assert(shareUrl.includes('src=soundcloud'), 'Share URL contains source');

  // Test copyTrackShareLink
  let toastMsg = '';
  context.window.showToastNotification = (msg) => { toastMsg = msg; };
  await context.window.copyTrackShareLink(sampleTracks[0]);
  assert(toastMsg.includes('скопирована'), 'Toast notification shown on successful copy');

  // Test initPlayerShareButton
  context.window.initPlayerShareButton();
  const playerShareBtn = domStore['player-share-btn'];
  assert(playerShareBtn !== null, 'player-share-btn created in player bar');

  // Test playSharedTrack
  let playedIdx = -1;
  context.window.playTrack = (idx) => { playedIdx = idx; };
  context.window.playSharedTrack({ id: 'shared_99', title: 'Shared Song', artist: 'Artist X', source: 'soundcloud' });
  assert(playedIdx >= 0, 'playSharedTrack triggered playback');

  console.log(`\n==============================================`);
  console.log(`ALL COMPONENT TESTS PASSED: ${passedTests}/${totalTests}`);
  console.log(`==============================================\n`);
}

runTests().catch(err => {
  console.error('\n[FATAL TEST FAILURE]:', err);
  process.exit(1);
});
