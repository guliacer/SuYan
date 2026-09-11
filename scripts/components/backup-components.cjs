// 校验签名离线包后备份；--repair-missing 仅恢复当前组件中缺失的清单文件。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const JSZip = require('jszip');
const root = path.resolve(__dirname, '../..');
const { COMPONENT_SIGNING_PUBLIC_KEY_PEM } = require('../../dist-electron/electron/main/modules/componentConfig.js');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

async function main() {
  const backup = path.join(root, 'recovery-backups', `components-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  for (const folder of ['6.0-suyan.1', 'nsfw-1.0.0-signed']) {
    const source = path.join(root, 'release-components', folder);
    const manifestBytes = fs.readFileSync(path.join(source, 'manifest.json'));
    const signature = fs.readFileSync(path.join(source, 'manifest.json.sig'));
    if (!crypto.verify(null, manifestBytes, COMPONENT_SIGNING_PUBLIC_KEY_PEM, signature)) throw new Error(`${folder}: 签名无效`);
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    const archive = fs.readFileSync(path.join(source, manifest.archive.name));
    if (archive.length !== manifest.archive.size || hash(archive) !== manifest.archive.sha256) throw new Error(`${folder}: ZIP 校验失败`);
    const zip = await JSZip.loadAsync(archive);
    const installed = path.join(root, 'release/win-unpacked/data/components', manifest.componentId, manifest.version, manifest.platform);
    const verified = [];
    for (const file of manifest.files) {
      const target = path.resolve(installed, file.name);
      if (!target.startsWith(installed + path.sep) || file.name.includes('..') || path.isAbsolute(file.name)) throw new Error('不安全的清单路径');
      const entry = zip.file(file.name);
      if (!entry) throw new Error(`${file.name}: ZIP 缺文件`);
      const bytes = await entry.async('nodebuffer');
      if (bytes.length !== file.size || hash(bytes) !== file.sha256) throw new Error(`${file.name}: 文件校验失败`);
      verified.push({ target, bytes });
    }
    const destination = path.join(backup, folder);
    fs.mkdirSync(destination, { recursive: true });
    for (const name of ['manifest.json', 'manifest.json.sig', manifest.archive.name]) {
      fs.copyFileSync(path.join(source, name), path.join(destination, name), fs.constants.COPYFILE_EXCL);
    }
    let missing = 0;
    let changed = 0;
    for (const { target, bytes } of verified) {
      if (!fs.existsSync(target)) {
        missing++;
        if (process.argv.includes('--repair-missing')) {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, bytes, { flag: 'wx' });
        }
      } else if (hash(fs.readFileSync(target)) !== hash(bytes)) changed++;
    }
    console.log(JSON.stringify({ component: manifest.componentId, files: verified.length, missing, changed, repaired: process.argv.includes('--repair-missing'), backup: destination }));
    if (changed) throw new Error('现有组件有不匹配文件，已保留原文件，请通过签名安装器重新安装');
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
