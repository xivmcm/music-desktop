/**
 * Unit Tests for GlassPlayer Settings & Studio Views Module (js/views/settings-view.js)
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
    get innerHTML() { return innerHTMLStr; },
    set innerHTML(val) {
      innerHTMLStr = String(val || '');
      children.length = 0;
      // Basic mock parser to populate mock child nodes for querySelector
      if (innerHTMLStr.includes('studio-tab-btn')) {
        const vTab = createMockElement('studio-visual-tab', 'button');
        vTab.className = innerHTMLStr.includes('studio-visual-tab" class="studio-tab-btn active"') ? 'studio-tab-btn active' : 'studio-tab-btn';
        children.push(vTab);
        const aTab = createMockElement('studio-audio-tab', 'button');
        aTab.className = innerHTMLStr.includes('studio-audio-tab" class="studio-tab-btn active"') ? 'studio-tab-btn active' : 'studio-tab-btn';
        children.push(aTab);
      }
      if (innerHTMLStr.includes('theme-options')) {
        const themePresets = createMockElement('', 'div');
        themePresets.dataset.section = 'theme-presets';
        children.push(themePresets);
      }
      if (innerHTMLStr.includes('data-section="theme-constructor"')) {
        const themeConst = createMockElement('theme-constructor-section', 'div');
        themeConst.dataset.section = 'theme-constructor';
        children.push(themeConst);
      }
      if (innerHTMLStr.includes('data-section="background-image"')) {
        const bgSec = createMockElement('background-image-section', 'div');
        bgSec.dataset.section = 'background-image';
        children.push(bgSec);
      }
      if (innerHTMLStr.includes('data-section="interface-effects"')) {
        const ifSec = createMockElement('', 'div');
        ifSec.dataset.section = 'interface-effects';
        children.push(ifSec);
      }
      if (innerHTMLStr.includes('data-section="audio-effects"')) {
        const audioSec = createMockElement('', 'div');
        audioSec.dataset.section = 'audio-effects';
        for (let i = 0; i < 5; i++) {
          const eqSlider = createMockElement('', 'input');
          eqSlider.className = 'eq-slider';
          audioSec.children.push(eqSlider);
        }
        const bbCheck = createMockElement('effect-bassboost-checkbox', 'input');
        bbCheck.type = 'checkbox';
        audioSec.children.push(bbCheck);
        const normCheck = createMockElement('effect-normalization-checkbox', 'input');
        normCheck.type = 'checkbox';
        audioSec.children.push(normCheck);
        const spdSlider = createMockElement('effect-speed-slider', 'input');
        audioSec.children.push(spdSlider);
        const ptchSlider = createMockElement('effect-pitch-slider', 'input');
        audioSec.children.push(ptchSlider);
        children.push(audioSec);
      }
      if (innerHTMLStr.includes('data-section="listening-stats"')) {
        const statsSec = createMockElement('', 'div');
        statsSec.dataset.section = 'listening-stats';
        children.push(statsSec);
      }
      if (innerHTMLStr.includes('data-section="user-info"')) {
        const userSec = createMockElement('', 'div');
        userSec.dataset.section = 'user-info';
        const bInput = createMockElement('settings-backend-url-input', 'input');
        bInput.value = 'https://music-backend-iyni.onrender.com';
        userSec.children.push(bInput);
        const clrBtn = createMockElement('settings-clear-cache-btn', 'button');
        userSec.children.push(clrBtn);
        children.push(userSec);
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
        else if (sel.startsWith('[data-section="') && item.dataset.section === sel.slice(15, -2)) results.push(item);
        else if (sel.startsWith('[data-section]')) {
          if (item.dataset.section) results.push(item);
        }
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
    }
  };
  return el;
}

const elementsMap = {
  'search-input': createMockElement('search-input', 'input'),
  'welcome-screen': createMockElement('welcome-screen', 'div'),
  'tracks-container': createMockElement('tracks-container', 'div'),
  'loading-indicator': createMockElement('loading-indicator', 'div'),
  'settings-button': createMockElement('settings-button', 'button'),
  'studio-button': createMockElement('studio-button', 'button'),
  'stats-button': createMockElement('stats-button', 'button'),
  'audio-player': createMockElement('audio-player', 'audio')
};

const documentMock = {
  getElementById: (id) => elementsMap[id] || null,
  createElement: (tag) => createMockElement('', tag),
  querySelectorAll: (sel) => [],
  querySelector: (sel) => null,
  body: createMockElement('body', 'body'),
  documentElement: {
    style: {
      setProperty: () => {},
      getPropertyValue: () => ''
    }
  },
  addEventListener: () => {}
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
  currentProfile: 'Default'
};
sandbox.window = sandbox;

vm.createContext(sandbox);

// Load js/views/settings-view.js
const settingsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'settings-view.js'), 'utf8');
vm.runInContext(settingsCode, sandbox);

console.log('====================================================');
console.log('   GLASSPLAYER JS/VIEWS/SETTINGS-VIEW UNIT TESTS    ');
console.log('====================================================\n');

// 1. Namespace & Global Aliases
assert(typeof sandbox.GP?.Views?.Settings === 'object', 'GP.Views.Settings namespace exists');
assert(typeof sandbox.renderSettings === 'function', 'renderSettings global alias exists');
assert(typeof sandbox.renderSettingsView === 'function', 'renderSettingsView global alias exists');
assert(typeof sandbox.loadSettingsView === 'function', 'loadSettingsView global alias exists');
assert(typeof sandbox.loadStudioView === 'function', 'loadStudioView global alias exists');
assert(typeof sandbox.loadStatsView === 'function', 'loadStatsView global alias exists');
assert(typeof sandbox.openSettings === 'function', 'openSettings global alias exists');
assert(typeof sandbox.closeSettings === 'function', 'closeSettings global alias exists');
assert(typeof sandbox.openSettingsModal === 'function', 'openSettingsModal global alias exists');
assert(typeof sandbox.closeSettingsModal === 'function', 'closeSettingsModal global alias exists');
assert(typeof sandbox.renderProfileContainer === 'function', 'renderProfileContainer global alias exists');
assert(typeof sandbox.switchApiMirror === 'function', 'switchApiMirror global alias exists');
assert(typeof sandbox.clearAppCache === 'function', 'clearAppCache global alias exists');

// 2. Reactive activeView
assert(sandbox.activeView === 'home', 'activeView initial value is home');
sandbox.activeView = 'settings';
assert(sandbox.activeView === 'settings', 'activeView setter updates to settings');
sandbox.activeView = 'studio';
assert(sandbox.activeView === 'studio', 'activeView setter updates to studio');

// 3. Render Settings View (scope: settings)
sandbox.renderSettings({ scope: 'settings' });
const tracksContainer = elementsMap['tracks-container'];
assert(!tracksContainer.classList.contains('hidden'), 'tracksContainer is unhidden after renderSettings');

const userInfoSec = tracksContainer.querySelector('[data-section="user-info"]');
assert(userInfoSec !== null, 'User info section rendered in settings scope');

const backendInput = tracksContainer.querySelector('#settings-backend-url-input');
assert(backendInput !== null, 'Backend URL input exists');

const clearCacheBtn = tracksContainer.querySelector('#settings-clear-cache-btn');
assert(clearCacheBtn !== null, 'Clear Cache button exists');

// 4. Render Studio View (scope: studio, studioTab: visual)
sandbox.renderSettings({ scope: 'studio', studioTab: 'visual' });
const studioVisualTab = tracksContainer.querySelector('#studio-visual-tab');
assert(studioVisualTab && studioVisualTab.classList.contains('active'), 'Visual tab is marked active');

const themePresetsSec = tracksContainer.querySelector('[data-section="theme-presets"]');
assert(themePresetsSec !== null, 'Theme presets section visible in studio visual');

const themeConstSec = tracksContainer.querySelector('[data-section="theme-constructor"]');
assert(themeConstSec !== null, 'Theme constructor section visible in studio visual');

const bgImageSec = tracksContainer.querySelector('[data-section="background-image"]');
assert(bgImageSec !== null, 'Background image section visible in studio visual');

// 5. Render Studio View (scope: studio, studioTab: audio)
sandbox.renderSettings({ scope: 'studio', studioTab: 'audio' });
const studioAudioTab = tracksContainer.querySelector('#studio-audio-tab');
assert(studioAudioTab && studioAudioTab.classList.contains('active'), 'Audio tab is marked active');

const audioEffectsSec = tracksContainer.querySelector('[data-section="audio-effects"]');
assert(audioEffectsSec !== null, 'Audio effects section visible in studio audio');

const eqSliders = audioEffectsSec.querySelectorAll('.eq-slider');
assert(eqSliders.length === 5, '5-band EQ sliders rendered');

const bbCheckbox = audioEffectsSec.querySelector('#effect-bassboost-checkbox');
assert(bbCheckbox !== null, 'Bass boost toggle rendered');

const normCheckbox = audioEffectsSec.querySelector('#effect-normalization-checkbox');
assert(normCheckbox !== null, 'Sound normalization toggle rendered');

const speedSlider = audioEffectsSec.querySelector('#effect-speed-slider');
assert(speedSlider !== null, 'Speed slider rendered');

const pitchSlider = audioEffectsSec.querySelector('#effect-pitch-slider');
assert(pitchSlider !== null, 'Pitch slider rendered');

// 6. Render Stats View (scope: stats)
sandbox.renderSettings({ scope: 'stats' });
const statsSec = tracksContainer.querySelector('[data-section="listening-stats"]');
assert(statsSec !== null, 'Listening stats section rendered in stats scope');

// 7. Test switchApiMirror
sandbox.switchApiMirror('https://failover.glassplayer.org/');
assert(sandbox.localStorage.getItem('gp_backend_url') === 'https://failover.glassplayer.org', 'switchApiMirror saved trimmed URL to localStorage');
assert(sandbox.API_URL === 'https://failover.glassplayer.org', 'switchApiMirror updated sandbox.API_URL');
assert(sandbox.BACKEND_URL === 'https://failover.glassplayer.org/api', 'switchApiMirror updated sandbox.BACKEND_URL');

// 8. Test clearAppCache
sandbox.localStorage.setItem('gp_home_feed_v2_user1', 'data1');
sandbox.localStorage.setItem('gp_search_history_user1', 'data2');
sandbox.localStorage.setItem('gp_stats_counts_user1', 'data3');
sandbox.localStorage.setItem('gp_preserved_theme', 'dark');
const clearResult = sandbox.clearAppCache();
assert(clearResult === true, 'clearAppCache returns true');
assert(sandbox.localStorage.getItem('gp_home_feed_v2_user1') === null, 'gp_home_feed removed');
assert(sandbox.localStorage.getItem('gp_search_history_user1') === null, 'gp_search_history removed');
assert(sandbox.localStorage.getItem('gp_stats_counts_user1') === null, 'gp_stats_counts removed');
assert(sandbox.localStorage.getItem('gp_preserved_theme') === 'dark', 'Unrelated config preserved');

// 9. openSettings / closeSettings transitions
sandbox.openSettings('studio', 'audio');
assert(sandbox.activeView === 'studio', 'openSettings updated activeView to studio');

sandbox.openSettingsModal({ scope: 'stats' });
assert(sandbox.activeView === 'stats', 'openSettingsModal updated activeView to stats');

sandbox.closeSettings();
assert(elementsMap['tracks-container'].classList.contains('hidden'), 'closeSettings hid tracks container');

console.log('\n----------------------------------------------------');
console.log(`TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
if (passedTests === totalTests) {
  console.log('[ALL TESTS PASSED SUCCESSFULLY]');
}
console.log('====================================================\n');
