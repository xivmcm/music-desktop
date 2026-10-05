/**
 * GlassPlayer - Social Subsystem Unit Tests
 * Tests js/social/auth.js, js/social/socket.js, and js/social/friends.js
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
    value: '',
    textContent: '',
    style: {},
    disabled: false,
    children,
    get innerHTML() { return innerHTMLStr; },
    set innerHTML(val) {
      innerHTMLStr = val;
      if (val === '') {
        children.length = 0;
      }
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
        if (sel.startsWith('.') && item.innerHTML && item.innerHTML.includes(sel.slice(1))) {
          const mockInner = createMockElement('', 'div');
          mockInner.classList.add(sel.slice(1));
          results.push(mockInner);
        }
        for (const c of (item.children || [])) match(c);
      };
      for (const c of children) match(c);
      return results;
    },
    querySelector: function (sel) {
      const all = this.querySelectorAll(sel);
      if (all.length > 0) return all[0];
      const classMatch = sel.startsWith('.') && innerHTMLStr.includes(sel.slice(1));
      const idMatch = sel.startsWith('#') && innerHTMLStr.includes(sel.slice(1));
      if (classMatch || idMatch) {
        const mockChild = createMockElement(idMatch ? sel.slice(1) : '', 'div');
        if (classMatch) mockChild.classList.add(sel.slice(1));
        return mockChild;
      }
      return null;
    },
    cloneNode: function () {
      const clone = createMockElement(this.id, this.tagName);
      clone.innerHTML = innerHTMLStr;
      clone.textContent = this.textContent;
      return clone;
    },
    parentNode: null,
    replaceChild: function (newChild, oldChild) {
      return newChild;
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

// Setup global context for VM
const mockWindow = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  localStorage: localStorageMock,
  fetch: async (url, opts) => ({
    status: 200,
    ok: true,
    json: async () => ({ status: 'success', friends: [], users: [] })
  }),
  document: {
    getElementById: (id) => getOrCreateElement(id),
    createElement: (tag) => createMockElement('', tag),
    readyState: 'complete',
    addEventListener: () => {}
  },
  WebSocket: class MockWebSocket {
    static OPEN = 1;
    constructor(url) {
      this.url = url;
      this.readyState = MockWebSocket.OPEN;
      this.sent = [];
    }
    send(data) { this.sent.push(data); }
    close() { this.readyState = 3; }
  },
  BACKEND_URL: 'http://localhost:3000/api',
  showToastNotification: () => {},
  loadLikedTracks: async () => {},
  invalidateHomeRecommendations: () => {},
  getStorageOwnerSuffix: () => 'user1',
  getPlaylists: () => [{ id: 'pl_1', name: 'Chill Vibes', collaborators: [] }],
  savePlaylists: () => {},
  openPlaylist: () => {},
  btoa: (str) => Buffer.from(str).toString('base64'),
  atob: (str) => Buffer.from(str, 'base64').toString('utf8'),
  GP: {
    Utils: {
      escapeHTML: (str) => String(str || '').replace(/[&<>"']/g, ''),
      formatLastSeen: (ts) => (ts ? '5 минут назад' : 'только что'),
      getFullDateTooltip: (ts) => (ts ? '2026-10-05 12:00' : ''),
      formatUsername: (u) => `@${u || ''}`,
      fetchWithTimeout: async () => ({ status: 200, json: async () => ({ status: 'success' }) })
    }
  }
};

mockWindow.window = mockWindow;

const context = vm.createContext(mockWindow);

// Execute auth.js, socket.js, friends.js
const authCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'social', 'auth.js'), 'utf8');
const socketCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'social', 'socket.js'), 'utf8');
const friendsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'social', 'friends.js'), 'utf8');

vm.runInContext(authCode, context);
vm.runInContext(socketCode, context);
vm.runInContext(friendsCode, context);

console.log('====================================================');
console.log('   GLASSPLAYER JS/SOCIAL MODULES UNIT TESTS         ');
console.log('====================================================\n');

try {
  // Test 1: Namespaces exist
  assert(context.window.GP.Social !== undefined, 'GP.Social namespace exists');
  assert(context.window.GP.Social.Auth !== undefined, 'GP.Social.Auth namespace exists');
  assert(context.window.GP.Social.Socket !== undefined, 'GP.Social.Socket namespace exists');
  assert(context.window.GP.Social.Friends !== undefined, 'GP.Social.Friends namespace exists');

  // Test 2: Global Aliases
  assert(typeof context.window.initAuth === 'function', 'initAuth global alias exists');
  assert(typeof context.window.handleAuthSubmit === 'function', 'handleAuthSubmit global alias exists');
  assert(typeof context.window.handleLogout === 'function', 'handleLogout global alias exists');
  assert(typeof context.window.loadProfiles === 'function', 'loadProfiles global alias exists');
  assert(typeof context.window.switchUserProfile === 'function', 'switchUserProfile global alias exists');
  assert(typeof context.window.createUserProfile === 'function', 'createUserProfile global alias exists');
  assert(typeof context.window.deleteUserProfile === 'function', 'deleteUserProfile global alias exists');
  assert(typeof context.window.openAuthModal === 'function', 'openAuthModal global alias exists');
  assert(typeof context.window.connectWS === 'function', 'connectWS global alias exists');
  assert(typeof context.window.broadcastPlayerStatus === 'function', 'broadcastPlayerStatus global alias exists');
  assert(typeof context.window.loadMutualFriends === 'function', 'loadMutualFriends global alias exists');
  assert(typeof context.window.renderFriendActivity === 'function', 'renderFriendActivity global alias exists');
  assert(typeof context.window.playFriendTrack === 'function', 'playFriendTrack global alias exists');
  assert(typeof context.window.openCollabModal === 'function', 'openCollabModal global alias exists');
  assert(typeof context.window.syncPlaylistsFromServer === 'function', 'syncPlaylistsFromServer global alias exists');
  assert(typeof context.window.searchOtherUsers === 'function', 'searchOtherUsers global alias exists');
  assert(typeof context.window.renderFindFriendsList === 'function', 'renderFindFriendsList global alias exists');

  // Test 3: Reactive Getters / Setters
  assert(typeof context.window.friendStatuses.get === 'function' && typeof context.window.friendStatuses.set === 'function', 'friendStatuses is a reactive Map instance');
  assert(Array.isArray(context.window.mutualFriends), 'mutualFriends is a reactive Array');
  assert(context.window.currentUser === null, 'currentUser initial value is null');
  assert(context.window.token === null, 'token initial value is null');

  // Test 4: Profile Creation and Switching
  context.window.createUserProfile('WorkProfile');
  assert(context.window.profiles.includes('WorkProfile'), 'createUserProfile added WorkProfile to profiles list');
  const storedProfiles = JSON.parse(context.window.localStorage.getItem('gp_profiles'));
  assert(storedProfiles.includes('WorkProfile'), 'Profiles saved to localStorage');

  context.window.switchUserProfile('WorkProfile');
  assert(context.window.currentProfile === 'WorkProfile', 'switchUserProfile updated currentProfile');
  assert(context.window.localStorage.getItem('gp_active_profile') === 'WorkProfile', 'Active profile saved to localStorage');

  // Test 5: Profile Deletion
  context.window.deleteUserProfile('WorkProfile');
  assert(!context.window.profiles.includes('WorkProfile'), 'deleteUserProfile removed WorkProfile');
  assert(context.window.currentProfile === 'Default', 'Deleting active profile fell back to Default');

  // Test 6: Auth Modal Controller
  const authModal = getOrCreateElement('auth-modal');
  authModal.classList.add('hidden');
  context.window.openAuthModal();
  assert(!authModal.classList.contains('hidden'), 'openAuthModal removed hidden class from modal');

  const titleEl = getOrCreateElement('auth-modal-title');
  const submitBtn = getOrCreateElement('auth-modal-submit-btn');
  context.window.updateAuthModalState();
  assert(titleEl.textContent === 'Вход в аккаунт', 'updateAuthModalState sets login title');
  assert(submitBtn.textContent === 'Войти', 'updateAuthModalState sets login button text');

  context.window.isModalRegistering = true;
  context.window.updateAuthModalState();
  assert(titleEl.textContent === 'Регистрация', 'updateAuthModalState toggles to registration mode');
  assert(submitBtn.textContent === 'Создать аккаунт', 'updateAuthModalState sets register button text');

  // Test 7: WebSocket Presence & Timers
  context.window.currentUser = { id: 'u_101', displayName: 'Alex', username: 'alex101' };
  context.window.token = 'mock_jwt_token_123';

  context.window.connectWS();
  const ws = context.window.ws;
  assert(ws !== null, 'connectWS initialized WebSocket connection');
  assert(ws.url === 'ws://localhost:3000/api', 'WebSocket URL formatted correctly from BACKEND_URL');

  // Simulate WS open event
  ws.onopen();
  assert(ws.sent.length >= 1, 'WebSocket sent auth message on open');
  const authMsg = JSON.parse(ws.sent[0]);
  assert(authMsg.type === 'auth' && authMsg.userId === 'u_101', 'Auth message has type: auth and userId');

  // Send presence update
  context.window.sendPresenceUpdate('Midnight City', 'M83', true);
  const statusMsg = JSON.parse(ws.sent[ws.sent.length - 1]);
  assert(statusMsg.type === 'update_status', 'Presence message has type: update_status');
  assert(statusMsg.trackName === 'Midnight City', 'Presence contains trackName');
  assert(statusMsg.artist === 'M83', 'Presence contains artist');
  assert(statusMsg.isPlaying === true, 'Presence contains isPlaying = true');

  // Test 8: Friend Activity Rendering
  const friendActivityList = getOrCreateElement('friend-activity-list');
  context.window.mutualFriends = [
    {
      id: 'friend_1',
      displayName: 'Elena',
      username: 'elena_music',
      isOnline: true,
      avatarBase64: 'data:image/png;base64,mock'
    }
  ];
  context.window.friendStatuses.set('friend_1', {
    isOnline: true,
    isPlaying: true,
    trackName: 'Starboy',
    artist: 'The Weeknd'
  });

  context.window.renderFriendActivity();
  const activityItems = friendActivityList.querySelectorAll('.friend-activity-item');
  assert(activityItems.length === 1, 'renderFriendActivity rendered 1 friend item');
  assert(activityItems[0].dataset.friendId === 'friend_1', 'Item dataset friendId matches');
  const marquee = activityItems[0].querySelector('.friend-marquee');
  assert(marquee !== null, 'Playing friend has friend-marquee element');

  // Test 9: Collab Modal
  const collabModal = getOrCreateElement('collab-modal');
  collabModal.classList.add('hidden');
  const collabFriendsList = getOrCreateElement('collab-friends-list');
  const saveCollabBtn = getOrCreateElement('save-collab-btn');
  collabModal.appendChild(saveCollabBtn);

  context.window.openCollabModal('pl_1');
  assert(!collabModal.classList.contains('hidden'), 'openCollabModal opened collab modal');
  const checkboxes = collabFriendsList.querySelectorAll('.collab-friend-checkbox');
  assert(checkboxes.length === 1, 'Collab modal rendered mutual friend checkbox');

  // Test 10: Logout State Cleanup
  context.window.handleLogout();
  assert(context.window.currentUser === null, 'handleLogout set currentUser to null');
  assert(context.window.token === null, 'handleLogout set token to null');

  console.log('\n----------------------------------------------------');
  console.log(`TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
  console.log('[ALL TESTS PASSED SUCCESSFULLY]');
  console.log('====================================================\n');
  process.exit(0);
} catch (e) {
  console.error('\n[FAILED TEST SUITE]:', e);
  process.exit(1);
}
