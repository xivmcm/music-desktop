/**
 * Unit Tests for GlassPlayer Home View, Recommendations & Carousel Module (js/views/home-view.js)
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
  const styleObj = {};
  let innerHTMLStr = '';
  let textContentStr = '';

  const el = {
    id,
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
    get isConnected() { return true; },
    get innerHTML() { 
      return innerHTMLStr + children.map(c => c.innerHTML).join(''); 
    },
    set innerHTML(val) {
      innerHTMLStr = String(val || '');
      children.length = 0;
      const tagRegex = /<([a-z0-9]+)([^>]*)>/gi;
      let match;
      while ((match = tagRegex.exec(innerHTMLStr)) !== null) {
        const tagName = match[1];
        if (['svg', 'path', 'polyline', 'polygon', 'rect', 'circle', 'line'].includes(tagName.toLowerCase())) continue;
        const attrs = match[2];
        const idMatch = /id=["']([^"']+)["']/i.exec(attrs);
        const classMatch = /class=["']([^"']+)["']/i.exec(attrs);
        const dataIdxMatch = /data-index=["']([^"']+)["']/i.exec(attrs);
        const dataSourceMatch = /data-source=["']([^"']+)["']/i.exec(attrs);
        const childEl = createMockElement(idMatch ? idMatch[1] : '', tagName);
        if (classMatch) childEl.className = classMatch[1];
        if (dataIdxMatch) childEl.dataset.index = dataIdxMatch[1];
        if (dataSourceMatch) childEl.dataset.source = dataSourceMatch[1];
        childEl.parentNode = el;
        children.push(childEl);
      }
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
      const evt = {
        type: evtType,
        target: el,
        currentTarget: el,
        stopPropagation: () => {},
        preventDefault: () => {},
        ...customData
      };
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
    scrollBy: () => {},
    querySelector: (sel) => {
      const match = (child) => {
        if (child.id && sel === `#${child.id}`) return true;
        if (sel.startsWith('.')) {
          const classes = sel.slice(1).split('.');
          if (classes.every(c => child.classList.contains(c))) return true;
        }
        return false;
      };
      for (const child of children) {
        if (match(child)) return child;
        const found = child.querySelector(sel);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll: (sel) => {
      let results = [];
      const match = (child) => {
        if (child.id && sel === `#${child.id}`) return true;
        if (sel.startsWith('.')) {
          const classes = sel.slice(1).split('.');
          if (classes.every(c => child.classList.contains(c))) return true;
        }
        return false;
      };
      for (const child of children) {
        if (match(child)) results.push(child);
        results = results.concat(child.querySelectorAll(sel));
      }
      return results;
    },
    closest: (sel) => {
      if (sel.startsWith('.') && el.classList.contains(sel.slice(1))) return el;
      if (el.id && sel === `#${el.id}`) return el;
      return null;
    },
    contains: (other) => {
      if (other === el) return true;
      for (const child of children) {
        if (child.contains && child.contains(other)) return true;
      }
      return false;
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
  setTimeout: (cb, ms) => { cb(); return 1; },
  clearTimeout: () => {},
  setInterval: (cb, ms) => 2,
  clearInterval: () => {},
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame: (cb) => { cb(); return 1; },
  getStorageOwnerSuffix: () => 'guest',
  getStorageKey: (type) => `gp_${type}_guest`,
  currentUser: null,
  currentProfile: 'Default',
  activeView: 'home',
  playlist: [],
  currentTrackIndex: 0,
  activePlayingTrack: null,
  likedTrackIds: new Set(['like_1', 'like_2']),
  searchInput: getOrCreateElement('search-input', 'input'),
  welcomeScreen: getOrCreateElement('welcome-screen'),
  tracksContainer: getOrCreateElement('tracks-container'),
  loadingIndicator: getOrCreateElement('loading-indicator'),
  renderTracks: (tracks, container) => {
    const target = container || getOrCreateElement('tracks-container');
    target.innerHTML = '';
    (tracks || []).forEach(t => {
      const card = createMockElement(`track-${t.id}`, 'div');
      target.appendChild(card);
    });
  },
  updateActiveTab: (tab) => {
    sandbox.activeView = tab;
  },
  hideSplashScreen: () => {},
  showToastNotification: () => {},
  getOptimalCoverUrl: (url) => url || 'cover.jpg',
  getFallbackCoverUrl: () => 'fallback.jpg',
  formatPlaybackCount: (c) => String(c || 0),
  DirectSoundCloudEngine: {
    search: async (q, limit) => [
      { id: 'sc_fallback_1', title: 'SC Track 1', artist: 'SC Artist', source: 'soundcloud' }
    ],
    getHomeSections: async () => ({
      trending: [{ id: 'sc_trend_1', title: 'Trending 1', artist: 'Artist', source: 'soundcloud' }],
      top: []
    })
  }
};

sandbox.window = sandbox;
sandbox.window.document = mockDoc;
sandbox.window.localStorage = localStorageMock;
sandbox.window.matchMedia = sandbox.matchMedia;
sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;
sandbox.window.getStorageOwnerSuffix = sandbox.getStorageOwnerSuffix;
sandbox.window.getStorageKey = sandbox.getStorageKey;
sandbox.window.renderTracks = sandbox.renderTracks;
sandbox.window.updateActiveTab = sandbox.updateActiveTab;
sandbox.window.hideSplashScreen = sandbox.hideSplashScreen;
sandbox.window.getOptimalCoverUrl = sandbox.getOptimalCoverUrl;
sandbox.window.getFallbackCoverUrl = sandbox.getFallbackCoverUrl;
sandbox.window.DirectSoundCloudEngine = sandbox.DirectSoundCloudEngine;
sandbox.window.playlist = sandbox.playlist;
sandbox.window.activePlayingTrack = sandbox.activePlayingTrack;
sandbox.window.likedTrackIds = sandbox.likedTrackIds;

// Player controller mock
let playedTrackIndex = -1;
sandbox.window.GP = {
  Utils: {
    escapeHtml: (s) => String(s || ''),
    formatPlaybackCount: (c) => String(c || 0)
  },
  Player: {
    playTrack: (idx) => { playedTrackIndex = idx; },
    togglePlay: () => { sandbox.toggledPlay = true; }
  },
  Views: {}
};

const context = vm.createContext(sandbox);

// Load js/views/home-view.js
const homeCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'home-view.js'), 'utf8');
vm.runInContext(homeCode, context);

console.log('\n--- Step 2.8.5 Home View, Recommendations & Carousel Unit Tests ---\n');

// 1. Namespace & Method Verification
assert(context.window.GP && context.window.GP.Views && context.window.GP.Views.Home, 'window.GP.Views.Home namespace exists');
assert(typeof context.window.GP.Views.Home.loadHomeView === 'function', 'GP.Views.Home.loadHomeView is a function');
assert(typeof context.window.GP.Views.Home.renderHome === 'function', 'GP.Views.Home.renderHome is a function');
assert(typeof context.window.GP.Views.Home.renderHomeView === 'function', 'GP.Views.Home.renderHomeView is a function');
assert(typeof context.window.GP.Views.Home.refreshHomeRecommendations === 'function', 'GP.Views.Home.refreshHomeRecommendations is a function');
assert(typeof context.window.GP.Views.Home.invalidateHomeRecommendations === 'function', 'GP.Views.Home.invalidateHomeRecommendations is a function');
assert(typeof context.window.GP.Views.Home.renderCarousel === 'function', 'GP.Views.Home.renderCarousel is a function');
assert(typeof context.window.GP.Views.Home.buildRecommendationSeeds === 'function', 'GP.Views.Home.buildRecommendationSeeds is a function');
assert(typeof context.window.GP.Views.Home.loadForYouTracks === 'function', 'GP.Views.Home.loadForYouTracks is a function');
assert(typeof context.window.GP.Views.Home.getGreeting === 'function', 'GP.Views.Home.getGreeting is a function');
assert(typeof context.window.GP.Views.Home.renderSpotifyHome === 'function', 'GP.Views.Home.renderSpotifyHome is a function');
assert(typeof context.window.GP.Views.Home.loadSpotifyMoodTracks === 'function', 'GP.Views.Home.loadSpotifyMoodTracks is a function');
assert(typeof context.window.GP.Views.Home.loadSoundCloudDynamicRecommendations === 'function', 'GP.Views.Home.loadSoundCloudDynamicRecommendations is a function');
assert(typeof context.window.GP.Views.Home.renderSoundCloudDynamicSection === 'function', 'GP.Views.Home.renderSoundCloudDynamicSection is a function');
assert(typeof context.window.GP.Views.Home.renderTrackCardHorizontal === 'function', 'GP.Views.Home.renderTrackCardHorizontal is a function');
assert(Array.isArray(context.window.GP.Views.Home.MOOD_CARDS), 'GP.Views.Home.MOOD_CARDS is an array');

// Compatibility aliases on window
assert(typeof context.window.loadHomeView === 'function', 'window.loadHomeView is exported');
assert(typeof context.window.renderHome === 'function', 'window.renderHome is exported');
assert(typeof context.window.renderHomeView === 'function', 'window.renderHomeView is exported');
assert(typeof context.window.refreshHomeRecommendations === 'function', 'window.refreshHomeRecommendations is exported');
assert(typeof context.window.invalidateHomeRecommendations === 'function', 'window.invalidateHomeRecommendations is exported');
assert(typeof context.window.renderCarousel === 'function', 'window.renderCarousel is exported');
assert(typeof context.window.getGreeting === 'function', 'window.getGreeting is exported');
assert(typeof context.window.renderTrackCardHorizontal === 'function', 'window.renderTrackCardHorizontal is exported');
assert(typeof context.window.renderSpotifyHome === 'function', 'window.renderSpotifyHome is exported');

// 2. Reactive State Properties
assert(context.window.activeHomeSource === 'soundcloud', 'Default activeHomeSource is soundcloud');
context.window.activeHomeSource = 'spotify';
assert(context.window.activeHomeSource === 'spotify', 'activeHomeSource setter updates value');
assert(context.window.GP.Views.Home.getActiveHomeSource() === 'spotify', 'getActiveHomeSource reflects updated value');
context.window.activeHomeSource = 'soundcloud';

assert(context.window.activeGenreChip === null, 'Default activeGenreChip is null');
context.window.activeGenreChip = 'Plugg';
assert(context.window.activeGenreChip === 'Plugg', 'activeGenreChip setter updates value');
assert(context.window.GP.Views.Home.getActiveGenreChip() === 'Plugg', 'getActiveGenreChip reflects updated value');
context.window.activeGenreChip = null;

assert(context.window.homeCarouselIndex === 0, 'Default homeCarouselIndex is 0');
context.window.homeCarouselIndex = 2;
assert(context.window.homeCarouselIndex === 2, 'homeCarouselIndex setter updates index');
context.window.homeCarouselIndex = 0;

// 3. Greeting Function
const greeting = context.window.getGreeting();
const validGreetings = ['Доброе утро', 'Добрый день', 'Добрый вечер', 'Доброй ночи'];
assert(validGreetings.includes(greeting), `getGreeting returns valid Russian greeting: "${greeting}"`);

// 4. Recommendation Seeds Generation
context.window.getLikedTracks = () => [
  { id: 'track_like_1', title: 'Summer Hit', artist: 'Top Artist', source: 'soundcloud' }
];
context.window.getPlayHistory = () => [
  { id: 'track_hist_1', title: 'Night Ride', artist: 'Synth Band', source: 'soundcloud' }
];
context.window.getProfilePlayStats = () => ({
  track_stat_1: { id: 'track_stat_1', title: 'Heavy Bass', artist: 'Bass Producer', count: 15, lastPlayedAt: Date.now() }
});

const seeds = context.window.GP.Views.Home.buildRecommendationSeeds();
assert(Array.isArray(seeds) && seeds.length > 0, 'buildRecommendationSeeds returns non-empty seed array');
assert(seeds.some(s => s.label.includes('Bass Producer') || s.label.includes('Heavy Bass')), 'Seeds include frequent play track');
assert(seeds.some(s => s.label.includes('Top Artist') || s.label.includes('Summer Hit')), 'Seeds include liked track');
assert(seeds.some(s => s.label.includes('Synth Band') || s.label.includes('Night Ride')), 'Seeds include history track');

// 5. Cache Invalidation
localStorageMock.setItem('gp_home_feed_v2_guest_soundcloud', JSON.stringify({ createdAt: Date.now(), data: { tracks: [] } }));
context.window.cachedForYouData = { tracks: [{ id: '1' }] };
assert(context.window.cachedForYouData !== null, 'cachedForYouData set before invalidation');

context.window.invalidateHomeRecommendations();
assert(context.window.cachedForYouData === null, 'invalidateHomeRecommendations clears cachedForYouData');
assert(localStorageMock.getItem('gp_home_feed_v2_guest_soundcloud') === null, 'invalidateHomeRecommendations removes cached storage feed');

// 6. Carousel Component
const carouselTracks = [
  { id: 'c_track_1', title: 'Carousel Song 1', artist: 'Artist One', source: 'soundcloud', duration: '3:20', thumbnail: 'thumb1.jpg' },
  { id: 'c_track_2', title: 'Carousel Song 2', artist: 'Artist Two', source: 'soundcloud', duration: '4:10', thumbnail: 'thumb2.jpg' },
  { id: 'c_track_3', title: 'Carousel Song 3', artist: 'Artist Three', source: 'soundcloud', duration: '2:50', thumbnail: 'thumb3.jpg' }
];

const carouselEl = context.window.renderCarousel(carouselTracks, null, 'Рекомендовано вам');
assert(carouselEl !== null, 'renderCarousel returns an element');
assert(carouselEl.classList.contains('carousel-banner-section'), 'Carousel has carousel-banner-section class');

// Check play button in carousel
const playNowBtn = carouselEl.querySelector('.carousel-play-now-btn');
assert(playNowBtn !== null, 'Carousel contains carousel-play-now-btn');
playedTrackIndex = -1;
playNowBtn.click();
assert(playedTrackIndex === 0, 'Clicking carousel-play-now-btn invokes GP.Player.playTrack with index 0');
assert(Array.isArray(context.window.playlist) && context.window.playlist.length === 3, 'Clicking carousel sets playlist');

// Check prev/next navigation
const nextBtn = carouselEl.querySelector('#carousel-next');
assert(nextBtn !== null, 'Carousel contains next button');
nextBtn.click();
assert(context.window.homeCarouselIndex === 1, 'Clicking next button advances homeCarouselIndex to 1');

const prevBtn = carouselEl.querySelector('#carousel-prev');
assert(prevBtn !== null, 'Carousel contains prev button');
prevBtn.click();
assert(context.window.homeCarouselIndex === 0, 'Clicking prev button steps back homeCarouselIndex to 0');

// 7. Horizontal Track Card
const sampleTrack = {
  id: 'h_track_1',
  title: 'Horizontal Vibe',
  artist: 'Cool Musician',
  source: 'soundcloud',
  duration: '3:45',
  thumbnail: 'cool.png'
};

const card = context.window.renderTrackCardHorizontal(sampleTrack, 0, [sampleTrack]);
assert(card !== null, 'renderTrackCardHorizontal returns an element');
assert(card.classList.contains('track-card-horizontal'), 'Card has track-card-horizontal class');
assert(card.dataset.trackId === 'h_track_1', 'Card dataset has trackId');

// Test card play button
const cardPlayBtn = card.querySelector('.card-play-btn-horizontal');
assert(cardPlayBtn !== null, 'Card has play button');
playedTrackIndex = -1;
cardPlayBtn.click();
assert(playedTrackIndex === 0, 'Card play button plays track via player controller');

// 8. Mood Cards Definitions
assert(context.window.GP.Views.Home.MOOD_CARDS.length === 13, 'MOOD_CARDS contains 13 mood categories');
const pluggMood = context.window.GP.Views.Home.MOOD_CARDS.find(m => m.key === 'plugg');
assert(pluggMood && pluggMood.title === 'Plugg Vibe', 'Plugg mood card is present');
const jerkMood = context.window.GP.Views.Home.MOOD_CARDS.find(m => m.key === 'jerk');
assert(jerkMood && jerkMood.title.includes('Jerk'), 'Jerk mood card is present');

// 9. Full Home View Rendering
const mockSections = {
  trending: [sampleTrack],
  top: [sampleTrack]
};
const mockForYou = {
  source: '🔥 Популярное прямо сейчас',
  tracks: [sampleTrack],
  personalized: true
};

context.window.renderHome(mockSections, mockForYou);
const renderedHeader = sandbox.tracksContainer.querySelector('.home-welcome-header');
assert(renderedHeader !== null, 'renderHome creates home-welcome-header');
const refreshBtn = renderedHeader.querySelector('.home-refresh-btn');
assert(refreshBtn !== null, 'Home header contains refresh button');
const capsuleBtns = renderedHeader.querySelectorAll('.source-capsule-btn');
assert(capsuleBtns.length === 2, 'Home header contains 2 source capsule buttons (SC & Spotify)');

console.log(`\n========================================`);
console.log(`ALL HOME VIEW TESTS PASSED: ${passedTests} / ${totalTests}`);
console.log(`========================================\n`);
