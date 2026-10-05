const assert = require('assert');
const path = require('path');
const Utils = require('../js/core/utils');

console.log('====================================================');
console.log('  GLASSPLAYER JS/CORE/UTILS.JS UNIT TESTS          ');
console.log('====================================================\n');

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

// 1. Time formatting tests
test('formatTime: handles 0 and standard seconds', () => {
  assert.strictEqual(Utils.formatTime(0), '0:00');
  assert.strictEqual(Utils.formatTime(9), '0:09');
  assert.strictEqual(Utils.formatTime(65), '1:05');
  assert.strictEqual(Utils.formatTime(600), '10:00');
});

test('formatTime: handles hours (> 3600 seconds)', () => {
  assert.strictEqual(Utils.formatTime(3605), '60:05');
});

test('formatTime: edge cases (NaN, undefined, null)', () => {
  assert.strictEqual(Utils.formatTime(NaN), '0:00');
  assert.strictEqual(Utils.formatTime(undefined), '0:00');
  assert.strictEqual(Utils.formatTime(null), '0:00');
});

test('parseDurationToSeconds: parses mm:ss and hh:mm:ss', () => {
  assert.strictEqual(Utils.parseDurationToSeconds('0:00'), 0);
  assert.strictEqual(Utils.parseDurationToSeconds('1:05'), 65);
  assert.strictEqual(Utils.parseDurationToSeconds('01:05:10'), 3910);
  assert.strictEqual(Utils.parseDurationToSeconds(120), 120);
  assert.strictEqual(Utils.parseDurationToSeconds(''), 0);
});

// 2. Formatting & HTML escaping
test('escapeHTML: properly escapes dangerous characters', () => {
  const dangerous = '<script>alert("XSS & fun\'s")</script>';
  const clean = Utils.escapeHTML(dangerous);
  assert.strictEqual(clean, '&lt;script&gt;alert(&quot;XSS &amp; fun&#39;s&quot;)&lt;/script&gt;');
  assert.strictEqual(Utils.escapeHTML(''), '');
  assert.strictEqual(Utils.escapeHTML(null), '');
});

test('formatTrackCount: Russian plurals', () => {
  assert.strictEqual(Utils.formatTrackCount(1), '1 трек');
  assert.strictEqual(Utils.formatTrackCount(2), '2 трека');
  assert.strictEqual(Utils.formatTrackCount(4), '4 трека');
  assert.strictEqual(Utils.formatTrackCount(5), '5 треков');
  assert.strictEqual(Utils.formatTrackCount(11), '11 треков');
  assert.strictEqual(Utils.formatTrackCount(14), '14 треков');
  assert.strictEqual(Utils.formatTrackCount(21), '21 трек');
  assert.strictEqual(Utils.formatTrackCount(104), '104 трека');
});

test('formatPlaybackCount: compact numbers', () => {
  assert.strictEqual(Utils.formatPlaybackCount(500), '500');
  assert.strictEqual(Utils.formatPlaybackCount(1200), '1K');
  assert.strictEqual(Utils.formatPlaybackCount(1000000), '1M');
  assert.strictEqual(Utils.formatPlaybackCount(2500000), '2.5M');
  assert.strictEqual(Utils.formatPlaybackCount(null), '');
});

test('formatUsername: ensures leading @', () => {
  assert.strictEqual(Utils.formatUsername('artem'), '@artem');
  assert.strictEqual(Utils.formatUsername('@artem'), '@artem');
  assert.strictEqual(Utils.formatUsername(''), '');
});

test('formatLastSeen: human readable time ago', () => {
  const now = new Date();
  assert.strictEqual(Utils.formatLastSeen(now.toISOString()), 'был(а) только что');
  
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  assert.strictEqual(Utils.formatLastSeen(fiveMinAgo.toISOString()), 'был(а) 5 минут назад');
  
  const oneMinAgo = new Date(now.getTime() - 1 * 60 * 1000);
  assert.strictEqual(Utils.formatLastSeen(oneMinAgo.toISOString()), 'был(а) 1 минуту назад');
  
  assert.strictEqual(Utils.formatLastSeen(null), 'был(а) давно');
  assert.strictEqual(Utils.formatLastSeen('invalid-date'), 'был(а) давно');
});

