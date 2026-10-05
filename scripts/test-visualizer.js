/**
 * Unit tests for GlassPlayer Visualizer and Ambient modules
 * (js/visualizer/ambient.js & js/visualizer/visualizer.js)
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

// Mock DOM & Canvas environment
class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '';
    this.strokeStyle = '';
    this.lineWidth = 1;
    this.globalAlpha = 1.0;
    this.shadowBlur = 0;
    this.shadowColor = '';
    this.cleared = false;
  }
  clearRect(x, y, w, h) {
    this.cleared = true;
  }
  beginPath() {}
  closePath() {}
  moveTo(x, y) {}
  lineTo(x, y) {}
  quadraticCurveTo(cpx, cpy, x, y) {}
  arc(x, y, r, sa, ea) {}
  fill() {}
  stroke() {}
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    return { addColorStop: () => {} };
  }
  createLinearGradient(x0, y0, x1, y1) {
    return { addColorStop: () => {} };
  }
}

class MockElement {
  constructor(tagName, id = '') {
    this.tagName = tagName;
    this.id = id;
    this.className = '';
    this.classList = {
      _classes: new Set(),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c),
      toggle: (c, state) => {
        if (state !== undefined) {
          if (state) this.classList._classes.add(c);
          else this.classList._classes.delete(c);
        } else {
          if (this.classList._classes.has(c)) this.classList._classes.delete(c);
          else this.classList._classes.add(c);
        }
      },
      contains: (c) => this.classList._classes.has(c)
    };
    this.style = {
      opacity: '1',
      getPropertyValue: (prop) => (prop === '--accent-color' ? '#1db954' : '')
    };
    this.width = 800;
    this.height = 600;
  }
  getContext(type) {
    if (type === '2d') {
      if (!this._ctx) this._ctx = new MockCanvasRenderingContext2D(this);
      return this._ctx;
    }
    return null;
  }
  getBoundingClientRect() {
    return { width: 400, height: 80 };
  }
}

// Set up sandbox
const ambientCanvas = new MockElement('canvas', 'ambient-canvas');
const visualizerCanvas = new MockElement('canvas', 'player-visualizer');
const playerBar = new MockElement('div');
playerBar.className = 'player-bar';

const mockElements = {
  'ambient-canvas': ambientCanvas,
  'player-visualizer': visualizerCanvas
};

const domListeners = {};
let rafId = 0;
const activeRafs = new Set();

const sandbox = {
  console,
  Math,
  parseInt,
  parseFloat,
  Set,
  Uint8Array,
  window: null,
  document: {
    documentElement: {
      style: {
        getPropertyValue: (prop) => (prop === '--accent-color' ? '#1db954' : '#ffffff')
      }
    },
    body: {
      prepend: (el) => {}
    },
    getElementById: (id) => mockElements[id] || null,
    querySelector: (sel) => (sel === '.player-bar' ? playerBar : null),
    createElement: (tag) => new MockElement(tag)
  },
  innerWidth: 1200,
  innerHeight: 800,
  devicePixelRatio: 2,
  addEventListener: (event, handler) => {
    domListeners[event] = domListeners[event] || [];
    domListeners[event].push(handler);
  },
  removeEventListener: () => {},
  requestAnimationFrame: (cb) => {
    rafId++;
    activeRafs.add(rafId);
    return rafId;
  },
  cancelAnimationFrame: (id) => {
    activeRafs.delete(id);
  },
  localStorage: {
    _data: {},
    getItem: function (k) { return this._data[k] || null; },
    setItem: function (k, v) { this._data[k] = String(v); },
    removeItem: function (k) { delete this._data[k]; }
  },
  getComputedStyle: () => ({
    getPropertyValue: (prop) => (prop === '--accent-color' ? '#1db954' : '')
  }),
  audioPlayer: {
    paused: false
  },
  GP: {}
};

sandbox.window = sandbox;

console.log('====================================================');
console.log('   GLASSPLAYER JS/VISUALIZER MODULES UNIT TESTS     ');
console.log('====================================================\n');

// 1. Run ambient.js in sandbox
const ambientCode = fs.readFileSync(path.join(__dirname, '../js/visualizer/ambient.js'), 'utf8');
vm.runInNewContext(ambientCode, sandbox);

assert(sandbox.GP && sandbox.GP.Ambient, 'GP.Ambient namespace created');
assert(typeof sandbox.GP.Ambient.initAmbientCanvas === 'function', 'initAmbientCanvas function exists');
assert(typeof sandbox.GP.Ambient.startAmbientParticles === 'function', 'startAmbientParticles function exists');
assert(typeof sandbox.GP.Ambient.stopAmbientParticles === 'function', 'stopAmbientParticles function exists');
assert(typeof sandbox.GP.Ambient.applyBgEffect === 'function', 'applyBgEffect function exists');
assert(typeof sandbox.Particle === 'function', 'Particle class exported globally to window');
assert(typeof sandbox.startAmbientParticles === 'function', 'startAmbientParticles global alias exists');
assert(typeof sandbox.stopAmbientParticles === 'function', 'stopAmbientParticles global alias exists');

// Particle class test
const p = new sandbox.Particle(800, 600);
assert(typeof p.x === 'number' && typeof p.y === 'number', 'Particle initializes with coordinates');
p.update();
assert(typeof p.vx === 'number' && typeof p.vy === 'number', 'Particle updates velocities');
const ctx = ambientCanvas.getContext('2d');
p.draw(ctx, '#1db954');
assert(true, 'Particle draws on 2D context without error');

// Ambient particles run test
sandbox.startAmbientParticles();
assert(activeRafs.size > 0, 'Ambient animation loop requested animation frame');
sandbox.stopAmbientParticles();
assert(activeRafs.size === 0, 'stopAmbientParticles cancelled animation frame safely');

// Background effects test
sandbox.applyBgEffect('aurora');
assert(sandbox.localStorage.getItem('gp_bg_effect') === 'aurora', 'applyBgEffect saves aurora preset');
sandbox.applyBgEffect('particles');
assert(sandbox.localStorage.getItem('gp_bg_effect') === 'particles', 'applyBgEffect saves particles preset');
sandbox.stopAmbientParticles();

// 2. Run visualizer.js in sandbox
// Provide mock Audio API spectrum
sandbox.analyser = {
  frequencyBinCount: 128,
  getByteFrequencyData: (arr) => {
    for (let i = 0; i < arr.length; i++) arr[i] = 180;
  }
};
sandbox.dataArray = new Uint8Array(128);
sandbox.bufferLength = 128;
sandbox.audioCtx = { sampleRate: 48000 };

const visualizerCode = fs.readFileSync(path.join(__dirname, '../js/visualizer/visualizer.js'), 'utf8');
vm.runInNewContext(visualizerCode, sandbox);

assert(sandbox.GP && sandbox.GP.Visualizer, 'GP.Visualizer namespace created');
assert(typeof sandbox.GP.Visualizer.resizeCanvas === 'function', 'resizeCanvas function exists');
assert(typeof sandbox.GP.Visualizer.startVisualizer === 'function', 'startVisualizer function exists');
assert(typeof sandbox.GP.Visualizer.drawSingleWave === 'function', 'drawSingleWave function exists');
assert(typeof sandbox.GP.Visualizer.stopVisualizer === 'function', 'stopVisualizer function exists');
assert(typeof sandbox.startVisualizer === 'function', 'startVisualizer global alias exists');
assert(typeof sandbox.stopVisualizer === 'function', 'stopVisualizer global alias exists');
assert(typeof sandbox.resizeCanvas === 'function', 'resizeCanvas global alias exists');

// ResizeCanvas test
sandbox.resizeCanvas();
assert(visualizerCanvas.width === 400 * 2 && visualizerCanvas.height === 80 * 2, 'resizeCanvas accounts for devicePixelRatio');

// Visualizer start/stop test
sandbox.localStorage.setItem('gp_visualizer', 'true');
sandbox.audioPlayer.paused = false;
sandbox.startVisualizer();
assert(activeRafs.size > 0, 'startVisualizer started animation loop');
sandbox.stopVisualizer();
assert(activeRafs.size === 0, 'stopVisualizer cancelled animation frame safely');
assert(!playerBar.classList.contains('bass-pulse'), 'stopVisualizer cleared bass-pulse class');

console.log('\n----------------------------------------------------');
console.log(`TEST RESULTS: ${passCount} / ${passCount + failCount} PASSED`);
if (failCount === 0) {
  console.log('[ALL TESTS PASSED SUCCESSFULLY]');
} else {
  console.error(`[SOME TESTS FAILED: ${failCount}]`);
  process.exit(1);
}
console.log('====================================================\n');
