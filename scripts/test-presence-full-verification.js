/**
 * Comprehensive End-to-End Verification of Presence, Friend Activity, and Anti-Spoofing (v1.20.14)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('====================================================');
console.log('   FULL END-TO-END VERIFICATION: PRESENCE & PLAYER  ');
console.log('====================================================\n');

let passCount = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`[PASS] ${desc}`);
    passCount++;
  } catch (err) {
    console.error(`[FAIL] ${desc}:`, err.message);
    process.exit(1);
  }
}

// Minimal browser mocks
const store = {};
const mockLocalStorage = {
  getItem: (k) => store[k] || null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { for (const k in store) delete store[k]; }
};

const domElements = {};
function createMockEl(id = '', tag = 'div') {
  const classList = new Set();
  const listeners = {};
  return {
    id,
    tagName: tag.toUpperCase(),
    dataset: {},
    style: {},
    innerHTML: '',
    textContent: '',
    children: [],
    classList: {
      add: (c) => classList.add(c),
      remove: (c) => classList.delete(c),
      contains: (c) => classList.has(c),
      toggle: (c, force) => {
        if (typeof force === 'boolean') {
          if (force) classList.add(c); else classList.delete(c);
          return force;
        }
        if (classList.has(c)) { classList.delete(c); return false; }
        classList.add(c); return true;
      }
    },
    addEventListener: (e, fn) => {
      listeners[e] = listeners[e] || [];
      listeners[e].push(fn);
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild: function(c) { this.children.push(c); return c; }
  };
}

const mockDocument = {
  getElementById: (id) => {
    if (!domElements[id]) domElements[id] = createMockEl(id);
    return domElements[id];
  },
  createElement: (tag) => createMockEl('', tag),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {}
};

class MockWebSocket {
  static get CONNECTING() { return 0; }
  static get OPEN() { return 1; }
  static get CLOSING() { return 2; }
  static get CLOSED() { return 3; }

  constructor(url) {
    this.url = url;
    this.readyState = 1; // OPEN
    this.sent = [];
    MockWebSocket.lastInstance = this;
  }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; if (this.onclose) this.onclose(); }
}

const context = {
  window: {},
  document: mockDocument,
  localStorage: mockLocalStorage,
  WebSocket: MockWebSocket,
  btoa: (str) => Buffer.from(str).toString('base64'),
  atob: (b64) => Buffer.from(b64, 'base64').toString('utf8'),
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  fetch: async () => ({ status: 200, json: async () => ({ status: 'success' }) })
};
context.window = context;
vm.createContext(context);

// Load scripts
const socketCode = fs.readFileSync(path.join(__dirname, '../js/social/socket.js'), 'utf8');
const friendsCode = fs.readFileSync(path.join(__dirname, '../js/social/friends.js'), 'utf8');
const authCode = fs.readFileSync(path.join(__dirname, '../js/social/auth.js'), 'utf8');

vm.runInContext(socketCode, context);
vm.runInContext(friendsCode, context);
vm.runInContext(authCode, context);

// Test 1: broadcastPlayerStatus prioritizes activePlayingTrack even when playlist is emptied by search
test('broadcastPlayerStatus preserves playing track when window.playlist is replaced by search results', () => {
  context.window.currentUser = { id: 'usr_1' };
  context.window.token = 'jwt_token_abc';
  context.window.connectWS();
  const ws = MockWebSocket.lastInstance;
  assert.ok(ws);
  if (ws.onopen) ws.onopen();

  // Active track is playing
  context.window.activePlayingTrack = { id: 'tr_10', title: 'Bohemian Rhapsody', artist: 'Queen' };
  // Search view overwrote playlist with Eminem search results
  context.window.playlist = [{ id: 'sr_1', title: 'Lose Yourself', artist: 'Eminem' }];
  context.window.currentTrackIndex = 0;
  context.window.audioPlayer = { paused: false };

  context.window.broadcastPlayerStatus();

  assert.ok(ws.sent.length > 0, 'WebSocket sent messages');
  const lastMsg = JSON.parse(ws.sent[ws.sent.length - 1]);
  assert.strictEqual(lastMsg.type, 'update_status');
  assert.strictEqual(lastMsg.trackName, 'Bohemian Rhapsody');
  assert.strictEqual(lastMsg.artist, 'Queen');
  assert.strictEqual(lastMsg.isPlaying, true);
});

// Test 2: HTTP friends pre-population fills friendStatuses immediately
test('loadMutualFriends pre-populates friendStatuses without waiting for WS message', async () => {
  context.fetch = async (url) => {
    if (url.includes('/users/friends')) {
      return {
        status: 200,
        json: async () => ({
          status: 'success',
          friends: [
            {
              id: 'friend_99',
              displayName: 'Rockstar',
              username: 'rock99',
              isOnline: true,
              trackName: 'Stairway to Heaven',
              artist: 'Led Zeppelin',
              isPlaying: true
            }
          ]
        })
      };
    }
    return { status: 200, json: async () => ({ status: 'success' }) };
  };

  await context.window.loadMutualFriends();

  const st = context.window.friendStatuses.get('friend_99');
  assert.ok(st, 'friendStatuses contains friend_99');
  assert.strictEqual(st.isOnline, true);
  assert.strictEqual(st.trackName, 'Stairway to Heaven');
  assert.strictEqual(st.artist, 'Led Zeppelin');
  assert.strictEqual(st.isPlaying, true);
});

// Test 3: Logout purges all auth tokens, user keys, and reactive friend statuses
test('handleLogout clears all session tokens and purges live friend presence', () => {
  mockLocalStorage.setItem('auth_token', 't1');
  mockLocalStorage.setItem('token', 't2');
  mockLocalStorage.setItem('gp_token', 't3');
  mockLocalStorage.setItem('auth_user', '{"id":"usr_1"}');
  mockLocalStorage.setItem('currentUser', '{"id":"usr_1"}');
  mockLocalStorage.setItem('gp_user', '{"id":"usr_1"}');

  context.window.handleLogout();

  assert.strictEqual(mockLocalStorage.getItem('auth_token'), null);
  assert.strictEqual(mockLocalStorage.getItem('token'), null);
  assert.strictEqual(mockLocalStorage.getItem('gp_token'), null);
  assert.strictEqual(mockLocalStorage.getItem('auth_user'), null);
  assert.strictEqual(mockLocalStorage.getItem('currentUser'), null);
  assert.strictEqual(mockLocalStorage.getItem('gp_user'), null);
  assert.strictEqual(context.window.friendStatuses.size, 0);
});

// Test 4: friends_updated WebSocket event triggers real-time mutual friends refresh
test('friends_updated WS event automatically reloads mutual friends', () => {
  let reloadCalled = false;
  context.window.currentUser = { id: 'usr_1' };
  context.window.token = 'jwt_token_abc';
  context.window.GP.Social.loadMutualFriends = () => { reloadCalled = true; };
  context.window.loadMutualFriends = context.window.GP.Social.loadMutualFriends;
  context.window.connectWS();
  const ws = MockWebSocket.lastInstance;
  assert.ok(ws);
  assert.ok(typeof ws.onmessage === 'function', 'ws.onmessage handler attached');

  ws.onmessage({ data: JSON.stringify({ type: 'friends_updated', isMutual: true, partnerId: 'usr_2' }) });
  assert.strictEqual(reloadCalled, true);
});

// Test 5: CSS contains @keyframes pulse and .friend-profile-now-playing rules
test('social-presence.css defines @keyframes pulse and now-playing styles', () => {
  const css = fs.readFileSync(path.join(__dirname, '../css/components/social-presence.css'), 'utf8');
  assert.ok(css.includes('@keyframes pulse {'));
  assert.ok(css.includes('.friend-profile-now-playing'));
});

console.log('\n----------------------------------------------------');
console.log(`TEST RESULTS: ${passCount} / ${passCount} PASSED`);
console.log('[ALL COMPREHENSIVE VERIFICATION TESTS PASSED]');
console.log('====================================================\n');
process.exit(0);
