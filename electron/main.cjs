'use strict';
// Electron transparent always-on-top desktop shell for Hagemi Pet.
// Cross-platform: Windows & macOS (Dock policy, Mission Control hiding, multi-monitor drag handoff,
// global shortcut Ctrl/Cmd+Shift+H, ghost click-through mode, login item, native notifications,
// bring-Antigravity-to-front, and in-memory screen capture for Screen Peek).
const {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  screen,
  shell,
  systemPreferences,
  Tray,
} = require('electron');
const { execFile, spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const LOGO_PATH = path.join(ROOT, 'assets', 'logo.png');
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const GLOBAL_TOGGLE_SHORTCUT = 'CommandOrControl+Shift+H';

function argValue(flag) {
  const prefix = `${flag}=`;
  const eq = process.argv.find(a => a.startsWith(prefix));
  if (eq) return eq.slice(prefix.length) || null;
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

const EXTERNAL_BRIDGE_URL = process.env.HAGEMI_BRIDGE_URL || argValue('--bridge-url');
const SOUND_DIR = process.env.HAGEMI_SOUND_DIR || argValue('--sound-dir') || path.join(ROOT, 'sound');
const DATA_DIR = process.env.HAGEMI_DATA_DIR || argValue('--data-dir');

app.setName('hagemi-pet-desktop');
if (IS_WIN) {
  app.setAppUserModelId('com.hagemi.pet.desktop');
}
if (DATA_DIR) {
  try {
    const profileDir = path.join(DATA_DIR, 'electron-profile');
    fs.mkdirSync(profileDir, { recursive: true });
    app.setPath('userData', profileDir);
  } catch {}
}

if (IS_WIN) {
  app.commandLine.appendSwitch('enable-transparent-visuals');
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  console.error('[hagemi-desktop] another instance already holds lock, exiting');
  app.quit();
  process.exit(0);
}

let win = null;
let tray = null;
let bridgeUrl = EXTERNAL_BRIDGE_URL;
let sidecarChild = null;
let quitting = false;
let sseReq = null;
let activeDisplayId = null;
let lastNotifAt = new Map();
let lastLaunchAtLogin = null;

let currentSettings = {
  displayMode: 'desktop',
  alwaysOnTop: 'screen-saver',
  hidden: false,
  hiddenUntil: 0,
  roamEnabled: false,
  showInDock: false,
  theme: 'auto',
  opacity: 1,
  ghostMode: false,
  launchAtLogin: false,
  notifications: { enabled: true, onTurnDone: true, onQuotaAlert: true },
  sound: { enabled: true },
};

function postMessage(payload) {
  if (!bridgeUrl) return;
  const body = JSON.stringify(payload);
  try {
    const u = new URL('/api/message', bridgeUrl);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => { res.resume(); });
    req.on('error', () => {});
    req.end(body);
  } catch {}
}

function openSoundFolder() {
  try { fs.mkdirSync(SOUND_DIR, { recursive: true }); } catch {}
  shell.openPath(SOUND_DIR).catch(() => {});
}

function focusAntigravityWindow() {
  try {
    if (IS_MAC) {
      execFile('osascript', ['-e', 'tell application "Antigravity" to activate'], { timeout: 3000 }, () => {});
    } else if (IS_WIN) {
      const script = [
        'Add-Type -Namespace Win32 -Name Focus -MemberDefinition @"',
        '[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);',
        '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
        '"@',
        '$p = Get-Process | Where-Object { $_.ProcessName -match "antigravity" -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1',
        'if ($p) { [void][Win32.Focus]::ShowWindowAsync($p.MainWindowHandle, 9); [void][Win32.Focus]::SetForegroundWindow($p.MainWindowHandle) }',
      ].join('\n');
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 4000 }, () => {});
    }
  } catch {}
}

