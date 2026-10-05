/**
 * Unit tests for GlassPlayer Theme Engine module
 * (js/theme/theme-engine.js)
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

// Mock CSSStyleDeclaration
class MockStyleDeclaration {
  constructor() {
    this._props = new Map();
  }
  setProperty(prop, val) {
    this._props.set(prop, String(val));
  }
  getPropertyValue(prop) {
    return this._props.get(prop) || '';
  }
  removeProperty(prop) {
    this._props.delete(prop);
  }
}

// Mock DOM
const rootStyle = new MockStyleDeclaration();
const rootClassList = new Set();
const bodyClassList = new Set();

const mockElements = {
  'bg-video-element': {
    classList: {
      contains: () => true,
      add: () => {},
      remove: () => {}
    },
    pause: () => {},
    play: () => Promise.resolve(),
    removeAttribute: () => {},
    load: () => {}
  },
  'current-cover': {
    src: 'http://localhost/cover.jpg',
    complete: true,
    addEventListener: () => {}
  }
};

const domEvents = {};
let nextRafId = 1;

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
  requestAnimationFrame: (cb) => { setTimeout(cb, 0); return nextRafId++; },
  cancelAnimationFrame: () => {},
  window: null,
  document: {
    readyState: 'complete',
    documentElement: {
      style: rootStyle,
      classList: {
        add: (c) => rootClassList.add(c),
        remove: (c) => rootClassList.delete(c),
        toggle: (c, state) => { if (state) rootClassList.add(c); else rootClassList.delete(c); },
        contains: (c) => rootClassList.has(c)
      }
    },
    body: {
      classList: {
        add: (c) => bodyClassList.add(c),
        remove: (c) => bodyClassList.delete(c),
        contains: (c) => bodyClassList.has(c)
      }
    },
    getElementById: (id) => mockElements[id] || null,
    createElement: (tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: () => {},
            getImageData: () => ({
              data: new Uint8Array([
                200, 50, 50, 255,
                200, 50, 50, 255,
                20, 20, 20, 255
              ])
            })
          })
        };
      }
      return { id: '', rel: '', href: '' };
    },
    addEventListener: (evt, fn) => {
      domEvents[evt] = domEvents[evt] || [];
      domEvents[evt].push(fn);
    },
    head: { appendChild: () => {} }
  },
  localStorage: {
    _data: {},
    getItem: function (k) { return this._data[k] || null; },
    setItem: function (k, v) { this._data[k] = String(v); },
    removeItem: function (k) { delete this._data[k]; }
  },
  addEventListener: (evt, fn) => {
    domEvents[evt] = domEvents[evt] || [];
    domEvents[evt].push(fn);
  },
  showToastNotification: () => {},
  GP: {}
};

sandbox.window = sandbox;

console.log('====================================================');
console.log('     GLASSPLAYER JS/THEME-ENGINE UNIT TESTS         ');
console.log('====================================================\n');

// 1. First run utils.js in sandbox so theme engine can resolve utility helpers
const utilsCode = fs.readFileSync(path.join(__dirname, '../js/core/utils.js'), 'utf8');
vm.runInNewContext(utilsCode, sandbox);

// 2. Run theme-engine.js in sandbox
const themeCode = fs.readFileSync(path.join(__dirname, '../js/theme/theme-engine.js'), 'utf8');
vm.runInNewContext(themeCode, sandbox);

assert(sandbox.GP && sandbox.GP.Theme, 'GP.Theme namespace exists');
assert(sandbox.DEFAULT_CUSTOM_THEME && sandbox.DEFAULT_CUSTOM_THEME.version === 2, 'DEFAULT_CUSTOM_THEME exists with version 2');
assert(typeof sandbox.normalizeCustomTheme === 'function', 'normalizeCustomTheme function exists');
assert(typeof sandbox.applyCustomTheme === 'function', 'applyCustomTheme function exists');
assert(typeof sandbox.commitCustomTheme === 'function', 'commitCustomTheme function exists');
assert(typeof sandbox.getStoredCustomTheme === 'function', 'getStoredCustomTheme function exists');
assert(typeof sandbox.applyTheme === 'function', 'applyTheme function exists');
assert(typeof sandbox.setAccentOverride === 'function', 'setAccentOverride function exists');
assert(typeof sandbox.resetAccentColor === 'function', 'resetAccentColor function exists');
assert(typeof sandbox.extractDominantColor === 'function', 'extractDominantColor function exists');

// 3. Test normalizeCustomTheme
const normalizedDefault = sandbox.normalizeCustomTheme(null);
assert(normalizedDefault.bgColor1 === '#1e1e24', 'normalizeCustomTheme handles null fallback');
assert(normalizedDefault.cardStyle === 'glass', 'normalizeCustomTheme defaults cardStyle to glass');

const customInput = {
  bgColor1: '#FF0000',
  blur: 999, // Should clamp to 60
  windowRadius: -10, // Should clamp to 0
  cardStyle: 'invalid_style' // Should fallback to glass
};
const normalizedCustom = sandbox.normalizeCustomTheme(customInput);
assert(normalizedCustom.bgColor1 === '#ff0000', 'Hex color lowercased and preserved');
assert(normalizedCustom.blur === 60, 'Blur clamped to max 60');
assert(normalizedCustom.windowRadius === 0, 'Window radius clamped to min 0');
assert(normalizedCustom.cardStyle === 'glass', 'Invalid cardStyle replaced with fallback');

// 4. Test applyCustomTheme & CSS token propagation
sandbox.applyCustomTheme(normalizedCustom);
assert(rootStyle.getPropertyValue('--bg-gradient').includes('#ff0000'), 'CSS variable --bg-gradient updated');
assert(rootStyle.getPropertyValue('--blur') === 'blur(60px)', 'CSS variable --blur calculated');
assert(rootStyle.getPropertyValue('--window-radius') === '0px', 'CSS variable --window-radius updated');
assert(rootStyle.getPropertyValue('--text-color').length > 0, 'CSS variable --text-color calculated');

// 5. Test Accent Override
sandbox.setAccentOverride('#00FF00');
assert(sandbox.activeAccentOverride === '#00ff00', 'activeAccentOverride set properly');
sandbox.resetAccentColor();
assert(sandbox.activeAccentOverride === null, 'resetAccentColor clears override');

// 6. Test Dominant Color Extraction
const mockImg = { src: 'cover.jpg' };
const extracted = sandbox.extractDominantColor(mockImg);
assert(typeof extracted === 'string' && extracted.length > 0, 'extractDominantColor returns color string');

// 7. Test Theme Storage and Commit
const committed = sandbox.commitCustomTheme({ bgColor1: '#123456' }, { persist: true });
assert(sandbox.localStorage.getItem('gp_custom_theme').includes('#123456'), 'commitCustomTheme persists to localStorage');
const stored = sandbox.getStoredCustomTheme();
assert(stored.bgColor1 === '#123456', 'getStoredCustomTheme retrieves persisted theme');

console.log('\n----------------------------------------------------');
console.log(`TEST RESULTS: ${passCount} / ${passCount + failCount} PASSED`);
if (failCount === 0) {
  console.log('[ALL TESTS PASSED SUCCESSFULLY]');
} else {
  console.error(`[SOME TESTS FAILED: ${failCount}]`);
  process.exit(1);
}
console.log('====================================================\n');
