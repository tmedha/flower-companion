// Dev-only: renders the app icon and the README states strip to PNG files,
// reusing the same procedural flower art the app uses.
// Run with:  npm run assets
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 400,
    height: 400,
    webPreferences: { offscreen: false },
  });

  await win.loadFile(path.join(__dirname, 'asset-gen.html'));

  const outDir = path.join(__dirname, '..', 'assets');
  fs.mkdirSync(outDir, { recursive: true });

  async function save(name, expr) {
    const dataUrl = await win.webContents.executeJavaScript(expr);
    const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(path.join(outDir, name), Buffer.from(b64, 'base64'));
    console.log('wrote assets/' + name);
  }

  try {
    await save('icon.png', 'makeIcon(1024)');
    await save('flower-states.png', 'makeStates()');
  } catch (err) {
    console.error('Asset generation failed:', err);
    process.exitCode = 1;
  }

  app.quit();
});
