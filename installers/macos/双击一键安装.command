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

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
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

echo "[1/3] 正在安装到 Antigravity 插件目录："
echo "      $TARGET"
rm -rf "$TARGET"
mkdir -p "$TARGET"

for f in plugin.json package.json LICENSE NOTICE.md README.md README.zh-CN.md DESKTOP.zh-CN.md; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" "$TARGET/"
done
for d in assets electron sidecars sound; do
  [ -d "$SRC/$d" ] && cp -R "$SRC/$d" "$TARGET/"
done

echo "[2/3] 正在安装 macOS 原生架构桌面依赖（首次可能需要 15~40 秒）..."
(cd "$TARGET" && npm install --omit=dev --no-audit --no-fund)

echo "[3/3] 安装完成！"
echo ""
echo "============================================================"
echo "  安装成功！哈基米将在约 15~30 秒内悬浮在你的 macOS 桌面上。"
echo "  - 如之前装过原版 Hagemi Pet，请在 Antigravity 插件页关闭原版"
echo "  - 菜单栏右上角会出现哈基米图标，右键桌宠可聊一聊 / 切液态玻璃"
echo "  - 全局显隐快捷键：Cmd+Shift+H"
echo "  - 如需使用「真·看屏幕画面」，请在：系统设置 -> 隐私与安全性 -> 屏幕录制 中允许"
echo "  - 如需独立启动桌面版：cd \"$TARGET\" && npm start"
echo "============================================================"
echo ""
read -r -p "按回车键关闭窗口..."
