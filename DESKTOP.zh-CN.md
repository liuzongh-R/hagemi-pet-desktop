# 哈基米桌宠 · 桌面增强版（Hagemi Pet Desktop）

基于 [KCFindstr/hagemi-pet-agy](https://github.com/KCFindstr/hagemi-pet-agy) 底层二次开发，融合中文社区经典的 **Gemini「哈基喵」** 默认人设，并参考 [nanonocturne-altago/DeepSeek-Pet](https://github.com/nanonocturne-altago/DeepSeek-Pet) 的桌面交互与音效设计，打造跨平台 **Windows & macOS 桌面全局悬浮桌宠 + Antigravity 双模式插件**。

## 核心亮点

1. **开箱即用的「Gemini 哈基喵」默认人设**（可随时在设置中自由修改或一键恢复默认）
   - 星夜蓝紫长发、粉金异色猫瞳的赛博猫娘，高智商学霸卷王 × 活人感傲娇电子宠物，平时软萌贴贴，被压榨时会炸毛“哈气”，给小鱼干/摸头一秒哄好，最恨被叫「北美大豆包」。
2. **Electron 透明置顶桌面悬浮壳（Windows & macOS 全适配）**
   - 像素级点击穿透、多显示器跨屏拖放与「归中找回（当前鼠标所在屏）」、前台置顶（盖过全屏）、幽灵穿透专注模式、全局显隐快捷键（`Ctrl+Shift+H` / `Cmd+Shift+H`）、整体透明度调节（50%–100%）、随系统开机自启。
   - macOS 专项适配：`accessory/regular` 程序坞图标开关、全工作区覆盖、调度中心隐藏、菜单栏 18×18 图标、屏幕录制权限友好检测。
3. **Apple iOS 26/27 风格「✨ 液态玻璃」独立个性化主题 + 弹出二级菜单**
   - 四档外观主题：跟随系统（浅色 / 暗夜）、浅色简约、暗夜深色，以及独立的 **✨ 液态玻璃（Apple 风格）**。
   - 右键菜单采用流畅弹簧弹出动画 + 三组横向弹出二级菜单。
4. **💬 聊一聊（多模型通道 + 独立 API）**
   - 右键或托盘点「💬 聊一聊」即可在哈基米身旁打字对话（短期 6 轮记忆），回复直接显示在头顶经典气泡中。
   - 输入框旁自带 `⚙️` 小齿轮一键跳转到设置页，支持 **Antigravity 内置模型（免 Key）**、**独立 Gemini API（`@google/genai`）**、**自定义 OpenAI 兼容 API**。
5. **👀 看屏幕碎碎念（双通道 + 隐私护栏）**
   - 免 Key 时自动读前台窗口标题结合 Antigravity 额度吐槽；填入 Gemini API Key 自动升级为内存截屏 + `@google/genai` 多模态视觉吐槽（`store: false`、截图零落盘）。
   - 自动跳过密码管理器、网银支付、无痕窗口与自定义屏蔽词。
6. **点按查额度小鱼干徽章 + 近 7 天趋势账本 + 按压音效 + 备份迁移**
   - 点按 `🐟 XX%` 徽章即时刷新剩余额度与重置倒计时，支持展开近 7 天用量趋势柱状图、配置与 30 天账本一键导出/导入备份。
   - 内置「软萌气泡」「清脆按键」Web Audio 音效，支持往 `sound/` 目录放入成对 `名称1.mp3` + `名称2.mp3` 自定义音效。
   - 趣味互动：一键「🐟 投喂小鱼干」、可选 25/45/60/90 分钟喝水伸懒腰提醒、空闲桌面漫游开关、Windows/macOS 原生系统通知。

## 一键安装

- **Windows 独立桌面一键安装程序**：双击 `release/Hagemi-Pet-Desktop-Windows-Setup-0.2.0.exe`
- **Windows Antigravity 插件一键安装**：解压 `release/Hagemi-Pet-Desktop-Windows-Plugin-v0.2.0.zip`，双击 `双击一键安装.bat`
- **macOS 一键安装**：解压 `release/Hagemi-Pet-Desktop-macOS-OneClick-v0.2.0.zip`，双击 `双击一键安装.command`（Apple Silicon 与 Intel 通用）
- 如需构建原生 macOS `.dmg`，在 macOS 上运行 `npm run dist:mac`，或推送 Git Tag `v*` 触发 `.github/workflows/release.yml` 自动云端打包。

## 致谢与许可

- 底层插件框架与动作引擎：[KCFindstr/hagemi-pet-agy](https://github.com/KCFindstr/hagemi-pet-agy)（代码 MIT，美术 CC BY-NC-SA 4.0）
- 角色美术来源：[lokicorvus/crosspet](https://github.com/lokicorvus/crosspet)（代码 MIT，美术 CC BY-NC-SA 4.0）
- 桌面悬浮、系统托盘归中、自定义成对音效与记账思路参考：[nanonocturne-altago/DeepSeek-Pet](https://github.com/nanonocturne-altago/DeepSeek-Pet)
