const assert = require('assert');

console.log('====================================================');
console.log('  GLASSPLAYER JS/AUDIO/AUDIO-ENGINE.JS UNIT TESTS   ');
console.log('====================================================\n');

// Mock browser globals for Node.js unit testing
class MockAudioNode {
  constructor() {
    this.gain = { value: 0 };
    this.frequency = { value: 0 };
    this.Q = { value: 0 };
    this.type = '';
    this.fftSize = 0;
    this.frequencyBinCount = 128;
  }
  connect(dest) { return dest; }
  getByteFrequencyData(arr) {
    for (let i = 0; i < arr.length; i++) arr[i] = i * 2;
  }
}

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.destination = new MockAudioNode();
  }
  createMediaElementSource(element) {
    if (element._connected) {
      throw new Error('InvalidStateError: HTMLMediaElement already connected');
    }
    element._connected = true;
    return new MockAudioNode();
  }
  createBiquadFilter() { return new MockAudioNode(); }
  createAnalyser() { return new MockAudioNode(); }
  resume() { return Promise.resolve(); }
}

global.AudioContext = MockAudioContext;
global.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); }
};

const mockAudioPlayer = {
  playbackRate: 1.0,
  defaultPlaybackRate: 1.0,
  preservesPitch: true,
  _connected: false
};
global.audioPlayer = mockAudioPlayer;

// Require the Audio module
const Audio = require('../js/audio/audio-engine');

let passed = 0;
let total = 0;
function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error('       Error:', err.message);
  }
}

test('Module structure & exports', () => {
  assert.ok(Audio);
  assert.ok(global.GP?.Audio);
  assert.strictEqual(typeof Audio.initAudioContext, 'function');
  assert.strictEqual(typeof Audio.setEqBand, 'function');
  assert.strictEqual(typeof Audio.setBassBoost, 'function');
  assert.strictEqual(typeof Audio.setPlaybackRate, 'function');
  assert.deepStrictEqual(Audio.EQ_BANDS, [60, 230, 910, 4000, 14000]);
});

test('initAudioContext: initializes graph properly', () => {
  const ctx = Audio.initAudioContext(mockAudioPlayer);
  assert.ok(ctx);
  assert.ok(Audio.getAnalyser());
  assert.ok(Audio.getBassFilter());
  assert.strictEqual(Audio.getEqFilters().length, 5);
  assert.strictEqual(Audio.getBufferLength(), 128);
  assert.strictEqual(Audio.getDataArray()?.length, 128);
});

test('Single-binding guard: duplicate call does not throw InvalidStateError', () => {
  assert.strictEqual(Audio.isSourceConnected(), true);
  // Calling again must succeed without attempting to reconnect source
  const ctx2 = Audio.initAudioContext(mockAudioPlayer);
  assert.strictEqual(ctx2, Audio.getAudioContext());
});

test('setEqBand: updates filter and localStorage', () => {
  Audio.setEqBand(60, 4.5);
  assert.strictEqual(global.localStorage.getItem('gp_eq_60'), '4.5');
  assert.strictEqual(Audio.getEqFilters()[0].gain.value, 4.5);

  // By index
  Audio.setEqBand(1, -2);
  assert.strictEqual(global.localStorage.getItem('gp_eq_230'), '-2');
  assert.strictEqual(Audio.getEqFilters()[1].gain.value, -2);
});

test('setBassBoost: updates filter and localStorage', () => {
  Audio.setBassBoost(true);
  assert.strictEqual(global.localStorage.getItem('gp_effect_bassboost'), 'true');
  assert.strictEqual(Audio.getBassFilter().gain.value, 10);

  Audio.setBassBoost(false);
  assert.strictEqual(global.localStorage.getItem('gp_effect_bassboost'), 'false');
  assert.strictEqual(Audio.getBassFilter().gain.value, 0);
});

test('setPlaybackRate: updates player and localStorage', () => {
  Audio.setPlaybackRate(1.25, true);
  assert.strictEqual(global.localStorage.getItem('gp_effect_speed'), '1.25');
  assert.strictEqual(global.localStorage.getItem('gp_effect_pitch_linked'), 'true');
  assert.strictEqual(mockAudioPlayer.playbackRate, 1.25);
  assert.strictEqual(mockAudioPlayer.preservesPitch, false);
});

test('Global aliases: window.analyser, window.initAudioEffects, window.setEqBand exist', () => {
  assert.strictEqual(global.initAudioContext, Audio.initAudioContext);
  assert.strictEqual(global.initAudioEffects, Audio.initAudioEffects);
  assert.strictEqual(global.analyser, Audio.getAnalyser());
  assert.strictEqual(global.dataArray, Audio.getDataArray());
  assert.strictEqual(global.eqFilters, Audio.getEqFilters());
  assert.strictEqual(global.bassFilter, Audio.getBassFilter());
});

test('Visualizer data collection: getByteFrequencyData populates dataArray', () => {
  const analyser = Audio.getAnalyser();
  const data = Audio.getDataArray();
  analyser.getByteFrequencyData(data);
  assert.strictEqual(data[0], 0);
  assert.strictEqual(data[1], 2);
  assert.strictEqual(data[10], 20);
});

console.log('\n----------------------------------------------------');
console.log(`TEST RESULTS: ${passed} / ${total} PASSED`);
if (passed === total) {
  console.log('[ALL TESTS PASSED SUCCESSFULLY]');
} else {
  console.error(`[FAIL] ${total - passed} tests failed!`);
  process.exit(1);
}
console.log('====================================================\n');