async function captureActiveScreenJpeg(requestId) {
  try {
    if (IS_MAC && typeof systemPreferences.getMediaAccessStatus === 'function') {
      const status = systemPreferences.getMediaAccessStatus('screen');
      if (status === 'denied' || status === 'restricted') {
        postMessage({ type: 'screen_capture_result', requestId, error: 'no_permission' });
        return;
      }
    }
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1024, height: 576 },
    });
    if (!sources.length) {
      postMessage({ type: 'screen_capture_result', requestId, error: 'no_sources' });
      return;
    }
    const cur = currentDisplay();
    const matched = sources.find(s => String(s.display_id) === String(cur.id)) || sources[0];
    const jpeg = matched.thumbnail.toJPEG(72);
    if (!jpeg || !jpeg.length) {
      postMessage({ type: 'screen_capture_result', requestId, error: 'empty_capture' });
      return;
    }
    postMessage({
      type: 'screen_capture_result',
      requestId,
      base64Jpeg: jpeg.toString('base64'),
    });
  } catch (error) {
    postMessage({ type: 'screen_capture_result', requestId, error: String(error?.message || 'capture_failed') });
  }
}

async function handleBackupExportDialog(payload) {
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出哈基米配置与账本备份',
      defaultPath: path.join(app.getPath('documents'), `hagemi-pet-backup-${stamp}.json`),
      filters: [{ name: 'JSON Backup', extensions: ['json'] }],
    });
    if (canceled || !filePath) return;
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    postMessage({ type: 'backup_exported', ok: true });
  } catch (error) {
    postMessage({ type: 'backup_exported', ok: false, error: String(error?.message || 'export_failed') });
  }
}

async function handleBackupImportDialog() {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '导入哈基米配置与账本备份',
      properties: ['openFile'],
      filters: [{ name: 'JSON Backup', extensions: ['json'] }],
    });
    if (canceled || !filePaths?.length) return;
    const raw = fs.readFileSync(filePaths[0], 'utf8');
    const parsed = JSON.parse(raw);
    postMessage({ type: 'backup_import_data', data: parsed });
  } catch (error) {
    postMessage({ type: 'backup_import_data', error: String(error?.message || 'import_failed') });
  }
}

function isPetHidden(s = currentSettings) {
  return Boolean(s.hidden || (s.hiddenUntil && Date.now() < s.hiddenUntil));
}

function currentDisplay() {
  const all = screen.getAllDisplays();
  if (activeDisplayId != null) {
    const found = all.find(d => d.id === activeDisplayId);
    if (found) return found;
  }
  const primary = screen.getPrimaryDisplay();
  activeDisplayId = primary.id;
  return primary;
}

function moveToDisplay(display, { center = false, frac = null } = {}) {
  if (!display || !win || win.isDestroyed()) return;
  activeDisplayId = display.id;
  const { x, y, width, height } = display.workArea;
  win.setBounds({ x, y, width, height }, false);
  if (center) {
    postMessage({ type: 'tray_action', action: 'center', frac: frac || { x: 0.5, y: 0.5 } });
  }
}

function centerOnCursorDisplay() {
  const cursor = screen.getCursorScreenPoint();
  const target = screen.getDisplayNearestPoint(cursor) || screen.getPrimaryDisplay();
  if (isPetHidden()) postMessage({ type: 'settings', patch: { hidden: false, hiddenUntil: 0 } });
  moveToDisplay(target, { center: true });
}

function moveToNextDisplay() {
  const all = screen.getAllDisplays();
  if (all.length <= 1) {
    centerOnCursorDisplay();
    return;
  }
  const idx = all.findIndex(d => d.id === currentDisplay().id);
  const next = all[(idx + 1) % all.length];
  moveToDisplay(next, { center: true });
}

