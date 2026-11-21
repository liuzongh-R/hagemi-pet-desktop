#!/usr/bin/env node
// Builds cross-platform one-click Antigravity plugin installer archives (Windows & macOS)
// into release/, ensuring Unix LF + 0o755 executable permissions for macOS .command files.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const RELEASE_DIR = join(ROOT, 'release');
const STAGE_DIR = join(RELEASE_DIR, '_stage');

const onlyWin = process.argv.includes('--win');
const onlyMac = process.argv.includes('--mac');
const buildWin = !onlyMac;
const buildMac = !onlyWin;

const PAYLOAD_FILES = ['plugin.json', 'package.json', 'LICENSE', 'NOTICE.md', 'README.md', 'README.zh-CN.md', 'DESKTOP.zh-CN.md'];
const PAYLOAD_DIRS = ['assets', 'electron', 'sidecars', 'sound'];

function copyPayload(dest) {
  mkdirSync(dest, { recursive: true });
  for (const f of PAYLOAD_FILES) {
    const src = join(ROOT, f);
    if (existsSync(src)) cpSync(src, join(dest, f));
  }
  for (const d of PAYLOAD_DIRS) {
    const src = join(ROOT, d);
    if (existsSync(src)) cpSync(src, join(dest, d), { recursive: true });
  }
  // Keep electron + @google/genai in plugin runtime dependencies so npm install --omit=dev works cleanly.
  const pkgPath = join(dest, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const electronVer = pkg.devDependencies?.electron || pkg.dependencies?.electron;
  pkg.dependencies = { ...(pkg.dependencies || {}), ...(electronVer ? { electron: electronVer } : {}) };
  delete pkg.devDependencies;
  delete pkg.build;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
}

function writeLf(srcPath, dstPath) {
  const text = readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n');
  writeFileSync(dstPath, text, 'utf8');
}

function zipDirWithUnixPerms(srcDir, outZip, execExts = ['.command', '.sh']) {
  const pyScript = `
import os, sys, zipfile
src, out_zip, exts = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
with zipfile.ZipFile(out_zip, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for root, dirs, files in os.walk(src):
        dirs.sort()
        files.sort()
        for name in files:
            full = os.path.join(root, name)
            rel = os.path.relpath(full, src).replace('\\\\', '/')
            info = zipfile.ZipInfo(rel)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3  # Unix
            is_exec = any(name.endswith(ext) for ext in exts if ext)
            info.external_attr = (0o100755 if is_exec else 0o100644) << 16
            with open(full, 'rb') as fp:
                zf.writestr(info, fp.read())
print('Created:', out_zip, f'({os.path.getsize(out_zip)/1024/1024:.2f} MB)')
`;
  execFileSync('python', ['-c', pyScript, srcDir, outZip, execExts.join(',')], { stdio: 'inherit' });
}

mkdirSync(RELEASE_DIR, { recursive: true });
rmSync(STAGE_DIR, { recursive: true, force: true });

if (buildWin) {
  const winStage = join(STAGE_DIR, 'windows');
  const winFolder = join(winStage, `Hagemi-Pet-Desktop-Windows-v${VERSION}`);
  mkdirSync(winFolder, { recursive: true });
  cpSync(join(ROOT, 'installers', 'windows', '双击一键安装.bat'), join(winFolder, '双击一键安装.bat'));
  cpSync(join(ROOT, 'installers', 'windows', '双击卸载.bat'), join(winFolder, '双击卸载.bat'));
  copyPayload(join(winFolder, 'payload'));
  const winZip = join(RELEASE_DIR, `Hagemi-Pet-Desktop-Windows-Plugin-v${VERSION}.zip`);
  rmSync(winZip, { force: true });
  zipDirWithUnixPerms(winStage, winZip, []);
}

if (buildMac) {
  const macStage = join(STAGE_DIR, 'macos');
  const macFolder = join(macStage, `Hagemi-Pet-Desktop-macOS-v${VERSION}`);
  mkdirSync(macFolder, { recursive: true });
  writeLf(join(ROOT, 'installers', 'macos', '双击一键安装.command'), join(macFolder, '双击一键安装.command'));
  writeLf(join(ROOT, 'installers', 'macos', '双击卸载.command'), join(macFolder, '双击卸载.command'));
  writeFileSync(
    join(macFolder, 'macOS安装说明.txt'),
    [
      '哈基米桌宠 · Hagemi Pet Desktop (macOS 一键安装包)',
      '===================================================',
      '',
      '安装步骤：',
      '1. 双击「双击一键安装.command」即可自动安装到 Antigravity 插件目录并拉取 macOS 原生架构依赖。',
      '   （如 macOS 提示“无法验证开发者”，请右键点击该文件 → 打开 → 仍要打开）',
      '2. 若首次未安装 Node.js 22+，请先运行 brew install node 或前往 https://nodejs.org 安装。',
      '3. 安装完成后约 15~30 秒，哈基米即会悬浮在 macOS 桌面上，右上角菜单栏出现哈基米图标。',
      '4. 如需使用「👀 瞄一眼屏幕」真·看画面功能，请在：系统设置 → 隐私与安全性 → 屏幕录制 中授权。',
      '5. 如需卸载，双击「双击卸载.command」即可（个人设置与 30 天账本会安全保留）。',
      '',
    ].join('\n'),
    'utf8',
  );
  copyPayload(join(macFolder, 'payload'));
  const macZip = join(RELEASE_DIR, `Hagemi-Pet-Desktop-macOS-OneClick-v${VERSION}.zip`);
  rmSync(macZip, { force: true });
  zipDirWithUnixPerms(macStage, macZip, ['.command']);
}

rmSync(STAGE_DIR, { recursive: true, force: true });
