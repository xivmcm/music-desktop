const fs = require('fs');
const path = require('path');

function processFile(filePath) {
  console.log(`Processing ${filePath}...`);
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Replace activeView declaration
  const targetActiveView = "let activeView = 'home'; // 'home', 'search', 'library', 'history', 'playlists', 'playlist-tracks', 'settings', 'artist'";
  const replacementActiveView = "// activeView is managed reactively on window by js/views/settings-view.js";
  if (!content.includes(targetActiveView)) {
    throw new Error(`Target activeView declaration not found in ${filePath}`);
  }
  content = content.replace(targetActiveView, replacementActiveView);

  // 2. Expose API_URL, BACKEND_URL, DEFAULT_MIRRORS on window
  const targetBackendUrl = "let BACKEND_URL = `${API_URL}/api`;";
  const replacementBackendUrl = `let BACKEND_URL = \`\${API_URL}/api\`;\nwindow.API_URL = API_URL;\nwindow.BACKEND_URL = BACKEND_URL;\nwindow.DEFAULT_MIRRORS = DEFAULT_MIRRORS;`;
  if (!content.includes(targetBackendUrl)) {
    throw new Error(`Target BACKEND_URL declaration not found in ${filePath}`);
  }
  content = content.replace(targetBackendUrl, replacementBackendUrl);

  // 3. Cut Settings & Themes Controller block
  const startMarker = '// --- Step 3 Settings & Themes Controller ---';
  const endMarker = '// Startup Initialization';
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Cut markers not found in ${filePath}`);
  }

  const replacementComment = '// --- Step 3 Settings & Themes Controller (Extracted to js/views/settings-view.js) ---\n\n';
  content = content.slice(0, startIdx) + replacementComment + content.slice(endIdx);

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Successfully updated ${filePath}.`);
}

processFile(path.join(__dirname, '..', 'renderer.js'));
processFile(path.join(__dirname, '..', 'www', 'renderer.js'));