function handleEdgeCheck(screenX, screenY) {
  const all = screen.getAllDisplays();
  if (all.length <= 1) return;
  const cur = currentDisplay();
  const cursor = screen.getCursorScreenPoint();
  const px = Number.isFinite(cursor?.x) ? cursor.x : screenX;
  const py = Number.isFinite(cursor?.y) ? cursor.y : screenY;
  let probeX = px;
  let probeY = py;
  if (px <= cur.workArea.x + 8) probeX = cur.workArea.x - 24;
  else if (px >= cur.workArea.x + cur.workArea.width - 8) probeX = cur.workArea.x + cur.workArea.width + 24;
  if (py <= cur.workArea.y + 8) probeY = cur.workArea.y - 24;
  else if (py >= cur.workArea.y + cur.workArea.height - 8) probeY = cur.workArea.y + cur.workArea.height + 24;

  const target = screen.getDisplayNearestPoint({ x: probeX, y: probeY });
  if (target && target.id !== cur.id) {
    const relX = Math.min(0.88, Math.max(0.12, (probeX - target.workArea.x) / Math.max(1, target.workArea.width)));
    const relY = Math.min(0.85, Math.max(0.15, (probeY - target.workArea.y) / Math.max(1, target.workArea.height)));
    moveToDisplay(target, { center: true, frac: { x: relX, y: relY } });
  }
}

function applyMacDockPolicy() {
  if (!IS_MAC) return;
  const showDock = !!currentSettings.showInDock;
  try {
    if (app.dock) {
      if (showDock) {
        app.dock.show();
        app.dock.setMenu?.(buildTrayMenu());
      } else {
        app.dock.hide();
      }
    }
  } catch {}
}

function applyLaunchAtLogin(enabled) {
  const next = !!enabled;
  if (lastLaunchAtLogin === null) {
    lastLaunchAtLogin = next;
    return;
  }
  if (next === lastLaunchAtLogin) return;
  lastLaunchAtLogin = next;
  if (!IS_WIN && !IS_MAC) return;
  try {
    app.setLoginItemSettings({
      openAtLogin: next,
      path: process.execPath,
      args: [ROOT],
    });
  } catch {}
}

function applyWindowState() {
  if (!win || win.isDestroyed()) return;
  const shouldShow = currentSettings.displayMode !== 'app' && !isPetHidden();
  if (shouldShow) {
    if (!win.isVisible()) {
      if (IS_MAC) win.show();
      else win.showInactive();
    }
  } else {
    if (win.isVisible()) win.hide();
  }
  if (currentSettings.ghostMode) {
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setFocusable(false);
  }
  const topFull = currentSettings.alwaysOnTop === 'screen-saver';
  const level = topFull ? 'screen-saver' : 'floating';
  win.setAlwaysOnTop(true, level, 1);
  applyLaunchAtLogin(currentSettings.launchAtLogin);
  if (IS_MAC) {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: topFull });
    if (typeof win.setHiddenInMissionControl === 'function') {
      win.setHiddenInMissionControl(true);
    }
    applyMacDockPolicy();
  }
}

function fitWindowToActiveDisplay() {
  if (!win || win.isDestroyed()) return;
  const d = currentDisplay();
  const { x, y, width, height } = d.workArea;
  win.setBounds({ x, y, width, height }, false);
}

function showNativeNotification({ title, body, kind = 'general' }) {
  if (!currentSettings.notifications?.enabled) return;
  if (!Notification.isSupported()) return;
  const now = Date.now();
  const prev = lastNotifAt.get(kind) || 0;
  if (now - prev < 20000) return;
  lastNotifAt.set(kind, now);
  try {
    const icon = nativeImage.createFromPath(LOGO_PATH);
    const notif = new Notification({
      title: String(title || 'Hagemi Pet'),
      body: String(body || ''),
      icon: icon.isEmpty() ? undefined : icon,
      silent: currentSettings.sound?.enabled === false,
    });
    notif.on('click', () => {
      if (kind.startsWith('quota')) {
        postMessage({ type: 'tray_action', action: 'quota_show' });
      } else if (kind === 'turn_done' || kind === 'turn_error' || kind === 'waiting') {
        focusAntigravityWindow();
      } else {
        centerOnCursorDisplay();
      }
    });
    notif.show();
  } catch {}
}

