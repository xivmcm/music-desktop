/**
 * Unit tests for GlassPlayer Changelog Component
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('     GLASSPLAYER CHANGELOG UNIT TESTS (v1.20.6)     ');
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

// Mock browser environment
const store = {};
const mockLocalStorage = {
  getItem: (k) => store[k] || null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};

const mockElements = [];
const mockDocument = {
  readyState: 'complete',
  createElement: (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      id: '',
      className: '',
      classList: {
        add: (c) => { el.className = (el.className + ' ' + c).trim(); },
        remove: (c) => { el.className = el.className.replace(c, '').trim(); },
        contains: (c) => el.className.includes(c)
      },
      innerHTML: '',
      parentNode: null,
      children: [],
      appendChild: (child) => {
        child.parentNode = el;
        el.children.push(child);
        return child;
      },
      removeChild: (child) => {
        const idx = el.children.indexOf(child);
        if (idx !== -1) el.children.splice(idx, 1);
        child.parentNode = null;
      },
      querySelector: (selector) => {
        if (selector === '#changelog-confirm-btn') {
          return {
            id: 'changelog-confirm-btn',
            addEventListener: (evt, handler) => { el._btnHandler = handler; },
            focus: () => {}
          };
        }
        return null;
      },
      querySelectorAll: () => [],
      addEventListener: (evt, handler) => { el._listeners = el._listeners || {}; el._listeners[evt] = handler; }
    };
    mockElements.push(el);
    return el;
  },
  getElementById: (id) => mockElements.find(e => e.id === id) || null,
  body: {
    appendChild: (child) => {
      mockDocument._bodyChild = child;
      return child;
    }
  },
  addEventListener: () => {}
};

const mockWindow = {
  APP_VERSION: '1.20.6',
  localStorage: mockLocalStorage,
  document: mockDocument,
  requestAnimationFrame: (cb) => cb(),
  setTimeout: (cb, ms) => { cb(); return 1; },
  addEventListener: () => {},
  removeEventListener: () => {}
};

global.window = mockWindow;
global.document = mockDocument;
global.localStorage = mockLocalStorage;
global.requestAnimationFrame = mockWindow.requestAnimationFrame;

// Load changelog module code
const changelogCode = fs.readFileSync(path.join(__dirname, '../js/components/changelog.js'), 'utf-8');
eval(changelogCode);

test('GP.Components.Changelog namespace is defined', () => {
  assert.ok(mockWindow.GP.Components.Changelog);
});

test('CHANGELOG_REGISTRY has at least 1 version entry', () => {
  const reg = mockWindow.GP.Components.Changelog.CHANGELOG_REGISTRY;
  assert.ok(Array.isArray(reg));
  assert.ok(reg.length >= 1);
});

test('First changelog entry is v1.20.6', () => {
  const latest = mockWindow.GP.Components.Changelog.CHANGELOG_REGISTRY[0];
  assert.strictEqual(latest.version, '1.20.6');
  assert.strictEqual(latest.tag, 'v1.20.6');
});

test('Changelog categories contain stats, updater, lyrics, privacy, discovery', () => {
  const latest = mockWindow.GP.Components.Changelog.CHANGELOG_REGISTRY[0];
  const ids = latest.categories.map(c => c.id);
  assert.ok(ids.includes('stats'));
  assert.ok(ids.includes('updater'));
  assert.ok(ids.includes('lyrics'));
  assert.ok(ids.includes('privacy'));
  assert.ok(ids.includes('discovery'));
});

test('Changelog content contains zero emojis', () => {
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  const latest = mockWindow.GP.Components.Changelog.CHANGELOG_REGISTRY[0];
  const textBlob = JSON.stringify(latest);
  assert.strictEqual(emojiRegex.test(textBlob), false, 'Found emoji in changelog!');
});

test('openChangelogModal creates overlay and modal element', () => {
  mockWindow.openChangelogModal('1.20.6');
  const overlay = mockDocument.getElementById('changelog-modal-overlay');
  assert.ok(overlay);
  assert.ok(overlay.classList.contains('visible'));
  assert.ok(overlay.innerHTML.includes('v1.20.6'));
  assert.ok(overlay.innerHTML.includes('Статистика прослушивания'));
});

test('Clicking confirm button closes modal and marks localStorage', () => {
  const overlay = mockDocument.getElementById('changelog-modal-overlay');
  assert.ok(overlay._btnHandler);
  overlay._btnHandler(); // Click "Понятно"
  assert.strictEqual(mockLocalStorage.getItem('gp_last_seen_changelog'), '1.20.6');
});

console.log('\n----------------------------------------------------');
console.log(`TEST RESULTS: ${passCount} / ${passCount} PASSED`);
console.log('[ALL CHANGELOG TESTS PASSED SUCCESSFULLY]');
console.log('====================================================\n');
