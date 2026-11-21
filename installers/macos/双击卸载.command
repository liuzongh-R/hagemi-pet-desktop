#!/usr/bin/env bash
set -euo pipefail

echo "============================================================"
echo "  哈基米桌宠 · Hagemi Pet Desktop (macOS 卸载程序)"
echo "============================================================"
echo ""

TARGET="$HOME/.gemini/config/plugins/hagemi-pet-desktop"
if [ ! -d "$TARGET" ]; then
  echo "未在插件目录找到 hagemi-pet-desktop，无需卸载。"
  read -r -p "按回车键退出..."
  exit 0
fi

echo "正在移除插件目录：$TARGET"
echo "（你的个人设置与 30 天小鱼干账本仍保留在 ~/.gemini/antigravity/sidecar_data/hagemi-pet-desktop）"
rm -rf "$TARGET"

echo ""
echo "卸载完成！哈基米将在几秒内向你挥手告别~"
echo ""
read -r -p "按回车键关闭窗口..."
