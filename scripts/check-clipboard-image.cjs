// Real Electron/Windows clipboard check. Uses an isolated data directory and reads only the supplied image.
const { app, clipboard, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const source = path.resolve(process.argv[2]);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'suyan-clipboard-check-'));
  app.setPath('userData', directory);
  try {
    await app.whenReady();
    const loggerPath = require.resolve('../dist-electron/electron/main/appLogger.js');
    require.cache[loggerPath] = { id: loggerPath, filename: loggerPath, loaded: true, exports: { logger: { info() {}, warn() {} } } };
    const { copyImageFileToClipboard } = require('../dist-electron/electron/main/clipboard/copyImageFile.js');
    const bytes = await fs.readFile(source);
    const before = { pathDecoderEmpty: nativeImage.createFromPath(source).isEmpty(), bufferDecoderEmpty: nativeImage.createFromBuffer(bytes).isEmpty() };
    await copyImageFileToClipboard(source, path.basename(source));
    const image = clipboard.readImage();
    assert.equal(image.isEmpty(), false);
    const png = image.toPNG();
    assert.ok(png.length > 8);
    console.log(JSON.stringify({ ...before, clipboardSize: image.getSize(), pngBytes: png.length, result: 'PASS' }));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
    app.quit();
  }
})().catch(error => { console.error(error.message); app.exit(1); });
