<div align="center">

<img src="assets/logo.png" width="116" alt="哈基喵桌宠">

# 哈基米桌宠 · 桌面增强版（Hagemi Pet Desktop）

一只真正能**脱离窗口、悬浮在 Windows & macOS 系统桌面**上的 Q 版 Gemini 赛博猫娘「哈基喵」——陪你写代码、盯额度、聊聊天，还能偷偷瞄一眼屏幕跟你碎碎念。

[English](README.md) · **简体中文**

<img src="docs/media/zhs/hello.webp" width="288" alt="哈基喵打招呼">

</div>

---

## ✨ 为什么做这个桌面增强版？

原版 [KCFindstr/hagemi-pet-agy](https://github.com/KCFindstr/hagemi-pet-agy) 非常精致，但默认只能显示在 Antigravity 应用窗口内部，切出窗口或最小化就看不到了。

**Hagemi Pet Desktop** 以它为底层，保留了全部 WebGL 骨骼动画、智能体监控与额度联动，并全面进化为 **跨平台桌面悬浮伴侣 + Antigravity 双模式插件**：

| 核心能力 | 亮点说明 |
| --- | --- |
| **🖥️ 全局透明置顶桌面悬浮** | Electron 透明无边框全工作区窗口 + 像素级点击穿透；支持 **桌面全局悬浮 / 仅 Antigravity 窗口内 / 双端显示** 一键切换，最小化 Antigravity 也能继续实时陪伴 |
| **🐱 开箱即用「Gemini 哈基喵」默认人设** | 融入中文社区经典设定（学霸卷王 × 活人感傲娇猫娘、顺毛哈特软软、被压榨炸毛“哈气”、怕更新魂穿、最恨被叫北美大豆包），下载即享完整人设，也可在设置里自由编辑或一键还原 |
| **✨ Apple 风格液态玻璃主题 + 二级弹出菜单** | 四档外观主题：跟随系统（浅色 / 暗夜）、浅色简约、暗夜深色，以及独立的 **✨ 液态玻璃（Apple Liquid Glass）**；右键采用弹簧动画 + 三组弹出二级菜单 |
| **💬 聊一聊（多模型通道 + 独立 API）** | 右键点「💬 聊一聊」在哈基米身旁直接打字对话（支持 6 轮记忆），回复直接呈现在头顶气泡；旁附 `⚙️` 小齿轮直达设置，支持 **Antigravity 内置模型（免 Key）**、**独立 Gemini API（`@google/genai`）**、**自定义 OpenAI 兼容 API** |
| **👀 看屏幕碎碎念（双通道 + 强隐私保护）** | 免 Key 自动读前台窗口标题吐槽；填入 Gemini API Key 自动解锁内存截屏 + 多模态视觉看屏（零落盘、`store: false`）；自动跳过密码管理器、网银支付、无痕窗口与自定义屏蔽词 |
| **🐟 点按小鱼干徽章即时查额度 + 7 天趋势账本** | 宠物旁自带可点击 `🐟 XX%` 徽章，点一下立刻刷新实时额度与重置倒计时，展开可看 **近 7 天用量趋势柱状图**，并支持 **配置与 30 天账本一键导出/导入备份** |
| **🔊 按压/松手互动音效 + 自定义 `sound/`** | 内置「软萌气泡」「清脆按键」Web Audio 音效；往 `sound/` 放成对 `名称1.mp3`（按下）+ `名称2.mp3`（松手）自动扫描生效，带音量滑块 |
| **🎯 多屏 / 专注 / 提醒 / macOS 全适配** | 多显示器跨屏拖放与「归中找回（当前鼠标屏）」、👻 幽灵穿透专注模式、全局快捷键 `Ctrl/Cmd+Shift+H`、透明度滑块、🐟 投喂小鱼干、喝水伸懒腰提醒、空闲桌面漫游开关、Windows/macOS 原生通知与开机自启 |

---

## 📦 一键安装（推荐）

前往本仓库的 **Releases** 页面下载对应系统的安装包：

### Windows
- **独立桌面版（推荐快速体验）**：下载 `Hagemi-Pet-Desktop-Windows-Setup-x.x.x.exe`，双击一键安装，自动生成桌面与开始菜单快捷方式。
- **Antigravity 插件版（推荐联动实时账号额度与智能体）**：下载 `Hagemi-Pet-Desktop-Windows-Plugin-vx.x.x.zip`，解压后双击 **`双击一键安装.bat`**（需本机已装 Node.js 22+）。

### macOS（Apple Silicon M 系列 & Intel 通用）
- **一键插件安装版**：下载 `Hagemi-Pet-Desktop-macOS-OneClick-vx.x.x.zip`，解压后双击 **`双击一键安装.command`**（首次若提示未验证开发者，右键 → 打开 → 仍要打开）。
- **原生桌面安装包**：如 Releases 已附带 `Hagemi-Pet-Desktop-macOS-x.x.x-arm64.dmg` / `x64.dmg`，直接拖入「应用程序」即可。

> **提示**：如之前安装过原版 `Hagemi Pet`（`hagemi-pet-agy`），建议在 Antigravity 插件管理中将其关闭，避免屏幕上出现两只哈基米。

---

## ⌨️ 常用操作与快捷键

- **左键点头 / 来回揉头**：摸摸头（会呼噜冒爱心）
- **左键点身体**：戳戳她（连戳会生气炸毛甚至生闷气，摸头可哄好）
- **左键按住拖动**：自由拖动、扔出去反弹、拖到左右边缘贴边探头、拖过屏幕边缘自动跨屏
- **左键双击**：让她现编一句吐槽
- **点 `🐟 XX%` 小鱼干徽章**：立即刷新剩余额度，展开实时状态与近 7 天趋势图
- **右键点哈基米**：打开液态玻璃二级菜单（聊一聊 / 瞄一眼屏幕 / 投喂小鱼干 / 主题 / 音效 / 设置）
- **全局显隐快捷键**：Windows `Ctrl+Shift+H` / macOS `Cmd+Shift+H`
- **系统托盘 / macOS 菜单栏**：随时归中找回、开关幽灵穿透、切换显示模式、打开音效目录或退出

---

## 🔊 自定义音效规则

在右键菜单或设置里点击「打开音效目录」，往 `sound/` 放入成对文件（支持 `.mp3` / `.wav` / `.ogg` / `.m4a`，支持中文名）：

```text
小熊猫11.mp3   # 末尾为 1 -> 按下 / 点击声
小熊猫12.mp3   # 末尾为 2 -> 松手声
```

放入后打开右键菜单或设置面板会自动重新扫描识别。

---

## 🔒 隐私说明

- **看屏幕碎碎念**默认仅手动触发（定时自动瞄屏默认关闭）；
- 截图**仅保存在内存中**，绝不写入本地磁盘，且调用 Gemini API 时强制设置 `store: false`（服务端不留存）；
- 自动跳过包含密码管理器、网银、支付、无痕浏览、`.env` 等关键词的前台窗口，且支持在设置里添加自定义回避词。

---

## 🛠️ 本地开发与构建

需要 **Node.js >= 22**：

```bash
# 安装依赖
npm install

# 独立启动桌面悬浮版
npm start

# 浏览器排练舞台调试（无需 Antigravity）
npm run preview

# 运行全部单元测试（110 项）
npm test

# 构建 Windows / macOS 一键插件包
npm run dist:bundles

# 构建 Windows NSIS 一键安装程序 (.exe)
npm run dist:win
```

---

## 🙏 致谢与开源许可

本项目建立在以下优秀开源项目与社区创作之上，致以诚挚感谢：

- **底层框架与原版插件**：[KCFindstr/hagemi-pet-agy](https://github.com/KCFindstr/hagemi-pet-agy)（代码 MIT，美术 CC BY-NC-SA 4.0）
- **角色美术来源**：[lokicorvus/crosspet](https://github.com/lokicorvus/crosspet)（代码 MIT，美术 CC BY-NC-SA 4.0）及社区画师 [ZipZipPipe](https://www.bilibili.com/opus/1233069202138464289)
- **桌面壳交互、成对自定义音效与记账灵感**：[nanonocturne-altago/DeepSeek-Pet](https://github.com/nanonocturne-altago/DeepSeek-Pet)

### 许可说明
- **源代码**：[MIT License](LICENSE)
- **角色美术资源**（`sidecars/pet/art/`、`assets/`、`docs/poses.webp`）：[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)（非商业使用、相同方式共享，详见 [NOTICE.md](NOTICE.md)）
- 本项目为非官方同人开源项目，与 Google、Anthropic、OpenAI、DeepSeek 无关。