function buildTrayMenu() {
  const hidden = isPetHidden();
  const mode = currentSettings.displayMode || 'desktop';
  const topFull = currentSettings.alwaysOnTop === 'screen-saver';
  const soundOn = currentSettings.sound?.enabled !== false;
  const notifOn = currentSettings.notifications?.enabled !== false;
  const roamOn = !!currentSettings.roamEnabled;
  const ghostOn = !!currentSettings.ghostMode;
  const multiScreen = screen.getAllDisplays().length > 1;

  const template = [
    {
      label: '🐟 立即查看剩余额度',
      click: () => {
        if (mode === 'app') postMessage({ type: 'settings', patch: { displayMode: 'desktop' } });
        if (hidden || ghostOn) postMessage({ type: 'settings', patch: { hidden: false, hiddenUntil: 0, ghostMode: false } });
        postMessage({ type: 'tray_action', action: 'quota_show' });
      },
    },
    {
      label: '💬 和哈基米聊一聊',
      click: () => {
        if (mode === 'app') postMessage({ type: 'settings', patch: { displayMode: 'desktop' } });
        if (hidden || ghostOn) postMessage({ type: 'settings', patch: { hidden: false, hiddenUntil: 0, ghostMode: false } });
        postMessage({ type: 'tray_action', action: 'open_chat' });
      },
    },
    {
      label: '👀 瞄一眼屏幕碎碎念',
      click: () => {
        if (hidden) postMessage({ type: 'settings', patch: { hidden: false, hiddenUntil: 0 } });
        postMessage({ type: 'screen_peek', manual: true });
      },
    },
    {
      label: '🐟 投喂小鱼干',
      click: () => postMessage({ type: 'feed_fish' }),
    },
    {
      label: '🎯 归中找回（当前屏幕）',
      click: () => centerOnCursorDisplay(),
    },
    {
      label: '🚀 唤回 Antigravity 窗口',
      click: () => focusAntigravityWindow(),
    },
  ];

  if (multiScreen) {
    template.push({
      label: '🖥️ 移到下一块屏幕',
      click: () => moveToNextDisplay(),
    });
  }

  template.push(
    { type: 'separator' },
    {
      label: hidden ? '👁️ 显示桌宠 (Ctrl+Shift+H)' : '🙈 暂时隐藏桌宠 (Ctrl+Shift+H)',
      click: () => postMessage({ type: 'settings', patch: { hidden: !hidden, hiddenUntil: 0 } }),
    },
    {
      label: '👻 幽灵穿透（专注防误触）',
      type: 'checkbox',
      checked: ghostOn,
      click: item => postMessage({ type: 'settings', patch: { ghostMode: item.checked } }),
    },
    {
      label: '📌 前台置顶（盖过全屏）',
      type: 'checkbox',
      checked: topFull,
      click: item => postMessage({ type: 'settings', patch: { alwaysOnTop: item.checked ? 'screen-saver' : 'floating' } }),
    },
    {
      label: '🐾 空闲桌面漫游',
      type: 'checkbox',
      checked: roamOn,
      click: item => postMessage({ type: 'settings', patch: { roamEnabled: item.checked } }),
    },
  );

  if (IS_MAC) {
    template.push({
      label: '⚓ 在程序坞显示图标',
      type: 'checkbox',
      checked: !!currentSettings.showInDock,
      click: item => postMessage({ type: 'settings', patch: { showInDock: item.checked } }),
    });
  }

  template.push(
    {
      label: '🖥️ 显示模式',
      submenu: [
        {
          label: '桌面全局悬浮（推荐）',
          type: 'radio',
          checked: mode === 'desktop',
          click: () => postMessage({ type: 'settings', patch: { displayMode: 'desktop' } }),
        },
        {
          label: '仅 Antigravity 窗口内',
          type: 'radio',
          checked: mode === 'app',
          click: () => postMessage({ type: 'settings', patch: { displayMode: 'app' } }),
        },
        {
          label: '双端同时显示',
          type: 'radio',
          checked: mode === 'both',
          click: () => postMessage({ type: 'settings', patch: { displayMode: 'both' } }),
        },
      ],
    },
    { type: 'separator' },
    {
      label: '🔔 系统弹窗通知',
      type: 'checkbox',
      checked: notifOn,
      click: item => postMessage({ type: 'settings', patch: { notifications: { enabled: item.checked } } }),
    },
    {
      label: '🔊 互动音效',
      type: 'checkbox',
      checked: soundOn,
      click: item => postMessage({ type: 'settings', patch: { sound: { enabled: item.checked } } }),
    },
    {
      label: '📂 打开音效目录 (sound/)',
      click: openSoundFolder,
    },
    {
      label: '⚡ 随系统开机自启',
      type: 'checkbox',
      checked: !!currentSettings.launchAtLogin,
      click: item => postMessage({ type: 'settings', patch: { launchAtLogin: item.checked } }),
    },
    {
      label: '⚙️ 打开设置…',
      click: () => {
        if (hidden || ghostOn) postMessage({ type: 'settings', patch: { hidden: false, hiddenUntil: 0, ghostMode: false } });
        postMessage({ type: 'tray_action', action: 'open_settings' });
      },
    },
    { type: 'separator' },
    {
      label: '🚪 退出哈基米桌宠',
      click: () => {
        quitting = true;
        postMessage({ type: 'tray_action', action: 'quit' });
        setTimeout(() => app.quit(), 150);
      },
    },
  );

  return Menu.buildFromTemplate(template);
}

