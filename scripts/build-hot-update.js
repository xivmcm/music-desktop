const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version;

const files = {};

function addFile(relPath) {
  const full = path.join(rootDir, relPath);
  if (fs.existsSync(full) && fs.statSync(full).isFile()) {
    const normalized = relPath.replace(/\\/g, '/');
    files[normalized] = fs.readFileSync(full).toString('base64');
  }
}

function addDir(dirRel) {
  const full = path.join(rootDir, dirRel);
  if (!fs.existsSync(full)) return;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.join(dirRel, entry.name);
    if (entry.isDirectory()) {
      addDir(rel);
    } else {
      addFile(rel);
    }
  }
}

[
  'package.json',
  'main.js',
  'preload.js',
  'index.html',
  'renderer.js',
  'style.css',
  'manifest.json',
  'service-worker.js'
].forEach(addFile);

['css', 'js', 'assets'].forEach(addDir);

const payload = JSON.stringify({
  version,
  timestamp: new Date().toISOString(),
  files
});

const compressed = zlib.gzipSync(Buffer.from(payload, 'utf8'), { level: 9 });
const sha256 = crypto.createHash('sha256').update(compressed).digest('hex');

const docsDir = path.join(rootDir, 'docs');
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

const hotBundlePath = path.join(docsDir, 'hot-update.gz');
fs.writeFileSync(hotBundlePath, compressed);

const versionJsonPath = path.join(docsDir, 'version.json');
let versionData = {};
if (fs.existsSync(versionJsonPath)) {
  try {
    versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
  } catch (_) {}
}

versionData.version = version;
versionData.releaseDate = new Date().toISOString().slice(0, 10);
versionData.hotUpdate = {
  url: 'https://raw.githubusercontent.com/xivmcm/music-desktop/main/docs/hot-update.gz',
  fallbackUrl: 'https://xivmcm.github.io/music-desktop/hot-update.gz',
  sha256,
  size: compressed.length
};
versionData.platforms = {
  win64: {
    url: `https://github.com/xivmcm/music-desktop/releases/latest/download/GlassPlayer-Setup-${version}.exe`,
    filename: `GlassPlayer-Setup-${version}.exe`
  }
};

fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2) + '\n', 'utf8');

console.log(`[HotUpdate Builder] Packed ${Object.keys(files).length} files for v${version}`);
console.log(`[HotUpdate Builder] Bundle: docs/hot-update.gz (${(compressed.length / 1024).toFixed(1)} KB, sha256=${sha256.slice(0, 16)}...)`);
