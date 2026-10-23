const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const os = require('os');

console.log('====================================================');
console.log('   GLASSPLAYER HOT-UPDATE SYSTEM UNIT TESTS         ');
console.log('====================================================\n');

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    process.exit(1);
  }
}

const rootDir = path.resolve(__dirname, '..');
const hotBundlePath = path.join(rootDir, 'docs', 'hot-update.gz');
const versionJsonPath = path.join(rootDir, 'docs', 'version.json');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

test('docs/hot-update.gz exists and is compact (< 1.5 MB)', () => {
  assert.ok(fs.existsSync(hotBundlePath), 'hot-update.gz does not exist');
  const stat = fs.statSync(hotBundlePath);
  assert.ok(stat.size > 100 * 1024, 'hot-update.gz is unexpectedly small');
  assert.ok(stat.size < 1500 * 1024, 'hot-update.gz exceeds 1.5 MB');
});

test('docs/version.json contains valid hotUpdate metadata', () => {
  const vData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
  assert.strictEqual(vData.version, pkg.version);
  assert.ok(vData.hotUpdate, 'Missing hotUpdate block in version.json');
  assert.ok(vData.hotUpdate.url.includes('hot-update.gz'));
  assert.ok(vData.hotUpdate.fallbackUrl.includes('hot-update.gz'));
  assert.strictEqual(typeof vData.hotUpdate.sha256, 'string');
  assert.strictEqual(vData.hotUpdate.sha256.length, 64);
});

test('SHA-256 of docs/hot-update.gz matches version.json', () => {
  const vData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
  const raw = fs.readFileSync(hotBundlePath);
  const actualSha = crypto.createHash('sha256').update(raw).digest('hex');
  assert.strictEqual(actualSha, vData.hotUpdate.sha256);
  assert.strictEqual(raw.length, vData.hotUpdate.size);
});

test('Decompressed bundle contains all required core & UI files', () => {
  const raw = fs.readFileSync(hotBundlePath);
  const bundle = JSON.parse(zlib.gunzipSync(raw).toString('utf8'));
  assert.strictEqual(bundle.version, pkg.version);
  assert.ok(bundle.files['package.json']);
  assert.ok(bundle.files['main.js']);
  assert.ok(bundle.files['preload.js']);
  assert.ok(bundle.files['index.html']);
  assert.ok(bundle.files['renderer.js']);
  assert.ok(bundle.files['js/components/changelog.js']);
  assert.ok(bundle.files['js/views/settings-view.js']);
});

test('Simulated atomic staging extraction matches source files byte-for-byte', () => {
  const raw = fs.readFileSync(hotBundlePath);
  const bundle = JSON.parse(zlib.gunzipSync(raw).toString('utf8'));
  const testDir = path.join(os.tmpdir(), 'gp-hot-update-unit-test');
  if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  fs.mkdirSync(testDir, { recursive: true });

  for (const [relPath, b64] of Object.entries(bundle.files)) {
    const safeRel = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const targetFile = path.join(testDir, safeRel);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, Buffer.from(b64, 'base64'));
  }

  const extractedPkg = JSON.parse(fs.readFileSync(path.join(testDir, 'package.json'), 'utf8'));
  assert.strictEqual(extractedPkg.version, pkg.version);

  const srcRenderer = fs.readFileSync(path.join(rootDir, 'renderer.js'));
  const extRenderer = fs.readFileSync(path.join(testDir, 'renderer.js'));
  assert.strictEqual(Buffer.compare(srcRenderer, extRenderer), 0);

  fs.rmSync(testDir, { recursive: true, force: true });
});

console.log('\n----------------------------------------------------');
console.log(`TEST RESULTS: ${passCount} / ${passCount} PASSED`);
console.log('[ALL HOT-UPDATE TESTS PASSED SUCCESSFULLY]');
console.log('====================================================\n');
