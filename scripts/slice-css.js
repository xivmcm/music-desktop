const fs = require('fs');
const path = require('path');
const { runVerification } = require('./verify-css');

const manifest = [
  { file: 'css/variables.css', start: 1, end: 247, desc: 'Google Fonts, :root variables, core tokens, base reset' },
  { file: 'css/base.css', start: 248, end: 641, desc: 'Titlebar, window controls, sidebar, custom scrollbars, layout containers' },
  { file: 'css/components/track-cards.css', start: 642, end: 840, desc: 'Tracks grid layout, track cards, cover containers, play buttons, badges' },
  { file: 'css/components/player-bar.css', start: 841, end: 1106, desc: 'Bottom player bar, controls, timeline, volume, equalizer, spin keyframes' },
  { file: 'css/components/header.css', start: 1107, end: 1246, desc: 'Header action buttons, profile dropdown popover, account info' },
  { file: 'css/components/modals.css', start: 1247, end: 1410, desc: 'Modal dialog overlays, modal window, playlist modals' },
  { file: 'css/components/popovers-banners.css', start: 1411, end: 1709, desc: 'View header, card context menu (+ button popover), auto-updater banner, theme overrides' },
  { file: 'css/views/home.css', start: 1710, end: 1755, desc: 'Home screen hero recommendations, section headers' },
  { file: 'css/views/artist.css', start: 1756, end: 1911, desc: 'Artist profile header banner, discography rows, error state' },
  { file: 'css/views/settings.css', start: 1912, end: 2271, desc: 'Settings view, audio/appearance toggles, theme color pickers' },
  { file: 'css/components/mini-player.css', start: 2272, end: 2608, desc: 'Mini player mode layout, dedicated mini player block, compact progress' },
  { file: 'css/components/search-tabs.css', start: 2609, end: 2704, desc: 'Search sources selectors in dropdown, active header tab indicators' },
  { file: 'css/views/social.css', start: 2705, end: 3128, desc: 'Release 1.3.0 Social: user search row, auth modal, profile dashboard, friend activity & playlists' },
  { file: 'css/views/home-discovery.css', start: 3129, end: 3496, desc: 'Redesign main view: header pills, modern search bar, carousel hero, quick filters, genre scroller' },
  { file: 'css/components/horizontal-cards.css', start: 3497, end: 3765, desc: 'Horizontal track cards grid, play badge overlays, hover states, Spotify placeholder' },
  { file: 'css/components/social-presence.css', start: 3766, end: 4117, desc: 'Friend activity cards, live presence, marquee status, Find Friends modal rows, collab avatars stack' },
  { file: 'css/components/lyrics.css', start: 4118, end: 4310, desc: 'Spotify badge, player bar lyrics button, glassmorphic lyrics full-screen overlay' },
  { file: 'css/components/runtime-pwa.css', start: 4311, end: 4643, desc: 'Release 1.10.0: Browser/PWA runtime shell, responsive layout, mobile drawer' },
  { file: 'css/components/lyrics-synced.css', start: 4644, end: 4732, desc: 'Enhanced synced lyrics (Apple Music & Spotify Modern Synced Experience), plain-text view' },
  { file: 'css/components/spotify-moods.css', start: 4733, end: 4901, desc: 'Spotify mood and genre cards grid, section headers' },
  { file: 'css/effects/glassmorphism.css', start: 4902, end: 4967, desc: 'GPU hardware acceleration, surface depth levels (glass, frosted, solid, flat), custom scrollbars' },
  { file: 'css/components/toasts-splash.css', start: 4968, end: 5265, desc: 'Release 1.15.0: App startup splash screen, unified glass toast alert cards, CSS3 motion backgrounds' },
  { file: 'css/views/library-engine.css', start: 5266, end: 5542, desc: 'Release 1.16.0: Local MP3 drag-and-drop dropzone, library sub-tabs, player swipe-down, hotfixes' },
  { file: 'css/components/coherent-surfaces.css', start: 5543, end: 5779, desc: 'Release 1.17.0: Coherent player surfaces, mini mode foreground pairs, theme-aware notifications' },
  { file: 'css/views/library-redesign.css', start: 5780, end: 5965, desc: 'Unified library architecture, shared card language, playlists collection view' },
  { file: 'css/views/home-recommendations.css', start: 5966, end: 6350, desc: 'Home richer hierarchy, explainable recommendations, useful rails' },
  { file: 'css/effects/theme-builder.css', start: 6351, end: 6666, desc: 'Theme constructor modular toggles (glass, shadows, motion), high transparency text readability enhancer' },
  { file: 'css/components/misc.css', start: 6667, end: 6721, desc: 'Track share link modals and buttons, native cover drag prevention' }
];

