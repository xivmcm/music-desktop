const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const pairs = [
  ['renderer.js', 'www/renderer.js'],
  ['index.html', 'www/index.html'],
  ['js/social/socket.js', 'www/js/social/socket.js'],
  ['js/social/auth.js', 'www/js/social/auth.js'],
  ['js/social/friends.js', 'www/js/social/friends.js'],
  ['js/views/playlists-view.js', 'www/js/views/playlists-view.js'],
  ['js/views/settings-view.js', 'www/js/views/settings-view.js'],
  ['js/components/changelog.js', 'www/js/components/changelog.js']
];

let allMatched = true;
pairs.forEach(([f1, f2]) => {
  const p1 = path.join(rootDir, f1);
  const p2 = path.join(rootDir, f2);
  const h1 = crypto.createHash('sha256').update(fs.readFileSync(p1)).digest('hex');
  const h2 = crypto.createHash('sha256').update(fs.readFileSync(p2)).digest('hex');
  const match = h1 === h2;
  console.log(`${match ? 'OK' : 'MISMATCH'}: ${f1} <-> ${f2}`);
  if (!match) allMatched = false;
});

if (!allMatched) {
  console.error('Hash parity check failed!');
  process.exit(1);
} else {
  console.log('All mirrored files have 100% hash parity.');
}
