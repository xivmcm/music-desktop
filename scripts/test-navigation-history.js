/**
 * Unit Test Suite for GlassPlayer Navigation History Module (v1.19.2)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`[PASS] ${message}`);
}

async function runTests() {
  console.log('\n=== Starting Navigation History Unit Tests (v1.19.2) ===\n');

  // Create lightweight DOM mock
  const backBtn = {
    id: 'nav-back-btn',
    disabled: true,
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    listeners: {},
    addEventListener(ev, fn) { this.listeners[ev] = fn; },
    click() { if (this.listeners['click']) this.listeners['click'](); }
  };

  const fwdBtn = {
    id: 'nav-forward-btn',
    disabled: true,
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    listeners: {},
    addEventListener(ev, fn) { this.listeners[ev] = fn; },
    click() { if (this.listeners['click']) this.listeners['click'](); }
  };

  const searchInput = {
    id: 'search-input',
    value: ''
  };

  const elements = {
    'nav-back-btn': backBtn,
    'nav-forward-btn': fwdBtn,
    'search-input': searchInput
  };

  const windowListeners = {};

  const sandbox = {
    console,
    document: {
      readyState: 'complete',
      getElementById: (id) => elements[id] || null,
      addEventListener: () => {}
    },
    addEventListener: (ev, fn) => {
      windowListeners[ev] = windowListeners[ev] || [];
      windowListeners[ev].push(fn);
    },
    activeView: 'home',
    updateActiveTab: (v) => { sandbox.activeView = v; },
    loadHomeView: () => { sandbox.activeView = 'home'; },
    loadFavorites: (sub) => { sandbox.activeView = 'library'; sandbox.subTab = sub; },
    loadHistoryView: () => { sandbox.activeView = 'history'; },
    loadPlaylistsView: () => { sandbox.activeView = 'playlists'; },
    loadSettingsView: () => { sandbox.activeView = 'settings'; },
    loadStudioView: (tab) => { sandbox.activeView = 'studio'; sandbox.studioTab = tab; },
    loadStatsView: () => { sandbox.activeView = 'stats'; },
    performSearch: (q) => { sandbox.activeView = 'search'; sandbox.searchQuery = q; },
    openArtistProfile: (id) => { sandbox.activeView = 'artist'; sandbox.artistId = id; }
  };
  sandbox.window = sandbox;

  vm.createContext(sandbox);

  // Load navigation-history.js into sandbox
  const navCode = fs.readFileSync(path.join(__dirname, '../js/core/navigation-history.js'), 'utf8');
  vm.runInContext(navCode, sandbox);

  const Nav = sandbox.GP.NavigationHistory;

  console.log('[Suite 1: Namespace & Public API]');
  assert(typeof Nav === 'object', 'GP.NavigationHistory namespace exists');
  assert(typeof Nav.push === 'function', 'push is a function');
  assert(typeof Nav.back === 'function', 'back is a function');
  assert(typeof Nav.forward === 'function', 'forward is a function');
  assert(typeof Nav.canGoBack === 'function', 'canGoBack is a function');
  assert(typeof Nav.canGoForward === 'function', 'canGoForward is a function');
  assert(typeof Nav.getStack === 'function', 'getStack is a function');
  assert(typeof Nav.getCurrentIndex === 'function', 'getCurrentIndex is a function');

  console.log('\n[Suite 2: Initial State & Button Binding]');
  Nav.init();
  assert(Nav.getStack().length === 1, 'Initial stack has 1 entry (home)');
  assert(Nav.getCurrentIndex() === 0, 'Current index is 0');
  assert(Nav.canGoBack() === false, 'Cannot go back at root');
  assert(Nav.canGoForward() === false, 'Cannot go forward at head');
  assert(backBtn.disabled === true, 'Back button is disabled');
  assert(fwdBtn.disabled === true, 'Forward button is disabled');

  console.log('\n[Suite 3: Deduplication & Navigation]');
  // Push duplicate home -> should be ignored
  Nav.push({ view: 'home' });
  assert(Nav.getStack().length === 1, 'Consecutive identical view is deduplicated');

  // Push search view
  Nav.push({ view: 'search', query: 'Deftones' });
  assert(Nav.getStack().length === 2, 'Stack grew to 2 entries');
  assert(Nav.getCurrentIndex() === 1, 'Current index moved to 1');
  assert(Nav.canGoBack() === true, 'canGoBack is true');
  assert(Nav.canGoForward() === false, 'canGoForward is false');
  assert(backBtn.disabled === false, 'Back button is enabled');
  assert(fwdBtn.disabled === true, 'Forward button is disabled');

  // Push duplicate search with same query
  Nav.push({ view: 'search', query: '  Deftones  ' });
  assert(Nav.getStack().length === 2, 'Duplicate trimmed search query is deduplicated');

  // Push artist view
  Nav.push({ view: 'artist', artistId: '456', artistName: 'Deftones' });
  assert(Nav.getStack().length === 3, 'Stack grew to 3 entries');
  assert(Nav.getCurrentIndex() === 2, 'Current index is 2');

  console.log('\n[Suite 4: History Back Navigation]');
  // Navigate back -> should return to Search
  Nav.back();
  assert(Nav.getCurrentIndex() === 1, 'Current index decreased to 1');
  assert(sandbox.activeView === 'search', 'activeView restored to search');
  assert(sandbox.searchQuery === 'Deftones', 'Search query restored in performSearch');
  assert(searchInput.value === 'Deftones', 'Search input value set');
  assert(Nav.canGoBack() === true, 'canGoBack is true');
  assert(Nav.canGoForward() === true, 'canGoForward is true');
  assert(backBtn.disabled === false, 'Back button enabled');
  assert(fwdBtn.disabled === false, 'Forward button enabled');

  // Navigate back again -> should return to Home
  Nav.back();
  assert(Nav.getCurrentIndex() === 0, 'Current index is 0');
  assert(sandbox.activeView === 'home', 'activeView restored to home');
  assert(Nav.canGoBack() === false, 'canGoBack is false at root');
  assert(Nav.canGoForward() === true, 'canGoForward is true');
  assert(backBtn.disabled === true, 'Back button disabled');
  assert(fwdBtn.disabled === false, 'Forward button enabled');

  console.log('\n[Suite 5: History Forward Navigation]');
  // Navigate forward -> back to Search
  Nav.forward();
  assert(Nav.getCurrentIndex() === 1, 'Current index is 1');
  assert(sandbox.activeView === 'search', 'activeView is search');

  // Navigate forward -> back to Artist
  Nav.forward();
  assert(Nav.getCurrentIndex() === 2, 'Current index is 2');
  assert(sandbox.activeView === 'artist', 'activeView is artist');
  assert(sandbox.artistId === '456', 'Artist ID restored');
  assert(Nav.canGoForward() === false, 'canGoForward is false at end of stack');

  console.log('\n[Suite 6: History Branching / Truncation]');
  // Go back to Search, then push a new view (Library)
  Nav.back();
  assert(Nav.getCurrentIndex() === 1, 'Back to Search at index 1');
  Nav.push({ view: 'library', subTab: 'favorites' });
  assert(Nav.getCurrentIndex() === 2, 'New view is index 2');
  assert(Nav.getStack().length === 3, 'Stack length is 3 (old artist state was truncated)');
  assert(Nav.getStack()[2].view === 'library', 'Latest state is library');
  assert(Nav.canGoForward() === false, 'Forward history is cleared after new push');

  console.log('\n[Suite 7: Button Clicks & DOM Integration]');
  // Click back button mock
  backBtn.click();
  assert(Nav.getCurrentIndex() === 1, 'Back button click triggered back navigation');
  // Click forward button mock
  fwdBtn.click();
  assert(Nav.getCurrentIndex() === 2, 'Forward button click triggered forward navigation');

  console.log('\n[Suite 8: Keyboard & Mouse Shortcuts]');
  assert(Array.isArray(windowListeners['keydown']), 'Keydown listener registered');
  assert(Array.isArray(windowListeners['mouseup']), 'Mouseup listener registered');

  // Test Alt+ArrowLeft
  let preventDefaultCalled = false;
  const altLeftEvent = {
    altKey: true,
    key: 'ArrowLeft',
    preventDefault: () => { preventDefaultCalled = true; }
  };
  windowListeners['keydown'].forEach(fn => fn(altLeftEvent));
  assert(preventDefaultCalled === true, 'Alt+ArrowLeft prevented default');
  assert(Nav.getCurrentIndex() === 1, 'Alt+ArrowLeft navigated back');

  // Test Alt+ArrowRight
  preventDefaultCalled = false;
  const altRightEvent = {
    altKey: true,
    key: 'ArrowRight',
    preventDefault: () => { preventDefaultCalled = true; }
  };
  windowListeners['keydown'].forEach(fn => fn(altRightEvent));
  assert(preventDefaultCalled === true, 'Alt+ArrowRight prevented default');
  assert(Nav.getCurrentIndex() === 2, 'Alt+ArrowRight navigated forward');

  // Test Mouse Button 3 (Back)
  preventDefaultCalled = false;
  const mouseBtn3Event = {
    button: 3,
    preventDefault: () => { preventDefaultCalled = true; }
  };
  windowListeners['mouseup'].forEach(fn => fn(mouseBtn3Event));
  assert(preventDefaultCalled === true, 'Mouse button 3 prevented default');
  assert(Nav.getCurrentIndex() === 1, 'Mouse button 3 navigated back');

  // Test Mouse Button 4 (Forward)
  preventDefaultCalled = false;
  const mouseBtn4Event = {
    button: 4,
    preventDefault: () => { preventDefaultCalled = true; }
  };
  windowListeners['mouseup'].forEach(fn => fn(mouseBtn4Event));
  assert(preventDefaultCalled === true, 'Mouse button 4 prevented default');
  assert(Nav.getCurrentIndex() === 2, 'Mouse button 4 navigated forward');

  console.log('\n==============================================');
  console.log('ALL NAVIGATION HISTORY TESTS PASSED: 38/38');
  console.log('==============================================\n');
}

runTests().catch(err => {
  console.error('\n[FATAL TEST FAILURE]:', err);
  process.exit(1);
});