function executeSlice() {
  const rootDir = process.cwd();
  const backupPath = path.resolve(rootDir, 'style.css.bak');
  const targetRootCss = path.resolve(rootDir, 'style.css');

  if (!fs.existsSync(backupPath)) {
    console.error(`[FATAL] style.css.bak not found at ${backupPath}`);
    process.exit(1);
  }

  const rawBak = fs.readFileSync(backupPath, 'utf8');
  const lines = rawBak.split(/\r?\n/);
  console.log(`Loaded style.css.bak: ${lines.length} lines total.\n`);

  // Verify contiguous ranges
  let expectedNext = 1;
  let totalSlicesLines = 0;
  for (const item of manifest) {
    if (item.start !== expectedNext) {
      console.error(`[ERROR] Non-contiguous manifest! Expected start ${expectedNext} but got ${item.start} for ${item.file}`);
      process.exit(1);
    }
    const count = item.end - item.start + 1;
    totalSlicesLines += count;
    expectedNext = item.end + 1;
  }

  if (totalSlicesLines !== lines.length || expectedNext !== lines.length + 1) {
    console.error(`[ERROR] Manifest does not cover all lines! Total: ${totalSlicesLines}, File lines: ${lines.length}`);
    process.exit(1);
  }

  console.log('Manifest integrity check PASSED: Exactly 100% line coverage (1 - ' + lines.length + ').\n');

  // Create directories and write files
  const importStatements = [
    '/* ==========================================================================',
    '   GlassPlayer Modular Stylesheet Architecture',
    '   Generated from monolithic style.css with 100% cascade & rule preservation.',
    '   ========================================================================== */\n'
  ];

  for (const item of manifest) {
    const filePath = path.resolve(rootDir, item.file);
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const chunkLines = lines.slice(item.start - 1, item.end);
    const chunkContent = chunkLines.join('\n');
    fs.writeFileSync(filePath, chunkContent, 'utf8');
    console.log(`[CREATED] ${item.file.padEnd(36)} (lines ${item.start.toString().padStart(4)} - ${item.end.toString().padStart(4)} | ${chunkLines.length.toString().padStart(3)} lines) - ${item.desc}`);

    importStatements.push(`@import './${item.file.replace(/\\/g, '/')}';`);
  }

  // Write new modular style.css
  const newRootStyleContent = importStatements.join('\n') + '\n';
  fs.writeFileSync(targetRootCss, newRootStyleContent, 'utf8');
  console.log(`\n[SUCCESS] Root style.css generated with ${manifest.length} @import statements.`);

  // Synchronize to www/
  const wwwDir = path.resolve(rootDir, 'www');
  if (fs.existsSync(wwwDir)) {
    console.log('\n--- SYNCHRONIZING TO WWW/ DIRECTORY ---');
    const wwwCssDir = path.resolve(wwwDir, 'css');
    if (!fs.existsSync(wwwCssDir)) {
      fs.mkdirSync(wwwCssDir, { recursive: true });
    }

    // Copy css directory recursively
    fs.cpSync(path.resolve(rootDir, 'css'), wwwCssDir, { recursive: true });
    console.log('[SYNC] Copied css/ -> www/css/');

    // Copy root style.css to www/style.css
    fs.copyFileSync(targetRootCss, path.resolve(wwwDir, 'style.css'));
    console.log('[SYNC] Copied style.css -> www/style.css');
  }

  console.log('\n--- RUNNING VALIDATION SUITE ---');
  runVerification();
}

if (require.main === module) {
  executeSlice();
}

module.exports = { manifest, executeSlice };
