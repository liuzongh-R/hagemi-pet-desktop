@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

title 哈基米桌宠 (Hagemi Pet Desktop) - Windows 一键安装
echo ============================================================
echo   哈基米桌宠 · Hagemi Pet Desktop (Windows 一键安装程序)
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js！
  echo 请先前往 https://nodejs.org 安装 Node.js 22 或更高版本，再重新双击本安装程序。
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if !NODE_MAJOR! LSS 22 (
  echo [错误] 当前 Node.js 主版本为 v!NODE_MAJOR!，本插件需要 Node.js 22 或更高版本。
  echo 请升级 Node.js 后重试：https://nodejs.org
  echo.
  pause
  exit /b 1
)

set "SRC=%~dp0payload"
if not exist "%SRC%\plugin.json" set "SRC=%~dp0"
set "TARGET=%USERPROFILE%\.gemini\config\plugins\hagemi-pet-desktop"

echo [1/4] 正在安装到 Antigravity 插件目录：
echo       %TARGET%
if not exist "%USERPROFILE%\.gemini\config\plugins" mkdir "%USERPROFILE%\.gemini\config\plugins"
if exist "%TARGET%" (
  echo       检测到旧版本，正在更新文件（保留你的设置与 30 天账本）...
  rmdir /s /q "%TARGET%" >nul 2>nul
)
mkdir "%TARGET%"

for %%I in (plugin.json package.json LICENSE NOTICE.md README.md README.zh-CN.md DESKTOP.zh-CN.md) do (
  if exist "%SRC%\%%I" copy /y "%SRC%\%%I" "%TARGET%\" >nul
)
for %%D in (assets electron sidecars sound) do (
  if exist "%SRC%\%%D" xcopy /e /i /y /q "%SRC%\%%D" "%TARGET%\%%D\" >nul
)

echo [2/4] 正在安装 npm 依赖包...
pushd "%TARGET%"
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 (
  echo   -^> 正在自动切换国内镜像源重试...
  call npm install --omit=dev --no-audit --no-fund --registry=https://registry.npmmirror.com
  if errorlevel 1 (
    echo.
    echo [警告] 依赖安装遇到网络问题，请检查网络后重试。
    popd
    pause
    exit /b 1
  )
)

echo [3/4] 正在下载并验证 Electron 桌面悬浮内核（首次约需 15~45 秒）...
node -e "const fs=require('fs'),p=require('electron');if(!p||!fs.existsSync(p)){process.exit(1)}console.log('  -> Electron 就绪:',p);"
if errorlevel 1 (
  echo   -^> 正在使用国内高速镜像下载 Electron...
  set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
  node node_modules\electron\install.js
  node -e "const fs=require('fs'),p=require('electron');if(!p||!fs.existsSync(p)){process.exit(1)}console.log('  -> Electron 就绪:',p);"
  if errorlevel 1 (
    echo.
    echo [警告] Electron 二进制下载未完成，请检查网络或代理后重试。
    popd
    pause
    exit /b 1
  )
)
popd

echo [4/4] 安装完成！
echo.
echo ============================================================
echo   安装成功！哈基米将在约 15~30 秒内悬浮在你的 Windows 桌面上。
echo   - 如之前装过原版 Hagemi Pet，请在 Antigravity 插件页关闭原版
echo   - 右键点哈基米：聊一聊 / 瞄一眼屏幕 / 液态玻璃主题 / 全部设置
echo   - 全局显隐快捷键：Ctrl+Shift+H
echo ============================================================
echo.
pause
