const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  let hasError = false;

  win.webContents.session.webRequest.onErrorOccurred((details) => {
    if (details.url.includes('.css')) {
      console.error(`[Network Error] Failed loading ${details.url}: ${details.error}`);
      hasError = true;
    }
  });

  win.loadFile(path.join(__dirname, '../index.html')).then(async () => {
    const rootResult = await win.webContents.executeJavaScript(`
      ({
        accent: getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim(),
        firstSheetRules: document.styleSheets[0]?.cssRules?.length || 0
      })
    `);
    console.log('Root index.html Evaluation:', JSON.stringify(rootResult));

    // Now test www/index.html
    await win.loadFile(path.join(__dirname, '../www/index.html'));
    const wwwResult = await win.webContents.executeJavaScript(`
      ({
        accent: getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim(),
        firstSheetRules: document.styleSheets[0]?.cssRules?.length || 0
      })
    `);
    console.log('WWW index.html Evaluation:', JSON.stringify(wwwResult));

    if (rootResult.accent && rootResult.firstSheetRules === 28 && wwwResult.accent && wwwResult.firstSheetRules === 28) {
      console.log('\n[PASS] Both Root and WWW environments successfully loaded and evaluated modular CSS!');
    } else {
      console.error('\n[FAIL] Evaluation failed on root or www!');
      hasError = true;
    }
    app.exit(hasError ? 1 : 0);
  }).catch(err => {
    console.error('Failed to load file:', err);
    app.exit(1);
  });

});
