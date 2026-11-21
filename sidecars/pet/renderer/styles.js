HAGEMI.css = `
:host { all: initial; }
.stage { position: fixed; left: 0; top: 0; pointer-events: none; will-change: transform; }
.layer { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.hit { position: absolute; pointer-events: auto; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }
.hit:active { cursor: grabbing; }

/* ---- Quick Quota Fish Pill (Dark Smoked Liquid Glass) ---- */
.quota-btn {
  position: fixed; left: 0; top: 0; z-index: 4;
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px 4px 8px; border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: linear-gradient(145deg, rgba(44, 32, 78, 0.84), rgba(24, 17, 48, 0.80));
  color: #f7f3ff;
  font: 600 11.5px/1.2 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.30), inset 0 -1px 0 rgba(0, 0, 0, 0.25), 0 6px 18px rgba(14, 8, 36, 0.34);
  backdrop-filter: blur(18px) saturate(180%);
  -webkit-backdrop-filter: blur(18px) saturate(180%);
  pointer-events: auto; cursor: pointer;
  opacity: 0.84;
  transition: opacity 0.18s ease, background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}
.quota-btn:hover, .quota-btn.active {
  opacity: 1;
  background: linear-gradient(145deg, rgba(64, 46, 114, 0.92), rgba(34, 24, 68, 0.88));
  border-color: rgba(216, 198, 255, 0.65);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42), 0 8px 22px rgba(24, 12, 62, 0.42);
}
.quota-btn[data-tone="warn"] { border-color: rgba(251, 146, 60, 0.72); color: #ffedd5; }
.quota-btn[data-tone="bad"] { border-color: rgba(244, 63, 94, 0.82); color: #ffe4e6; }
.quota-btn.hidden { opacity: 0; pointer-events: none; visibility: hidden; }
.quota-btn .fish-ico { font-size: 12px; line-height: 1; }
.quota-btn.spinning .fish-ico { display: inline-block; animation: hagemi-spin 0.65s linear infinite; }
@keyframes hagemi-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* ---- Speech Bubble (Light Liquid Glass) ---- */
.bubble {
  position: fixed; left: 0; top: 0; max-width: 256px; min-width: 44px; padding: 10px 14px 11px;
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.92), rgba(247, 243, 255, 0.84));
  color: #241736;
  border: 1.5px solid rgba(196, 181, 253, 0.78);
  border-radius: 17px;
  font: 500 13px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92), 0 10px 30px rgba(34, 18, 82, 0.22);
  backdrop-filter: blur(22px) saturate(185%);
  -webkit-backdrop-filter: blur(22px) saturate(185%);
  pointer-events: auto; cursor: pointer;
  opacity: 0; visibility: hidden; transition: opacity 0.16s ease, visibility 0.16s;
  word-break: break-word; white-space: pre-wrap;
}
.bubble.show { opacity: 1; visibility: visible; }
.bubble::after {
  content: ''; position: absolute; width: 11px; height: 11px; background: rgba(251, 249, 255, 0.92);
  border-right: 1.5px solid rgba(196, 181, 253, 0.78); border-bottom: 1.5px solid rgba(196, 181, 253, 0.78);
  left: var(--tail-x, 50%); bottom: -7px;
  transform: translateX(-50%) rotate(45deg); border-bottom-right-radius: 3px;
}
.bubble[data-side="right"]::after { left: -7px; top: 18px; bottom: auto; transform: rotate(135deg); }
.bubble[data-side="left"]::after { left: auto; right: -7px; top: 18px; bottom: auto; transform: rotate(-45deg); }
.mark { color: #8b5cf6; font-weight: 700; margin-right: 4px; }
.mark:empty { display: none; }

/* ---- Quota HUD Card (Smoked Liquid Glass) ---- */
.hud {
  position: fixed; left: 0; top: 0; min-width: 230px; max-width: 296px; padding: 10px 13px; display: grid; gap: 6px;
  background: linear-gradient(155deg, rgba(35, 26, 66, 0.92) 0%, rgba(22, 16, 44, 0.87) 100%);
  color: #f3eeff;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 16px;
  font: 500 11.5px/1.38 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.26), inset 0 -1px 0 rgba(0, 0, 0, 0.28), 0 16px 40px rgba(10, 4, 28, 0.45);
  backdrop-filter: blur(24px) saturate(185%);
  -webkit-backdrop-filter: blur(24px) saturate(185%);
  pointer-events: none; opacity: 0; visibility: hidden;
  transition: opacity 0.18s ease, visibility 0.18s ease;
}
.hud.show { opacity: 1; visibility: visible; }
.hud.pinned { pointer-events: auto; }
.hud-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding-bottom: 5px; margin-bottom: 1px; border-bottom: 1px solid rgba(255, 255, 255, 0.14);
  font-size: 11.5px; font-weight: 700; color: #e9dfff;
}
.hud-actions { display: inline-flex; align-items: center; gap: 3px; }
.hud-icon-btn {
  border: 0; background: rgba(255, 255, 255, 0.08); color: #e9dfff; font: inherit; font-size: 13px; line-height: 1;
  width: 22px; height: 22px; border-radius: 7px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
  transition: background-color 0.14s ease, transform 0.12s ease;
}
.hud-icon-btn:hover { background: rgba(196, 181, 253, 0.28); color: #fff; }
.hud-icon-btn:active { transform: scale(0.92); }
.hud-sep { height: 1px; margin: 2px 0; background: rgba(255, 255, 255, 0.14); }
.row { display: flex; align-items: center; gap: 7px; white-space: nowrap; }
.label { color: #cbbef4; flex: 0 0 auto; }
.value { margin-left: auto; font-variant-numeric: tabular-nums; }
.meter { flex: 1 1 46px; min-width: 46px; height: 5px; border-radius: 99px; background: rgba(255, 255, 255, 0.16); overflow: hidden; }
.fill { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #fbbf24, #fde68a); transition: width 0.25s ease; }
.fill[data-tone="warn"] { background: linear-gradient(90deg, #fb923c, #fdba74); }
.fill[data-tone="bad"] { background: linear-gradient(90deg, #f43f5e, #fb7185); }

/* ---- 7-Day Trend Mini Chart (shared in HUD & Settings) ---- */
.trend-toggle {
  margin-top: 2px; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 9px;
  background: rgba(255, 255, 255, 0.08); color: #e9dfff; font: inherit; font-size: 11px; font-weight: 600;
  padding: 4px 8px; cursor: pointer; text-align: left; display: flex; align-items: center; justify-content: space-between;
  transition: background-color 0.14s ease;
}
.trend-toggle:hover { background: rgba(196, 181, 253, 0.22); }
.trend-bars {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; align-items: end;
  padding: 8px 4px 2px; height: 68px;
}
.trend-col { display: flex; flex-direction: column; align-items: center; gap: 3px; height: 100%; justify-content: flex-end; }
.trend-bar-track { width: 100%; max-width: 18px; height: 42px; border-radius: 6px; background: rgba(255, 255, 255, 0.10); display: flex; align-items: flex-end; overflow: hidden; }
.trend-bar-fill { width: 100%; border-radius: 6px; background: linear-gradient(180deg, #c4b5fd, #8b5cf6); min-height: 2px; transition: height 0.25s ease; }
.trend-col.today .trend-bar-fill { background: linear-gradient(180deg, #fde68a, #f59e0b); }
.trend-day { font-size: 9.5px; opacity: 0.78; font-variant-numeric: tabular-nums; }
.trend-col.today .trend-day { opacity: 1; font-weight: 700; color: #fde68a; }
.panel .trend-bars { background: rgba(139, 92, 246, 0.06); border: 1px solid rgba(167, 139, 250, 0.22); border-radius: 11px; padding: 8px 6px 5px; margin-top: 6px; }
.panel .trend-bar-track { background: rgba(124, 92, 214, 0.12); }
.panel .trend-day { color: #5b4880; }
.panel .trend-col.today .trend-day { color: #7c3aed; }

/* ---- Apple iOS 26/27 Liquid Glass Context Menu & Pop-out Submenu ---- */
.menu, .submenu {
  position: fixed; left: 0; top: 0; min-width: 198px; padding: 6px;
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.88) 0%, rgba(246, 242, 255, 0.78) 52%, rgba(255, 248, 254, 0.85) 100%);
  color: #1f1433;
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 16px;
  box-shadow:
    inset 0 1.5px 0 rgba(255, 255, 255, 0.94),
    inset 1px 0 0 rgba(255, 255, 255, 0.55),
    inset 0 -1px 1.5px rgba(124, 92, 214, 0.14),
    0 18px 46px rgba(24, 14, 58, 0.22),
    0 4px 14px rgba(24, 14, 58, 0.10);
  backdrop-filter: blur(28px) saturate(195%);
  -webkit-backdrop-filter: blur(28px) saturate(195%);
  font: 500 12.5px/1.3 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  will-change: transform, opacity;
}
.menu {
  z-index: 20;
  transform-origin: var(--menu-ox, 0px) var(--menu-oy, 0px);
  transform: translate3d(var(--menu-x, 0px), var(--menu-y, 0px), 0) scale(0.78) translateY(-6px);
  transition:
    opacity 0.14s cubic-bezier(0.32, 0, 0.67, 0),
    transform 0.15s cubic-bezier(0.32, 0, 0.67, 0),
    visibility 0.15s;
}
.menu.show {
  pointer-events: auto;
  opacity: 1;
  visibility: visible;
  transform: translate3d(var(--menu-x, 0px), var(--menu-y, 0px), 0) scale(1) translateY(0);
  transition:
    opacity 0.19s ease-out,
    transform 0.26s cubic-bezier(0.22, 1.22, 0.36, 1),
    visibility 0.19s;
}
.submenu {
  z-index: 21;
  min-width: 192px;
  transform-origin: var(--sub-ox, 0%) var(--sub-oy, 18%);
  transform: translate3d(var(--sub-x, 0px), var(--sub-y, 0px), 0) translateX(var(--sub-shift, -10px)) scale(0.84);
  transition:
    opacity 0.12s ease-in,
    transform 0.13s ease-in,
    visibility 0.13s;
}
.submenu.show {
  pointer-events: auto;
  opacity: 1;
  visibility: visible;
  transform: translate3d(var(--sub-x, 0px), var(--sub-y, 0px), 0) translateX(0) scale(1);
  transition:
    opacity 0.18s ease-out,
    transform 0.24s cubic-bezier(0.22, 1.24, 0.36, 1),
    visibility 0.18s;
}
.item {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  width: 100%; padding: 7px 10px; border: 0; background: transparent; color: inherit; font: inherit;
  text-align: left; border-radius: 10px; cursor: pointer;
  transition: background-color 0.12s ease, transform 0.1s ease, box-shadow 0.12s ease;
}
.item:hover, .item:focus-visible, .item.active {
  background: rgba(139, 92, 246, 0.14);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
  outline: none;
}
.item:active { transform: scale(0.97); }
.item-main { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.item-check { display: inline-block; width: 13px; text-align: center; color: #7c3aed; font-weight: 700; flex: 0 0 13px; }
.item-arrow { opacity: 0.55; font-size: 14px; line-height: 1; margin-left: auto; }
.divider { height: 1px; margin: 5px 8px; background: linear-gradient(90deg, transparent, rgba(124, 92, 214, 0.20), transparent); }

/* ---- Liquid Glass Settings Panel ---- */
.panel {
  position: fixed; left: 0; top: 0; z-index: 25;
  width: 324px; max-height: min(80vh, 660px); overflow-y: auto; overflow-x: hidden;
  padding: 12px 15px 15px; display: none;
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.92) 0%, rgba(246, 243, 255, 0.86) 55%, rgba(255, 249, 254, 0.90) 100%);
  color: #241736;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 18px;
  box-shadow:
    inset 0 1.5px 0 rgba(255, 255, 255, 0.95),
    inset 0 -1px 1.5px rgba(124, 92, 214, 0.14),
    0 20px 52px rgba(24, 14, 58, 0.28);
  backdrop-filter: blur(28px) saturate(190%);
  -webkit-backdrop-filter: blur(28px) saturate(190%);
  font: 500 12.5px/1.38 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif;
  pointer-events: auto;
}
.panel.show { display: block; animation: hagemi-panel-pop 0.22s cubic-bezier(0.22, 1.18, 0.36, 1); }
@keyframes hagemi-panel-pop {
  from { opacity: 0; filter: blur(4px); }
  to { opacity: 1; filter: blur(0); }
}
.panel::-webkit-scrollbar { width: 6px; }
.panel::-webkit-scrollbar-track { background: transparent; }
.panel::-webkit-scrollbar-thumb { background: rgba(139, 92, 246, 0.26); border-radius: 99px; }
.panel::-webkit-scrollbar-thumb:hover { background: rgba(139, 92, 246, 0.42); }
.panel-head { display: flex; align-items: center; justify-content: space-between; font-size: 14px; margin-bottom: 4px; }
.panel-close { border: 0; background: rgba(139, 92, 246, 0.08); color: inherit; font-size: 17px; line-height: 1; width: 26px; height: 26px; cursor: pointer; border-radius: 99px; display: inline-flex; align-items: center; justify-content: center; transition: background-color 0.12s ease; }
.panel-close:hover { background: rgba(139, 92, 246, 0.2); }
.panel-section { margin: 12px 0 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: #7c5cd6; text-transform: uppercase; }
.field { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 3.5px 0; }
.field > span { flex: 1 1 auto; }
.field select, .field input[type="number"], .field input[type="password"], .field input[type="text"], .field textarea {
  font: inherit; color: inherit; background: rgba(255, 255, 255, 0.78); border: 1px solid rgba(167, 139, 250, 0.42); border-radius: 9px; padding: 4px 7px; max-width: 158px;
}
.field input[type="password"], .field input[type="text"] { width: 150px; }
.field input[type="number"] { width: 72px; }
.field input[type="checkbox"] { accent-color: #8b5cf6; width: 15px; height: 15px; cursor: pointer; }
.field input[type="range"] { accent-color: #8b5cf6; width: 110px; cursor: pointer; }
.field textarea { width: 158px; resize: vertical; }
.range-wrap { display: inline-flex; align-items: center; gap: 6px; }
.range-val { min-width: 34px; text-align: right; font-variant-numeric: tabular-nums; color: #6b5b95; font-size: 11.5px; }
.panel-btn {
  border: 1px solid rgba(167, 139, 250, 0.55); border-radius: 10px; padding: 5px 11px;
  background: rgba(139, 92, 246, 0.12); color: #4c2882; font: inherit; font-weight: 600; cursor: pointer;
  transition: background-color 0.12s ease, transform 0.1s ease;
}
.panel-btn:hover { background: rgba(139, 92, 246, 0.22); }
.panel-btn:active { transform: scale(0.97); }
.panel-btn-row { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
.panel-note { color: #65558c; font-size: 11.5px; }
.panel-note + .panel-note { margin-top: 5px; }
.panel-link { color: #7c3aed; margin-right: 12px; }
.update-card { margin: 10px 0; padding: 10px 11px; border: 1px solid rgba(196, 181, 253, 0.55); border-radius: 13px; background: linear-gradient(135deg, rgba(243, 237, 255, 0.85), rgba(255, 243, 247, 0.82)); }
.update-title { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; }
.update-paw { font-size: 17px; }
.update-version { margin-left: auto; font-size: 10px; color: #786493; }
.update-status { margin: 5px 0 8px; }
.update-reason { margin-bottom: 8px; font-size: 11px; }
.update-button { width: 100%; border: 1px solid #bba0ec; border-radius: 16px; padding: 7px 10px; background: #ede0ff; color: #58308e; font: inherit; font-weight: 700; cursor: pointer; }
.update-button:hover:not(:disabled) { background: #e3cefc; }
.update-button:focus-visible { outline: 2px solid #8b5cf6; outline-offset: 2px; }
.update-button:disabled { cursor: default; opacity: .7; }

/* ---- Dark Liquid Glass Theme (iOS 26/27 Dark Mode) ---- */
:host([data-theme="dark"]) .bubble {
  background: linear-gradient(155deg, rgba(36, 28, 64, 0.92), rgba(24, 18, 46, 0.86));
  color: #f3eeff;
  border-color: rgba(196, 181, 253, 0.42);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 12px 32px rgba(4, 2, 16, 0.46);
}
:host([data-theme="dark"]) .bubble::after {
  background: rgba(30, 23, 55, 0.92);
  border-right-color: rgba(196, 181, 253, 0.42);
  border-bottom-color: rgba(196, 181, 253, 0.42);
}
:host([data-theme="dark"]) .mark { color: #c4b5fd; }

:host([data-theme="dark"]) .menu,
:host([data-theme="dark"]) .submenu {
  background: linear-gradient(155deg, rgba(34, 26, 62, 0.86) 0%, rgba(22, 17, 44, 0.80) 55%, rgba(30, 22, 56, 0.84) 100%);
  color: #f4f0ff;
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    inset 1px 0 0 rgba(255, 255, 255, 0.10),
    inset 0 -1px 1px rgba(0, 0, 0, 0.35),
    0 20px 50px rgba(4, 2, 18, 0.54),
    0 4px 14px rgba(4, 2, 18, 0.28);
}
:host([data-theme="dark"]) .item:hover,
:host([data-theme="dark"]) .item:focus-visible,
:host([data-theme="dark"]) .item.active {
  background: rgba(196, 181, 253, 0.18);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
}
:host([data-theme="dark"]) .item-check { color: #c4b5fd; }
:host([data-theme="dark"]) .divider { background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.16), transparent); }

:host([data-theme="dark"]) .panel {
  background: linear-gradient(155deg, rgba(32, 24, 58, 0.90) 0%, rgba(21, 16, 42, 0.86) 55%, rgba(29, 21, 54, 0.88) 100%);
  color: #f3eeff;
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    inset 0 -1px 1px rgba(0, 0, 0, 0.38),
    0 22px 56px rgba(4, 2, 18, 0.58);
}
:host([data-theme="dark"]) .panel-close { background: rgba(255, 255, 255, 0.10); color: #f3eeff; }
:host([data-theme="dark"]) .panel-close:hover { background: rgba(196, 181, 253, 0.24); }
:host([data-theme="dark"]) .panel-section { color: #c4b5fd; }
:host([data-theme="dark"]) .field select,
:host([data-theme="dark"]) .field input[type="number"],
:host([data-theme="dark"]) .field input[type="password"],
:host([data-theme="dark"]) .field input[type="text"],
:host([data-theme="dark"]) .field textarea {
  background: rgba(16, 12, 34, 0.72);
  color: #f3eeff;
  border-color: rgba(196, 181, 253, 0.30);
}
:host([data-theme="dark"]) .field select option { background: #1c1535; color: #f3eeff; }
:host([data-theme="dark"]) .range-val,
:host([data-theme="dark"]) .panel-note { color: #bfb2e4; }
:host([data-theme="dark"]) .panel-link { color: #c4b5fd; }
:host([data-theme="dark"]) .panel-btn {
  background: rgba(196, 181, 253, 0.16);
  border-color: rgba(196, 181, 253, 0.34);
  color: #f3eeff;
}
:host([data-theme="dark"]) .panel-btn:hover { background: rgba(196, 181, 253, 0.26); }
:host([data-theme="dark"]) .update-card {
  background: linear-gradient(135deg, rgba(64, 46, 114, 0.45), rgba(88, 38, 86, 0.35));
  border-color: rgba(196, 181, 253, 0.28);
}
:host([data-theme="dark"]) .update-version { color: #c8bce8; }
:host([data-theme="dark"]) .update-button {
  background: rgba(196, 181, 253, 0.22);
  border-color: rgba(196, 181, 253, 0.42);
  color: #faf7ff;
}
:host([data-theme="dark"]) .update-button:hover:not(:disabled) { background: rgba(196, 181, 253, 0.34); }
:host([data-theme="dark"]) .panel .trend-bars {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.12);
}
:host([data-theme="dark"]) .panel .trend-day { color: #c4b5e6; }
:host([data-theme="dark"]) .panel .trend-col.today .trend-day { color: #fde68a; }

.stage.ghost-mode { filter: saturate(0.88); }

/* ---- Floating Quick Chat Bar ("聊一聊") ---- */
.chat-bar {
  position: fixed; left: 0; top: 0; z-index: 22;
  display: flex; align-items: center; gap: 6px;
  width: 286px; padding: 6px 8px;
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.92), rgba(246, 243, 255, 0.84));
  color: #241736;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 999px;
  box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.95), 0 14px 36px rgba(24, 14, 58, 0.24);
  backdrop-filter: blur(26px) saturate(190%);
  -webkit-backdrop-filter: blur(26px) saturate(190%);
  font: 500 12.5px/1.3 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif;
  pointer-events: none; opacity: 0; visibility: hidden;
  transform: translate3d(var(--chat-x, 0px), var(--chat-y, 0px), 0) scale(0.86) translateY(6px);
  transition: opacity 0.14s ease, transform 0.22s cubic-bezier(0.22, 1.22, 0.36, 1), visibility 0.14s;
}
.chat-bar.show {
  pointer-events: auto; opacity: 1; visibility: visible;
  transform: translate3d(var(--chat-x, 0px), var(--chat-y, 0px), 0) scale(1) translateY(0);
}
.chat-input {
  flex: 1 1 auto; min-width: 0; border: 0; background: rgba(139, 92, 246, 0.07); color: inherit;
  font: inherit; padding: 6px 10px; border-radius: 999px; outline: none;
  transition: background-color 0.14s ease, box-shadow 0.14s ease;
}
.chat-input:focus {
  background: rgba(139, 92, 246, 0.12);
  box-shadow: inset 0 0 0 1.5px rgba(139, 92, 246, 0.45);
}
.chat-gear, .chat-close {
  border: 0; background: rgba(139, 92, 246, 0.10); color: inherit;
  width: 28px; height: 28px; border-radius: 999px; cursor: pointer; flex: 0 0 28px;
  display: inline-flex; align-items: center; justify-content: center; font-size: 13.5px; line-height: 1;
  transition: background-color 0.14s ease, transform 0.12s ease;
}
.chat-gear:hover, .chat-close:hover { background: rgba(139, 92, 246, 0.22); }
.chat-gear:active, .chat-close:active { transform: scale(0.92); }
.chat-send {
  border: 0; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: #fff;
  font: inherit; font-weight: 600; font-size: 12px; padding: 6px 11px; border-radius: 999px;
  cursor: pointer; flex: 0 0 auto; white-space: nowrap;
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.34);
  transition: filter 0.14s ease, transform 0.12s ease, opacity 0.14s ease;
}
.chat-send:hover:not(:disabled) { filter: brightness(1.08); }
.chat-send:active:not(:disabled) { transform: scale(0.95); }
.chat-send:disabled { opacity: 0.6; cursor: default; }

:host([data-theme="dark"]) .chat-bar {
  background: linear-gradient(155deg, rgba(34, 26, 62, 0.90), rgba(22, 16, 44, 0.85));
  color: #f4f0ff; border-color: rgba(255, 255, 255, 0.18);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24), 0 16px 42px rgba(4, 2, 18, 0.54);
}
:host([data-theme="dark"]) .chat-input { background: rgba(255, 255, 255, 0.08); color: #f4f0ff; }
:host([data-theme="dark"]) .chat-input::placeholder { color: rgba(210, 198, 242, 0.62); }
:host([data-theme="dark"]) .chat-gear,
:host([data-theme="dark"]) .chat-close { background: rgba(255, 255, 255, 0.10); color: #f4f0ff; }
:host([data-theme="dark"]) .chat-gear:hover,
:host([data-theme="dark"]) .chat-close:hover { background: rgba(196, 181, 253, 0.24); }

.panel-section.flash {
  animation: hagemi-section-flash 1.1s ease;
  border-radius: 7px; padding: 2px 6px; margin-left: -6px; margin-right: -6px;
}
@keyframes hagemi-section-flash {
  0% { background: rgba(139, 92, 246, 0.34); }
  100% { background: transparent; }
}

/* ---- Apple iOS 26/27 Personalized Liquid Glass Theme ([data-theme="liquid"]) ---- */
:host([data-theme="liquid"]) .menu,
:host([data-theme="liquid"]) .submenu,
:host([data-theme="liquid"]) .panel,
:host([data-theme="liquid"]) .bubble,
:host([data-theme="liquid"]) .chat-bar {
  background: linear-gradient(
    148deg,
    rgba(255, 255, 255, 0.56) 0%,
    rgba(236, 243, 255, 0.36) 38%,
    rgba(248, 236, 255, 0.34) 68%,
    rgba(255, 255, 255, 0.58) 100%
  );
  color: #161026;
  border: 1px solid rgba(255, 255, 255, 0.86);
  box-shadow:
    inset 0 2px 1px rgba(255, 255, 255, 0.96),
    inset 1.5px 0 1px rgba(255, 255, 255, 0.78),
    inset -1px 0 1px rgba(196, 181, 253, 0.55),
    inset 0 -1.5px 2px rgba(124, 58, 237, 0.22),
    0 22px 54px rgba(20, 12, 54, 0.22),
    0 4px 16px rgba(255, 255, 255, 0.26);
  backdrop-filter: blur(36px) saturate(240%) brightness(1.08);
  -webkit-backdrop-filter: blur(36px) saturate(240%) brightness(1.08);
}
:host([data-theme="liquid"]) .menu,
:host([data-theme="liquid"]) .submenu {
  border-radius: 20px;
  padding: 7px;
}
:host([data-theme="liquid"]) .panel {
  border-radius: 22px;
}
:host([data-theme="liquid"]) .bubble {
  border-radius: 20px;
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.65);
}
:host([data-theme="liquid"]) .bubble::after {
  background: rgba(250, 248, 255, 0.66);
  border-right-color: rgba(255, 255, 255, 0.86);
  border-bottom-color: rgba(255, 255, 255, 0.86);
}
:host([data-theme="liquid"]) .item {
  border-radius: 12px;
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.62);
}
:host([data-theme="liquid"]) .item:hover,
:host([data-theme="liquid"]) .item:focus-visible,
:host([data-theme="liquid"]) .item.active {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.66), rgba(216, 204, 255, 0.42));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92), 0 3px 10px rgba(88, 56, 178, 0.14);
}
:host([data-theme="liquid"]) .divider {
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.82), rgba(167, 139, 250, 0.28), rgba(255, 255, 255, 0.82), transparent);
}
:host([data-theme="liquid"]) .field select,
:host([data-theme="liquid"]) .field input[type="number"],
:host([data-theme="liquid"]) .field input[type="password"],
:host([data-theme="liquid"]) .field input[type="text"],
:host([data-theme="liquid"]) .field textarea,
:host([data-theme="liquid"]) .chat-input {
  background: rgba(255, 255, 255, 0.56);
  border-color: rgba(255, 255, 255, 0.85);
  box-shadow: inset 0 1px 2px rgba(32, 18, 74, 0.08);
}
:host([data-theme="liquid"]) .panel-btn,
:host([data-theme="liquid"]) .chat-gear,
:host([data-theme="liquid"]) .chat-close {
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.85);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92), 0 2px 8px rgba(42, 24, 98, 0.10);
}
:host([data-theme="liquid"]) .panel-btn:hover,
:host([data-theme="liquid"]) .chat-gear:hover,
:host([data-theme="liquid"]) .chat-close:hover {
  background: rgba(255, 255, 255, 0.78);
}
:host([data-theme="liquid"]) .hud,
:host([data-theme="liquid"]) .quota-btn {
  background: linear-gradient(148deg, rgba(46, 36, 84, 0.62) 0%, rgba(28, 22, 58, 0.52) 55%, rgba(62, 46, 112, 0.58) 100%);
  border: 1px solid rgba(255, 255, 255, 0.44);
  box-shadow:
    inset 0 1.5px 0 rgba(255, 255, 255, 0.52),
    inset 1px 0 0 rgba(255, 255, 255, 0.28),
    inset 0 -1px 1px rgba(196, 181, 253, 0.25),
    0 18px 44px rgba(12, 6, 36, 0.36);
  backdrop-filter: blur(34px) saturate(230%);
  -webkit-backdrop-filter: blur(34px) saturate(230%);
}
`;