// 3. Color & WCAG tests
test('clampThemeNumber & normalizeBorderWidth', () => {
  assert.strictEqual(Utils.clampThemeNumber(5, 0, 0, 10), 5);
  assert.strictEqual(Utils.clampThemeNumber(15, 0, 0, 10), 10);
  assert.strictEqual(Utils.clampThemeNumber(-5, 0, 0, 10), 0);
  assert.strictEqual(Utils.clampThemeNumber(NaN, 2, 0, 10), 2);

  assert.strictEqual(Utils.normalizeBorderWidth(2), '2px');
  assert.strictEqual(Utils.normalizeBorderWidth('3px'), '3px');
  assert.strictEqual(Utils.normalizeBorderWidth(10), '4px'); // max 4px
  assert.strictEqual(Utils.normalizeBorderWidth('invalid'), '1px');
});

test('hexToRgbTriplet & hexToRgba', () => {
  assert.strictEqual(Utils.hexToRgbTriplet('#ffffff'), '255, 255, 255');
  assert.strictEqual(Utils.hexToRgbTriplet('#000000'), '0, 0, 0');
  assert.strictEqual(Utils.hexToRgbTriplet('#ff0000'), '255, 0, 0');
  assert.strictEqual(Utils.hexToRgba('#ffffff', 0.5), 'rgba(255, 255, 255, 0.5)');
});

test('isColorDark & mixHexColors', () => {
  assert.strictEqual(Utils.isColorDark('#000000'), true);
  assert.strictEqual(Utils.isColorDark('#ffffff'), false);
  assert.strictEqual(Utils.mixHexColors('#000000', '#ffffff', 0.5), '#808080');
});

test('getLuminance, getContrastRatio & pickReadableText', () => {
  const whiteLum = Utils.getLuminance('#ffffff');
  const blackLum = Utils.getLuminance('#000000');
  assert.strictEqual(whiteLum > blackLum, true);

  const ratio = Utils.getContrastRatio('#ffffff', '#000000');
  assert.strictEqual(ratio >= 20, true); // Theoretical max 21:1

  const readableOnDark = Utils.pickReadableText('#111116', '#ffffff');
  assert.strictEqual(readableOnDark, '#ffffff');
});

// 4. Parsers
test('parseLRC: parses timestamped lines accurately', () => {
  const lrc = `[00:12.30]First line of lyrics\n[01:05.80]Second line of lyrics\n`;
  const parsed = Utils.parseLRC(lrc);
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0].time, 12.3);
  assert.strictEqual(parsed[0].text, 'First line of lyrics');
  assert.strictEqual(parsed[1].time, 65.8);
  assert.strictEqual(parsed[1].text, 'Second line of lyrics');
});

test('parseIncomingShareLink: parses glassplayer and https links', () => {
  const gpLink = 'glassplayer://track?src=soundcloud&id=12345&t=Awesome+Song&a=Great+Artist&d=3:45';
  const parsed = Utils.parseIncomingShareLink(gpLink);
  assert.ok(parsed);
  assert.strictEqual(parsed.source, 'soundcloud');
  assert.strictEqual(parsed.id, '12345');
  assert.strictEqual(parsed.title, 'Awesome Song');
  assert.strictEqual(parsed.artist, 'Great Artist');
  assert.strictEqual(parsed.duration, '3:45');
  assert.strictEqual(parsed.sharedViaLink, true);

  // Invalid links
  assert.strictEqual(Utils.parseIncomingShareLink('https://invalid.com/track'), null);
  assert.strictEqual(Utils.parseIncomingShareLink('not-a-link'), null);
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