function refreshTray() {
  if (!tray || tray.isDestroyed()) return;
  const built = buildTrayMenu();
  tray.setContextMenu(built);
  if (IS_MAC && currentSettings.showInDock) {
    app.dock?.setMenu?.(built);
  }
}

function createTray() {
  let icon = nativeImage.createFromPath(LOGO_PATH);
  if (!icon.isEmpty()) {
    const dim = IS_MAC ? 18 : 16;
    icon = icon.resize({ width: dim, height: dim, quality: 'best' });
  }
  tray = new Tray(icon);
  tray.setToolTip('哈基米桌宠 · Hagemi Pet Desktop');
  refreshTray();
  if (IS_WIN) {
    tray.on('click', () => {
      tray.popUpContextMenu(buildTrayMenu());
    });
  }
}

function connectStateStream() {
  if (!bridgeUrl || quitting) return;
  try {
    const u = new URL('/events', bridgeUrl);
    sseReq = http.get({ hostname: u.hostname, port: u.port, path: u.pathname }, res => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of block.split(/\r?\n/)) {
            if (!line.startsWith('data: ')) continue;
            try {
              const msg = JSON.parse(line.slice(6));
              if ((msg.t === 'hello' || msg.t === 'settings') && msg.settings) {
                currentSettings = {
                  ...currentSettings,
                  ...msg.settings,
                  notifications: { ...currentSettings.notifications, ...msg.settings.notifications },
                  sound: { ...currentSettings.sound, ...msg.settings.sound },
                };
                applyWindowState();
                refreshTray();
              } else if (msg.t === 'notify') {
                showNativeNotification(msg);
              } else if (msg.t === 'capture_screen' && msg.requestId) {
                captureActiveScreenJpeg(msg.requestId);
              } else if (msg.t === 'backup_export_dialog' && msg.payload) {
                handleBackupExportDialog(msg.payload);
              } else if (msg.t === 'backup_import_dialog') {
                handleBackupImportDialog();
              } else if (msg.t === 'bye') {
                quitting = true;
                app.quit();
              }
            } catch {}
          }
        }
      });
      res.on('end', () => {
        if (!quitting) setTimeout(connectStateStream, 1500);
      });
    });
    sseReq.on('error', () => {
      if (!quitting) setTimeout(connectStateStream, 1500);
    });
  } catch {}
}

