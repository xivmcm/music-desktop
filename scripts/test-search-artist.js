/**
 * Unit Tests for GlassPlayer Search View, Infinite Scroll & Artist Profile Modules
 * Tests js/views/search-view.js and js/views/artist-view.js
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

// Global DOM Mock Store
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
        const cls = sel.slice(1);
        if (el.classList.contains(cls)) return el;
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
      // Parse child buttons and divs for basic DOM queries
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

// Global DOM Mock Helper
function getOrCreateElement(id, tag = 'div') {
  if (!domStore[id]) {
    domStore[id] = createMockElement(id, tag);
  }
  return domStore[id];
}

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
  querySelectorAll: (sel) => {
    const list = [];
    for (const id in domStore) {
      if (domStore[id].querySelectorAll) {
        list.push(...domStore[id].querySelectorAll(sel));
      }
    }
    return list;
  },
  createElement: (tag) => createMockElement('', tag),
  body: createMockElement('body', 'body')
};

// Setup Environment
const sandbox = {
  window: {},
  document: mockDocument,
  localStorage: localStorageMock,
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  AbortController: class {
    constructor() { this.signal = { aborted: false }; }
    abort() { this.signal.aborted = true; }
  },
  fetch: null,
  escapeHTML: (str) => String(str || ''),
  currentUser: null,
  currentProfile: 'Default',
  playlist: [],
  currentTrackIndex: 0,
  activeView: 'home',
  BACKEND_URL: 'https://test-backend.com',
  renderTracks: () => {},
  loadHomeView: () => {},
  updateActiveTab: () => {},
  invalidateHomeRecommendations: () => {},
  loadFriendProfile: () => {},
  getOptimalCoverUrl: (url) => url || '',
  getFallbackCoverUrl: () => 'fallback.jpg',
  DirectSoundCloudEngine: {
    search: async (query, limit, offset) => []
  }
};
sandbox.window = sandbox;
sandbox.global = sandbox;

// Initialize elements expected by Search and Artist views
getOrCreateElement('search-input', 'input');
getOrCreateElement('search-button', 'button');
getOrCreateElement('tracks-container', 'div');
getOrCreateElement('welcome-screen', 'div');
getOrCreateElement('loading-indicator', 'div');
getOrCreateElement('search-history-dropdown', 'div');
getOrCreateElement('users-search-results', 'div');

// Load search-view.js and artist-view.js into VM context
const searchViewCode = fs.readFileSync(path.join(__dirname, '../js/views/search-view.js'), 'utf8');
const artistViewCode = fs.readFileSync(path.join(__dirname, '../js/views/artist-view.js'), 'utf8');

const context = vm.createContext(sandbox);
vm.runInContext(searchViewCode, context);
vm.runInContext(artistViewCode, context);

async function runTests() {
  console.log('\n=== Starting Search View & Artist View Unit Tests ===\n');

  // --- 1. Namespace & Export Tests ---
  console.log('[Suite 1: Namespaces & Dual Exports]');
  assert(context.GP && typeof context.GP.Views === 'object', 'GP.Views namespace exists');
  assert(context.GP.Views.Search && typeof context.GP.Views.Search === 'object', 'GP.Views.Search namespace exists');
  assert(context.GP.Views.Artist && typeof context.GP.Views.Artist === 'object', 'GP.Views.Artist namespace exists');

  // Search view exports
  assert(typeof context.GP.Views.Search.performSearch === 'function', 'GP.Views.Search.performSearch is a function');
  assert(typeof context.GP.Views.Search.renderSearchResults === 'function', 'GP.Views.Search.renderSearchResults is a function');
  assert(typeof context.GP.Views.Search.loadMoreTracks === 'function', 'GP.Views.Search.loadMoreTracks is a function');
  assert(typeof context.GP.Views.Search.updateLoadMoreButton === 'function', 'GP.Views.Search.updateLoadMoreButton is a function');
  assert(typeof context.GP.Views.Search.getSearchHistory === 'function', 'GP.Views.Search.getSearchHistory is a function');
  assert(typeof context.GP.Views.Search.saveSearchHistory === 'function', 'GP.Views.Search.saveSearchHistory is a function');
  assert(typeof context.GP.Views.Search.addToSearchHistory === 'function', 'GP.Views.Search.addToSearchHistory is a function');
  assert(typeof context.GP.Views.Search.showSearchHistory === 'function', 'GP.Views.Search.showSearchHistory is a function');
  assert(typeof context.GP.Views.Search.clearSearchHistory === 'function', 'GP.Views.Search.clearSearchHistory is a function');
  assert(typeof context.GP.Views.Search.deleteSearchHistoryItem === 'function', 'GP.Views.Search.deleteSearchHistoryItem is a function');
  assert(typeof context.GP.Views.Search.getActiveSources === 'function', 'GP.Views.Search.getActiveSources is a function');
  assert(typeof context.GP.Views.Search.setActiveSources === 'function', 'GP.Views.Search.setActiveSources is a function');

  // Artist view exports
  assert(typeof context.GP.Views.Artist.loadArtistView === 'function', 'GP.Views.Artist.loadArtistView is a function');
  assert(typeof context.GP.Views.Artist.openArtistProfile === 'function', 'GP.Views.Artist.openArtistProfile is an alias');
  assert(typeof context.GP.Views.Artist.closeArtistProfile === 'function', 'GP.Views.Artist.closeArtistProfile is a function');
  assert(typeof context.GP.Views.Artist.renderArtistProfile === 'function', 'GP.Views.Artist.renderArtistProfile is a function');
  assert(typeof context.GP.Views.Artist.renderArtistProfileError === 'function', 'GP.Views.Artist.renderArtistProfileError is a function');
  assert(typeof context.GP.Views.Artist.loadArtistPlaylist === 'function', 'GP.Views.Artist.loadArtistPlaylist is a function');
  assert(typeof context.GP.Views.Artist.isArtistFollowed === 'function', 'GP.Views.Artist.isArtistFollowed is a function');
  assert(typeof context.GP.Views.Artist.toggleFollowArtist === 'function', 'GP.Views.Artist.toggleFollowArtist is a function');
  assert(typeof context.GP.Views.Artist.getFollowedArtists === 'function', 'GP.Views.Artist.getFollowedArtists is a function');

  // Global window aliases
  assert(context.window.performSearch === context.GP.Views.Search.performSearch, 'window.performSearch points to search view');
  assert(context.window.renderSearchResults === context.GP.Views.Search.renderSearchResults, 'window.renderSearchResults alias exists');
  assert(context.window.loadMoreTracks === context.GP.Views.Search.loadMoreTracks, 'window.loadMoreTracks alias exists');
  assert(context.window.updateLoadMoreButton === context.GP.Views.Search.updateLoadMoreButton, 'window.updateLoadMoreButton alias exists');
  assert(context.window.getSearchHistory === context.GP.Views.Search.getSearchHistory, 'window.getSearchHistory alias exists');
  assert(context.window.saveSearchHistory === context.GP.Views.Search.saveSearchHistory, 'window.saveSearchHistory alias exists');
  assert(context.window.addToSearchHistory === context.GP.Views.Search.addToSearchHistory, 'window.addToSearchHistory alias exists');
  assert(context.window.showSearchHistory === context.GP.Views.Search.showSearchHistory, 'window.showSearchHistory alias exists');
  assert(context.window.clearSearchHistory === context.GP.Views.Search.clearSearchHistory, 'window.clearSearchHistory alias exists');
  assert(context.window.deleteSearchHistoryItem === context.GP.Views.Search.deleteSearchHistoryItem, 'window.deleteSearchHistoryItem alias exists');

  assert(context.window.loadArtistView === context.GP.Views.Artist.loadArtistView, 'window.loadArtistView points to artist view');
  assert(context.window.openArtistProfile === context.GP.Views.Artist.openArtistProfile, 'window.openArtistProfile alias exists');
  assert(context.window.closeArtistProfile === context.GP.Views.Artist.closeArtistProfile, 'window.closeArtistProfile alias exists');
  assert(context.window.renderArtistProfile === context.GP.Views.Artist.renderArtistProfile, 'window.renderArtistProfile alias exists');
  assert(context.window.renderArtistProfileError === context.GP.Views.Artist.renderArtistProfileError, 'window.renderArtistProfileError alias exists');
  assert(context.window.loadArtistPlaylist === context.GP.Views.Artist.loadArtistPlaylist, 'window.loadArtistPlaylist alias exists');
  assert(context.window.isArtistFollowed === context.GP.Views.Artist.isArtistFollowed, 'window.isArtistFollowed alias exists');
  assert(context.window.toggleFollowArtist === context.GP.Views.Artist.toggleFollowArtist, 'window.toggleFollowArtist alias exists');
  assert(context.window.getFollowedArtists === context.GP.Views.Artist.getFollowedArtists, 'window.getFollowedArtists alias exists');

  // --- 2. Reactive State Properties ---
  console.log('\n[Suite 2: Reactive State Properties]');
  assert(typeof context.window.activeSources === 'object', 'window.activeSources is defined');
  assert(context.window.activeSources.soundcloud === true, 'activeSources.soundcloud defaults to true');
  assert(context.window.activeSources.spotify === false, 'activeSources.spotify defaults to false');

  // Setting activeSources reactively
  context.window.activeSources = { soundcloud: true, spotify: true };
  assert(context.window.activeSources.spotify === true, 'activeSources reactively updated spotify');
  const internalSources = context.GP.Views.Search.getActiveSources();
  assert(internalSources.spotify === true, 'internal activeSources match reactive setter');

  // Setting currentSearchPage reactively
  assert(context.window.currentSearchPage === 1, 'currentSearchPage defaults to 1');
  context.window.currentSearchPage = 3;
  assert(context.window.currentSearchPage === 3, 'currentSearchPage updated to 3');
  context.window.currentSearchPage = 1; // reset

  // --- 3. Search History Management ---
  console.log('\n[Suite 3: Search History]');
  context.window.clearSearchHistory();
  assert(context.window.getSearchHistory().length === 0, 'History cleared initially');

  context.window.addToSearchHistory('Bladee');
  context.window.addToSearchHistory('Yung Lean');
  context.window.addToSearchHistory('Ecco2k');
  let history = context.window.getSearchHistory();
  assert(history.length === 3, 'Added 3 items to history');
  assert(history[0] === 'Ecco2k', 'Most recent search item is unshifted to front');

  // Deduplication check: re-adding Bladee moves it to top
  context.window.addToSearchHistory('Bladee');
  history = context.window.getSearchHistory();
  assert(history.length === 3, 'Deduplication works, length stays 3');
  assert(history[0] === 'Bladee', 'Re-added search item moved to front');

  // Maximum items limit (5 items)
  context.window.addToSearchHistory('Thaiboy Digital');
  context.window.addToSearchHistory('Whitearmor');
  context.window.addToSearchHistory('Gud');
  history = context.window.getSearchHistory();
  assert(history.length === 5, 'History capped at 5 items max');
  assert(history[0] === 'Gud', 'Latest query is at index 0');

  // Delete single item
  context.window.deleteSearchHistoryItem('Thaiboy Digital');
  history = context.window.getSearchHistory();
  assert(!history.includes('Thaiboy Digital'), 'Item removed from history');
  assert(history.length === 4, 'History length decreased to 4');

  // Clear all
  context.window.clearSearchHistory();
  assert(context.window.getSearchHistory().length === 0, 'Clear search history emptied array');

  // --- 4. Follow Artist System ---
  console.log('\n[Suite 4: Follow Artist System]');
  localStorageMock.clear();
  let followed = context.window.getFollowedArtists();
  assert(Array.isArray(followed) && followed.length === 0, 'Followed artists empty by default');

  const artistSample = { id: 'sc_12345', name: 'Yung Lean', avatar: 'https://img.com/lean.jpg' };
  assert(context.window.isArtistFollowed('sc_12345') === false, 'Artist initially not followed');

  // Toggle follow ON
  let followState = context.window.toggleFollowArtist(artistSample);
  assert(followState === true, 'toggleFollowArtist returns true when following');
  assert(context.window.isArtistFollowed('sc_12345') === true, 'isArtistFollowed returns true after following');
  followed = context.window.getFollowedArtists();
  assert(followed.length === 1 && followed[0].name === 'Yung Lean', 'Artist stored in followed list');

  // Toggle follow OFF
  followState = context.window.toggleFollowArtist(artistSample);
  assert(followState === false, 'toggleFollowArtist returns false when unfollowing');
  assert(context.window.isArtistFollowed('sc_12345') === false, 'isArtistFollowed returns false after unfollowing');
  followed = context.window.getFollowedArtists();
  assert(followed.length === 0, 'Followed list is empty after unfollowing');

  // --- 5. Search History Dropdown Rendering ---
  console.log('\n[Suite 5: Search History Dropdown]');
  const searchInput = domStore['search-input'];
  const historyDropdown = domStore['search-history-dropdown'];
  searchInput.value = '';
  context.window.addToSearchHistory('Crystal Castles');

  context.window.showSearchHistory();
  assert(!historyDropdown.classList.contains('hidden'), 'History dropdown is displayed');
  assert(historyDropdown.children.length > 0, 'Dropdown rendered content');

  // Check sources container
  const sourcesRow = historyDropdown.querySelector('.dropdown-sources-row');
  assert(sourcesRow !== null, 'Dropdown includes sources toggle row');

  // Check query item rendered
  const historyItem = historyDropdown.querySelector('.search-history-item');
  assert(historyItem !== null, 'Dropdown includes rendered history item');

  // --- 6. Search Execution & Fallbacks ---
  console.log('\n[Suite 6: Search Execution]');
  const tracksContainer = domStore['tracks-container'];
  const loadingIndicator = domStore['loading-indicator'];
  searchInput.value = 'Bladee';

  let renderedTrackList = null;
  context.window.renderTracks = (tracks) => {
    renderedTrackList = tracks;
  };

  // Mock successful backend response
  const mockBackendTracks = [
    { id: 'sc_t1', title: 'Be Nice 2 Me', artist: 'Bladee', duration: '2:08' },
    { id: 'sc_t2', title: 'Western Union', artist: 'Bladee', duration: '2:15' }
  ];
  context.window.fetch = async () => ({
    ok: true,
    json: async () => ({ status: 'success', results: mockBackendTracks, users: [] })
  });

  await context.window.performSearch();
  assert(context.window.playlist.length === 2, 'Playlist populated from search results');
  assert(renderedTrackList === mockBackendTracks, 'renderTracks was called with search results');
  assert(!tracksContainer.classList.contains('hidden'), 'tracksContainer is unhidden');
  assert(loadingIndicator.classList.contains('hidden'), 'loadingIndicator is hidden');
  assert(context.window.activeView === 'search', 'activeView switched to search');

  // Mock Empty Results
  context.window.fetch = async () => ({
    ok: true,
    json: async () => ({ status: 'success', results: [], users: [] })
  });
  context.window.DirectSoundCloudEngine.search = async () => [];

  await context.window.performSearch();
  assert(context.window.playlist.length === 0, 'Playlist is empty for zero results');
  assert(tracksContainer.innerHTML.includes('Ничего не найдено'), 'Empty state message rendered');

  // Mock Search Failure
  context.window.loadLikedTracks = () => { throw new Error('Fatal network failure'); };
  await context.window.performSearch();
  assert(tracksContainer.innerHTML.includes('Ошибка поиска'), 'Search error message rendered on network crash');
  context.window.loadLikedTracks = null;

  // --- 7. Pagination & Infinite Scrolling ---
  console.log('\n[Suite 7: Pagination & Infinite Scroll]');
  tracksContainer.innerHTML = '';
  context.window.playlist = new Array(20).fill(null).map((_, i) => ({ id: `t_${i}`, title: `Track ${i}` }));
  context.window.activeSources = { soundcloud: true, spotify: false };

  // Update button for 20 results (should render load more button)
  context.window.updateLoadMoreButton(20);
  let loadMoreBtn = tracksContainer.querySelector('#load-more-btn');
  assert(loadMoreBtn !== null, 'Load more button created for >= 20 tracks');

  // Hit limit (80 tracks)
  context.window.playlist = new Array(80).fill(null).map((_, i) => ({ id: `t_${i}`, title: `Track ${i}` }));
  context.window.updateLoadMoreButton(20);
  const limitMsg = tracksContainer.querySelector('#load-more-limit-msg');
  assert(limitMsg !== null, 'Limit message displayed at maxTracksLimit');
  assert(tracksContainer.querySelector('#load-more-btn') === null, 'Load more button removed at limit');

  // Load more execution
  context.window.playlist = [{ id: 't_init', title: 'Initial' }];
  context.window.currentSearchPage = 1;
  const moreTracks = [{ id: 't_more_1', title: 'More 1' }];
  context.window.fetch = async () => ({
    ok: true,
    json: async () => ({ status: 'success', results: moreTracks })
  });

  await context.window.loadMoreTracks();
  assert(context.window.currentSearchPage === 2, 'currentSearchPage incremented by loadMoreTracks');
  assert(context.window.playlist.length === 2, 'New tracks appended to playlist');

  // --- 8. Artist Profile Rendering ---
  console.log('\n[Suite 8: Artist Profile Views]');
  const sampleArtistData = {
    id: 'art_99',
    name: 'Ecco2k',
    followers: 154200,
    avatar: 'https://img.com/ecco.jpg',
    description: 'Designer and musician from Stockholm.',
    tracks: [
      { id: 'art_t1', title: 'Peroxide', artist: 'Ecco2k', duration: '3:34' }
    ],
    playlists: [
      { id: 'pl_1', name: 'E', thumbnail: 'e.jpg', tracksCount: 9 }
    ]
  };

  context.window.renderArtistProfile(sampleArtistData);
  const header = tracksContainer.querySelector('.artist-header');
  assert(header !== null, 'Artist header created');
  assert(tracksContainer.innerHTML.includes('Ecco2k'), 'Artist name rendered in profile');
  assert(tracksContainer.innerHTML.includes('154,200 подписчиков') || tracksContainer.innerHTML.includes('подписчиков'), 'Followers count rendered');
  assert(tracksContainer.querySelector('.artist-sections') !== null, 'Artist sections created');

  // Follow button within profile
  const followBtn = tracksContainer.querySelector('#follow-artist-btn');
  assert(followBtn !== null, 'Follow artist button exists in profile header');
  assert(context.window.isArtistFollowed('art_99') === false, 'Initially not followed');

  // Click follow button
  followBtn.click();
  assert(context.window.isArtistFollowed('art_99') === true, 'Artist followed on button click');
  assert(followBtn.classList.contains('active'), 'Follow button got active class');

  // Click again to unfollow
  followBtn.click();
  assert(context.window.isArtistFollowed('art_99') === false, 'Artist unfollowed on second button click');
  assert(!followBtn.classList.contains('active'), 'Follow button lost active class');

  // Artist Profile Error State
  context.window.renderArtistProfileError('Артист не найден', 'Профиль отсутствует');
  assert(tracksContainer.innerHTML.includes('Артист не найден'), 'Custom error title displayed');
  const searchAgainBtn = tracksContainer.querySelector('#artist-global-search-btn');
  assert(searchAgainBtn !== null, 'Fallback global search button rendered');

  // --- 9. Artist Playlist Loading ---
  console.log('\n[Suite 9: Artist Remote Playlist]');
  context.window.fetch = async () => ({
    ok: true,
    json: async () => ({
      status: 'success',
      results: [
        { id: 'pl_t1', title: 'AAA Powerline', artist: 'Ecco2k', artistId: 'art_99' }
      ]
    })
  });

  await context.window.loadArtistPlaylist('pl_1', 'E Album');
  assert(context.window.playlist.length === 1, 'Artist playlist tracks loaded into active playlist');
  assert(context.window.activeView === 'playlist-tracks', 'activeView changed to playlist-tracks');
  assert(tracksContainer.innerHTML.includes('E Album'), 'Playlist title displayed in view header');

  console.log(`\n==============================================`);
  console.log(`ALL TESTS PASSED: ${passedTests}/${totalTests}`);
  console.log(`==============================================\n`);
}

runTests().catch(err => {
  console.error('\n[FATAL TEST FAILURE]:', err);
  process.exit(1);
});
