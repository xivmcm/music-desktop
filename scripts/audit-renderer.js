const fs = require('fs');

const htmlContent = fs.readFileSync('index.html', 'utf8');
const rendererContent = fs.readFileSync('renderer.js', 'utf8');
const lines = rendererContent.split(/\r?\n/);

console.log('================================================================');
console.log('  GLASSPLAYER RENDERER.JS DEEP ARCHITECTURAL AUDIT             ');
console.log('================================================================\n');

// 1. INLINE EVENT HANDLERS IN HTML
console.log('--- 1. HTML INLINE EVENT HANDLERS & DATA ATTRIBUTES ---');
const inlineEventRegex = /\s(on[a-zA-Z]+)\s*=\s*["']([^"']*)["']/g;
let m;
let inlineCount = 0;
while ((m = inlineEventRegex.exec(htmlContent)) !== null) {
  console.log(`  ${m[1]}="${m[2]}"`);
  inlineCount++;
}
if (inlineCount === 0) {
  console.log('  [NOTICE] 0 inline on* event handlers found in index.html! All events use addEventListener or data attributes.');
}

const dataAttrRegex = /\s(data-[a-zA-Z0-9_-]+)(?:\s*=\s*["']([^"']*)["'])?/g;
const dataAttrs = new Map();
while ((m = dataAttrRegex.exec(htmlContent)) !== null) {
  const attr = m[1];
  const val = m[2] || '';
  if (!dataAttrs.has(attr)) dataAttrs.set(attr, new Set());
  dataAttrs.get(attr).add(val);
}
console.log(`\nFound ${dataAttrs.size} distinct data-* attributes in index.html:`);
for (const [attr, vals] of dataAttrs.entries()) {
  const sample = Array.from(vals).slice(0, 5).join(', ');
  console.log(`  ${attr} (${vals.size} unique values, e.g.: ${sample})`);
}

// 2. GLOBAL STATE VARIABLES
console.log('\n--- 2. CORE GLOBAL STATE VARIABLES IN RENDERER.JS ---');
// Let's identify top-level let/var declarations (indentation === 0)
const topLevelVars = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Match top-level declarations (no leading spaces)
  const declMatch = line.match(/^(let|var|const)\s+([a-zA-Z0-9_$]+)/);
  if (declMatch) {
    topLevelVars.push({ lineNum: i + 1, type: declMatch[1], name: declMatch[2], raw: line.trim() });
  }
}
console.log(`Total top-level declarations (let/var/const): ${topLevelVars.length}`);
const coreStateVars = topLevelVars.filter(v => v.type === 'let' || v.type === 'var');
console.log(`Mutable state variables (let/var): ${coreStateVars.length}`);
coreStateVars.forEach(v => {
  console.log(`  L${v.lineNum.toString().padStart(4)}: ${v.type} ${v.name}`);
});

// 3. MUTATIONS OF KEY CORE STATE VARIABLES
console.log('\n--- 3. MUTATIONS OF KEY CORE STATE VARIABLES ---');
const keyVarsToTrack = [
  'playlist',
  'currentTrackIndex',
  'activePlayingTrack',
  'isSeeking',
  'activeView',
  'currentUser',
  'token',
  'customTheme',
  'likedTrackIds',
  'isRepeat',
  'isShuffle',
  'friendStatuses',
  'activeSources'
];

for (const varName of keyVarsToTrack) {
  const assignRegex = new RegExp(`\\b${varName}\\s*(?:=|[+][=]|[-][=]|\\.push|\\.splice|\\.set|\\.add|\\.delete|\\.clear)`, 'g');
  const mutatingFunctions = new Set();
  let matchCount = 0;

  // Track enclosing function
  let currentFunc = 'TOP_LEVEL';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const funcMatch = line.match(/(?:function\s+([a-zA-Z0-9_$]+)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?function)/);
    if (funcMatch) {
      currentFunc = funcMatch[1] || funcMatch[2] || funcMatch[3] || currentFunc;
    }
    if (assignRegex.test(line)) {
      matchCount++;
      mutatingFunctions.add(currentFunc);
    }
  }
  console.log(`\nVariable: '${varName}' (Mutated ~${matchCount} times in ${mutatingFunctions.size} contexts):`);
  console.log(`  Mutated in: ${Array.from(mutatingFunctions).slice(0, 10).join(', ')}${mutatingFunctions.size > 10 ? ' ...' : ''}`);
}

// 4. FUNCTION INVENTORY
console.log('\n--- 4. FUNCTION INVENTORY & CANDIDATE PURE UTILITIES ---');
const functions = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const fnMatch = line.match(/^async\s+function\s+([a-zA-Z0-9_$]+)|^function\s+([a-zA-Z0-9_$]+)/);
  if (fnMatch) {
    const fnName = fnMatch[1] || fnMatch[2];
    functions.push({ lineNum: i + 1, name: fnName, isAsync: !!fnMatch[1] });
  }
}
console.log(`Total declared top-level functions: ${functions.length}`);

// Candidate pure utility check (e.g. formatTime, escapeHtml, sanitize, parse, color math)
const purePatterns = [
  /^format/i,
  /^escape/i,
  /^sanitize/i,
  /^parse/i,
  /^calculate/i,
  /^clamp/i,
  /^getContrast/i,
  /^hexTo/i,
  /^rgbTo/i,
  /^timeAgo/i,
  /^formatTime/i,
  /^formatDuration/i,
  /^formatDate/i,
  /^formatNumber/i,
  /^debounce/i,
  /^throttle/i
];

const pureCandidates = functions.filter(f => purePatterns.some(p => p.test(f.name)));
console.log(`Identified ${pureCandidates.length} candidate utility functions:`);
pureCandidates.forEach(f => console.log(`  L${f.lineNum.toString().padStart(4)}: ${f.name}`));