function createOverlayWindow() {
  const { x, y, width, height } = currentDisplay().workArea;
  win = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    show: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.setIgnoreMouseEvents(true, { forward: true });
  win.setAlwaysOnTop(true, 'screen-saver', 1);
  if (IS_MAC) {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (typeof win.setHiddenInMissionControl === 'function') {
      win.setHiddenInMissionControl(true);
    }
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  win.loadURL(bridgeUrl);
  win.once('ready-to-show', () => {
    applyWindowState();
  });
  win.webContents.on('did-finish-load', () => {
    applyWindowState();
  });
  win.on('closed', () => {
    win = null;
  });
}

function startOwnedSidecar() {
  return new Promise((resolve, reject) => {
    const entry = path.join(ROOT, 'sidecars', 'pet', 'main.mjs');
    sidecarChild = spawn(process.execPath, [entry, '--electron-host'], {
      cwd: ROOT,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) reject(new Error('Timed out waiting for Hagemi backend bridge'));
    }, 15000);
    sidecarChild.stdout.setEncoding('utf8');
    sidecarChild.stdout.on('data', chunk => {
      process.stdout.write(chunk);
      const match = chunk.match(/HAGEMI_BRIDGE_URL=(http:\/\/127\.0\.0\.1:\d+)/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    sidecarChild.stderr.setEncoding('utf8');
    sidecarChild.stderr.on('data', chunk => process.stderr.write(chunk));
    sidecarChild.on('exit', () => {
      if (!resolved) {
        clearTimeout(timer);
        reject(new Error('Hagemi backend exited before bridge was ready'));
      } else if (!quitting) {
        quitting = true;
        app.quit();
      }
    });
  });
}

ipcMain.on('hagemi:interactive', (_event, interactive) => {
  if (!win || win.isDestroyed()) return;
  if (currentSettings.ghostMode) {
    win.setIgnoreMouseEvents(true, { forward: true });
    return;
  }
  if (interactive) {
    win.setIgnoreMouseEvents(false);
  } else {
    win.setIgnoreMouseEvents(true, { forward: true });
  }
});

ipcMain.on('hagemi:modal', (_event, open) => {
  if (!win || win.isDestroyed()) return;
  if (currentSettings.ghostMode) {
    win.setFocusable(false);
    return;
  }
  if (open) {
    win.setFocusable(true);
    win.focus();
  } else {
    win.blur();
    win.setFocusable(false);
  }
});

ipcMain.on('hagemi:open-sound-dir', openSoundFolder);
ipcMain.on('hagemi:center-cursor', centerOnCursorDisplay);
ipcMain.on('hagemi:next-display', moveToNextDisplay);
ipcMain.on('hagemi:focus-app', focusAntigravityWindow);
ipcMain.on('hagemi:edge-check', (_event, sx, sy) => handleEdgeCheck(sx, sy));

app.on('second-instance', () => {
  centerOnCursorDisplay();
});

app.whenReady().then(async () => {
  try {
    if (IS_MAC) applyMacDockPolicy();
    if (!bridgeUrl) bridgeUrl = await startOwnedSidecar();
    createTray();
    createOverlayWindow();
    connectStateStream();
    try {
      globalShortcut.register(GLOBAL_TOGGLE_SHORTCUT, () => {
        const hidden = isPetHidden();
        postMessage({ type: 'settings', patch: { hidden: !hidden, hiddenUntil: 0 } });
      });
    } catch {}
    for (const ev of ['display-metrics-changed', 'display-added', 'display-removed']) {
      screen.on(ev, () => {
        fitWindowToActiveDisplay();
        refreshTray();
      });
    }
  } catch (error) {
    console.error('[hagemi-desktop] startup failed:', error.message);
    app.quit();
  }
});

app.on('window-all-closed', event => {
  if (!quitting) event.preventDefault();
});

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch {}
});

app.on('before-quit', () => {
  quitting = true;
  try { sseReq?.destroy(); } catch {}
  if (sidecarChild && !sidecarChild.killed) {
    try { sidecarChild.kill(); } catch {}
  }
});
