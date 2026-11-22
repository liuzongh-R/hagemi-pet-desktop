#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)/bin:$PATH"

echo "============================================================"
echo "  哈基米桌宠 · Hagemi Pet Desktop (macOS 一键安装程序)"
echo "============================================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 Node.js！"
  echo "请先安装 Node.js 22 或更高版本："
  echo "  方式一（Homebrew）：brew install node@22"
  echo "  方式二（官网下载）：https://nodejs.org"
  echo ""
  read -r -p "按回车键退出..."
  exit 1
fi

NODE_BIN="$(command -v node)"
NODE_MAJOR=$("$NODE_BIN" -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "[错误] 当前 Node.js 版本为 v${NODE_MAJOR}，本插件需要 Node.js 22 或更高版本。"
  echo "请升级 Node.js 后重试（brew install node 或 https://nodejs.org）。"
  echo ""
  read -r -p "按回车键退出..."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/payload"
if [ ! -f "$SRC/plugin.json" ]; then
  SRC="$SCRIPT_DIR"
fi

TARGET="$HOME/.gemini/config/plugins/hagemi-pet-desktop"
mkdir -p "$HOME/.gemini/config/plugins"

# 如果之前装过原版 hagemi-pet-agy，提醒或避免冲突
pkill -f "hagemi-pet-desktop" 2>/dev/null || true

echo "[1/4] 正在安装到 Antigravity 插件目录："
echo "      $TARGET"
rm -rf "$TARGET"
mkdir -p "$TARGET"

for f in plugin.json package.json LICENSE NOTICE.md README.md README.zh-CN.md DESKTOP.zh-CN.md; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" "$TARGET/"
done
for d in assets electron sidecars sound; do
  [ -d "$SRC/$d" ] && cp -R "$SRC/$d" "$TARGET/"
done

# 写入当前 macOS 上的 Node 绝对路径到 sidecar.json，防止 Antigravity 从 Dock 启动时找不到 Homebrew/NVM 的 node
"$NODE_BIN" -e '
const fs = require("fs");
const p = process.argv[1];
const nodeBin = process.argv[2];
const j = JSON.parse(fs.readFileSync(p, "utf8"));
j.command = nodeBin;
fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
' "$TARGET/sidecars/pet/sidecar.json" "$NODE_BIN"

echo "[2/4] 正在安装 npm 依赖包..."
if ! (cd "$TARGET" && npm install --omit=dev --no-audit --no-fund); then
  echo "  -> 默认源较慢或受限，正在自动切换国内镜像源重试..."
  (cd "$TARGET" && npm install --omit=dev --no-audit --no-fund --registry=https://registry.npmmirror.com)
fi

echo "[3/4] 正在下载并验证 macOS 原生 Electron 桌面悬浮内核（首次约需 15~45 秒）..."
if ! (cd "$TARGET" && "$NODE_BIN" -e '
const fs = require("fs");
const p = require("electron");
if (!p || !fs.existsSync(p)) process.exit(1);
console.log("  -> Electron 就绪:", p);
'); then
  echo "  -> 正在使用国内高速镜像下载 Electron.app..."
  (cd "$TARGET" && ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" "$NODE_BIN" node_modules/electron/install.js)
  (cd "$TARGET" && "$NODE_BIN" -e '
const fs = require("fs");
const p = require("electron");
if (!p || !fs.existsSync(p)) { console.error("Electron 下载未完成"); process.exit(1); }
console.log("  -> Electron 就绪:", p);
')
fi

# 清除 macOS Gatekeeper 隔离属性，确保 Electron.app 不会被系统静默拦截
xattr -cr "$TARGET" 2>/dev/null || true

echo "[4/4] 正在启动哈基米 macOS 桌面悬浮层..."
# 重启已运行的边车进程，让 Antigravity 用刚装好的 Electron.app 重新拉起桌面悬浮层
pkill -f "hagemi-pet-desktop" 2>/dev/null || true
sleep 3
if ! pgrep -f "hagemi-pet-desktop" >/dev/null 2>&1; then
  (cd "$TARGET" && nohup "$NODE_BIN" "$TARGET/sidecars/pet/main.mjs" >/tmp/hagemi-pet-desktop.log 2>&1 &)
  sleep 2
fi

echo ""
echo "============================================================"
echo "  安装并启动成功！哈基米现在应该已经出现在你的 macOS 桌面上啦！"
echo "  - 菜单栏右上角会出现哈基米小图标"
echo "  - 如之前还开着旧版 Hagemi Pet（窗口内那只），请在 Antigravity 插件页关掉旧版"
echo "  - 右键点哈基米：聊一聊 / 瞄一眼屏幕 / ✨ 液态玻璃主题 / 全部设置"
echo "  - 全局显隐快捷键：Cmd+Shift+H"
echo "  - 如需使用「真·看屏幕画面」，请在：系统设置 -> 隐私与安全性 -> 屏幕录制 中允许"
echo "============================================================"
echo ""
read -r -p "按回车键关闭窗口..."
