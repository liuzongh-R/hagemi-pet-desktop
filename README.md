<div align="center">

<img src="assets/logo.png" width="116" alt="Hagemi Pet Desktop">

# Hagemi Pet Desktop (Gemini 哈基喵)

A chibi Gemini cyber-catgirl desktop companion that floats **globally on Windows & macOS** (plus Antigravity in-app mode) — watching your agents, tracking quota, chatting with you, and playfully peeking at your screen.

**English** · [简体中文](README.zh-CN.md)

<img src="docs/media/hello.webp" width="288" alt="Hagemi saying hello">

</div>

---

## ✨ Highlights

- **Global Transparent Always-on-Top Desktop Overlay (Windows & macOS)** — Pixel-accurate click-through, multi-monitor drag handoff & cursor-screen recentering, Ghost Focus mode (full click-through), opacity slider (50%–100%), global hide/show hotkey (`Ctrl/Cmd+Shift+H`), and Launch at Login.
- **Built-in "Gemini 哈基喵 (Hagemi-nyan)" Default Persona** — Ships out of the box with the community-loved cyber catgirl personality (editable anytime in Settings with one-click reset).
- **Apple Liquid Glass Theme + Spring Pop-Out Submenus** — Four themes: Follow System (Light/Dark), Light Frosted, Dark Smoked, and standalone **✨ Liquid Glass (Apple style)**.
- **💬 Chat with Hagemi** — Right-click to open a floating chat bar with 6-turn short memory; replies appear in her classic speech bubble. Includes a quick `⚙️` button next to the input supporting **Antigravity built-in models (no key)**, **Gemini API (`@google/genai`)**, or **any OpenAI-compatible API**.
- **👀 Privacy-First Screen Peek** — Works zero-key via foreground window titles, or upgrades automatically to in-memory screenshots with `@google/genai` (`store: false`, never saved to disk). Automatically skips password managers, banking, incognito, and custom blocked keywords.
- **🐟 Click-to-Check Quota Fish Badge & 7-Day Trend Ledger** — Click the `🐟 XX%` pill beside her to refresh live quota immediately, expand a 7-day usage bar chart, and export/import full settings & 30-day ledger backups.
- **🔊 Paired Custom Sound Effects** — Built-in Web Audio packs plus `sound/` folder scanning (`<name>1.mp3` press + `<name>2.mp3` release).
- **🍎 macOS Optimizations** — Dock visibility policy (`accessory`/`regular`), Mission Control hiding, all-workspace overlay, menu bar tray icon, and Screen Recording permission check.

---

## 📦 One-Click Install

Download from **Releases**:

- **Windows Standalone Installer**: `Hagemi-Pet-Desktop-Windows-Setup-x.x.x.exe`
- **Windows Antigravity Plugin**: unzip `Hagemi-Pet-Desktop-Windows-Plugin-vx.x.x.zip` and double-click `双击一键安装.bat` (Node.js 22+)
- **macOS One-Click Installer (Apple Silicon & Intel)**: unzip `Hagemi-Pet-Desktop-macOS-OneClick-vx.x.x.zip` and double-click `双击一键安装.command` (Node.js 22+)

---

## 🛠️ Development

```bash
npm install
npm start          # Launch standalone desktop overlay
npm run preview    # Browser rehearsal stage
npm test           # Run all 110 unit tests
npm run dist:bundles
npm run dist:win
```

---

## 🙏 Credits & Licenses

- Upstream plugin & WebGL rig: [KCFindstr/hagemi-pet-agy](https://github.com/KCFindstr/hagemi-pet-agy) (MIT code / CC BY-NC-SA 4.0 art adaptations)
- Character artwork: [lokicorvus/crosspet](https://github.com/lokicorvus/crosspet) (MIT code / CC BY-NC-SA 4.0 art)
- Desktop UX, paired sound naming, and ledger inspiration: [nanonocturne-altago/DeepSeek-Pet](https://github.com/nanonocturne-altago/DeepSeek-Pet)

**Code**: [MIT](LICENSE) · **Character art**: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) (see [NOTICE.md](NOTICE.md)). Unofficial fan project.
