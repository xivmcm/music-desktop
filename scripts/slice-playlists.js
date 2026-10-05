const fs = require('fs');
const path = require('path');

function processFile(filePath) {
  console.log(`Processing ${filePath}...`);
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Replace state declarations
  const targetState = "let activePlaylistId = null;\nlet selectedTrackForPlaylist = null;";
  const replacementState = "// activePlaylistId and selectedTrackForPlaylist are managed reactively on window by js/views/playlists-view.js";
  if (!content.includes(targetState)) {
    throw new Error(`Target state declarations not found in ${filePath}`);
  }
  content = content.replace(targetState, replacementState);

  // 2. Cut getPlaylists / savePlaylists
  const targetGetPlaylists = "function getPlaylists() {\n  const data = localStorage.getItem(getStorageKey('playlists'));\n  return data ? JSON.parse(data) : [];\n}\n\nfunction savePlaylists(playlists, sync = true) {\n  localStorage.setItem(getStorageKey('playlists'), JSON.stringify(playlists));\n  if (sync && currentUser && token) {\n    syncPlaylistsWithBackend(playlists);\n  }\n}";
  const replacementGetPlaylists = "// getPlaylists and savePlaylists extracted to js/views/playlists-view.js";
  if (!content.includes(targetGetPlaylists)) {
    throw new Error(`Target getPlaylists block not found in ${filePath}`);
  }
  content = content.replace(targetGetPlaylists, replacementGetPlaylists);

  // 3. Cut Playlists logic block (lines ~1576 to 1900)
  const cut1StartMarker = '// Playlists logic';
  const cut1EndMarker = '\nprofileButton.addEventListener';
  const cut1Start = content.indexOf(cut1StartMarker);
  const cut1End = content.indexOf(cut1EndMarker);
  if (cut1Start === -1 || cut1End === -1) {
    throw new Error(`Playlists logic markers not found in ${filePath}`);
  }
  const replacementCut1 = "// --- Playlists View & Controllers (Extracted to js/views/playlists-view.js) ---\n";
  content = content.slice(0, cut1Start) + replacementCut1 + content.slice(cut1End);

  // 4. Cut Playlist Modal Actions
  const cut2StartMarker = '// Playlist Modal Actions';
  const cut2EndMarker = '\n// Document outside clicks';
  const cut2Start = content.indexOf(cut2StartMarker);
  const cut2End = content.indexOf(cut2EndMarker);
  if (cut2Start === -1 || cut2End === -1) {
    throw new Error(`Playlist modal markers not found in ${filePath}`);
  }
  content = content.slice(0, cut2Start) + content.slice(cut2End);

  // 5. Cut Collaborative & Friend Playlists block (lines ~3144 to 3373)
  const cut3StartMarker = '// Merge offline and online playlists and sync back if necessary';
  const cut3EndMarker = '\n// Left Sliding Sidebar Events & Animations (GPU-accelerated)';
  const cut3Start = content.indexOf(cut3StartMarker);
  const cut3End = content.indexOf(cut3EndMarker);
  if (cut3Start === -1 || cut3End === -1) {
    throw new Error(`Collaborative playlists markers not found in ${filePath}`);
  }
  const replacementCut3 = "// --- Collaborative & Friend Playlists (Extracted to js/views/playlists-view.js) ---\n";
  content = content.slice(0, cut3Start) + replacementCut3 + content.slice(cut3End);

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Successfully updated ${filePath}.`);
}

processFile(path.join(__dirname, '..', 'renderer.js'));
processFile(path.join(__dirname, '..', 'www', 'renderer.js'));
