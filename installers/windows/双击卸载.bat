@echo off
chcp 65001 >nul
setlocal

title 哈基米桌宠 (Hagemi Pet Desktop) - Windows 卸载
echo ============================================================
echo   哈基米桌宠 · Hagemi Pet Desktop (Windows 卸载程序)
echo ============================================================
echo.

set "TARGET=%USERPROFILE%\.gemini\config\plugins\hagemi-pet-desktop"
if not exist "%TARGET%" (
  echo 未在插件目录找到 hagemi-pet-desktop，无需卸载。
  pause
  exit /b 0
)

echo 正在移除插件目录：%TARGET%
echo （你的个人设置与 30 天小鱼干账本仍保留在 %USERPROFILE%\.gemini\antigravity\sidecar_data\hagemi-pet-desktop）
rmdir /s /q "%TARGET%" >nul 2>nul

if exist "%TARGET%" (
  echo.
  echo [提示] 有文件正被占用，请先右键右下角托盘图标退出哈基米桌宠，然后重新双击本卸载脚本。
) else (
  echo.
  echo 卸载完成！哈基米将在几秒内向你挥手告别~
)
echo.
pause
