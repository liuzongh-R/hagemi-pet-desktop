// The pet's presence on screen: stage, pose loading, drag and throw, petting, bubble,
// quick quota fish badge, Liquid Glass animated context menu + submenus, sound effects,
// 7-day ledger trend chart, optional idle roaming, and desktop click-through bridge.
HAGEMI.boot = async function boot(send, options = {}) {
  const { clamp, lerp, rand } = HAGEMI.util;
  const { STAGE, MARGIN } = HAGEMI;
  const SIZES = { xs: 130, s: 175, m: 225, l: 295, xl: 380 };
  const HOST_ID = 'hagemi-pet-host';
  const FADE_MS = 120;
  const POSE_CACHE = 10;
  const isDesktop = !!options.desktop;
  const desktopApi = isDesktop ? window.hagemiDesktop : null;
  const isMac = desktopApi?.platform === 'darwin' || /Mac/i.test(navigator.platform || '');

  document.getElementById(HOST_ID)?.remove();
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000;';
  const root = host.attachShadow({ mode: 'closed' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(HAGEMI.css);
  root.adoptedStyleSheets = [sheet];

  const make = (tag, className, parent = root) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    parent.appendChild(element);
    return element;
  };
  const stage = make('div', 'stage');
  const backCanvas = make('canvas', 'layer', stage);
  const glCanvas = make('canvas', 'layer', stage);
  const frontCanvas = make('canvas', 'layer', stage);
  const hit = make('div', 'hit', stage);

  const quotaBtn = make('button', 'quota-btn hidden');
  quotaBtn.type = 'button';
  const quotaBtnIcon = make('span', 'fish-ico', quotaBtn);
  quotaBtnIcon.textContent = '🐟';
  const quotaBtnPct = make('span', 'fish-pct', quotaBtn);
  quotaBtnPct.textContent = '--';

  const bubble = make('div', 'bubble');
  const bubbleMark = make('span', 'mark', bubble);
  const bubbleText = make('span', 'text', bubble);
  const hud = make('div', 'hud');
  const menu = make('div', 'menu');
  menu.setAttribute('role', 'menu');
  const submenu = make('div', 'submenu');
  submenu.setAttribute('role', 'menu');
  const chatBar = make('form', 'chat-bar');
  const chatInput = make('input', 'chat-input', chatBar);
  chatInput.type = 'text';
  chatInput.maxLength = 400;
  chatInput.autocomplete = 'off';
  const chatGearBtn = make('button', 'chat-gear', chatBar);
  chatGearBtn.type = 'button';
  chatGearBtn.textContent = '⚙️';
  const chatSendBtn = make('button', 'chat-send', chatBar);
  chatSendBtn.type = 'submit';
  chatSendBtn.textContent = '发送';
  const chatCloseBtn = make('button', 'chat-close', chatBar);
  chatCloseBtn.type = 'button';
  chatCloseBtn.textContent = '×';
  const panel = make('div', 'panel');
  panel.setAttribute('role', 'dialog');

  let leaving = 0, running = true;
  const rig = HAGEMI.createRig(glCanvas, () => { if (running) { dispose(); send({ type: 'remount' }); } });
  if (!rig) { send({ type: 'error', message: 'webgl2-unavailable' }); return null; }
  const fx = HAGEMI.createFx(backCanvas, frontCanvas);
  const animator = HAGEMI.createAnimator(fx);
  const sound = HAGEMI.createSound({ desktop: isDesktop });

  let settings = {
    language: 'en', size: 'm', hidden: false, muted: false, animation: 'balanced',
    followCursor: true, quotaHoverDelayMs: 650, position: null,
    displayMode: 'desktop', alwaysOnTop: 'screen-saver', showQuotaBadge: true,
    roamEnabled: false, showInDock: false,
    theme: 'auto', opacity: 1, ghostMode: false, launchAtLogin: false, breakReminderMin: 0,
    chat: { provider: 'antigravity', model: 'Gemini 3.8 Flash (Low)', geminiModel: 'gemini-4-hydrogen', baseUrl: '', customModel: '', apiKey: '' },
    screenPeek: { mode: 'auto', autoIntervalMin: 0, model: 'gemini-3.5-flash-lite', apiKey: '', blockedKeywords: '' },
    notifications: { enabled: true, onTurnDone: true, onQuotaAlert: true },
    sound: { enabled: true, pack: 'builtin:soft', volume: 0.65 },
  };
  let ui = {};
  let updateState = { phase: 'idle' }, updateCard = null;
  let ledgerNoteEl = null, ledgerTrendEl = null, soundPackSelectEl = null, usageNoteEl = null, personaTextareaEl = null;
  let hudRows = [];
  let ledgerSummary = null;
  let soundPacks = [];
  let hudPinned = false, hudTrendOpen = false, badgeSpinTimer = 0;
  let scale = 0, pixelRatio = 0, screenRatio = 0, spriteW = 0, spriteH = 0;
  let badgeW = 62, badgeH = 24, lastBadgeKey = '';
  let x = 0, y = 0, vx = 0, vy = 0;
  let dragging = null;
  let roam = null, roamCooldown = rand(14, 26);
  let lastEdgeCheckAt = 0;
  const abort = new AbortController();
  const listen = (target, type, handler, extra = {}) => target.addEventListener(type, handler, { signal: abort.signal, ...extra });

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  animator.setReducedMotion(reducedMotion.matches);
  listen(reducedMotion, 'change', () => animator.setReducedMotion(reducedMotion.matches));

  const darkScheme = matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const mode = settings.theme || 'auto';
    if (mode === 'liquid') {
      host.dataset.theme = 'liquid';
      return;
    }
    const resolved = mode === 'dark' || (mode === 'auto' && darkScheme.matches) ? 'dark' : 'light';
    host.dataset.theme = resolved;
  }
  listen(darkScheme, 'change', applyTheme);
  applyTheme();

  // ---- Desktop click-through synchronization --------------------------------------------
  let lastInteractive = null, lastModalFocusable = null;
  function isModalOpen() {
    return menu.classList.contains('show') || submenu.classList.contains('show') || panel.classList.contains('show') || chatBar.classList.contains('show') || hudPinned;
  }
  function syncDesktopInput(pointerOver = false) {
    if (!desktopApi) return;
    const needsFocus = panel.classList.contains('show') || chatBar.classList.contains('show');
    if (needsFocus !== lastModalFocusable) {
      lastModalFocusable = needsFocus;
      desktopApi.setModalOpen?.(needsFocus);
    }
    const interactive = Boolean(dragging || isModalOpen() || pointerOver);
    if (interactive !== lastInteractive) {
      lastInteractive = interactive;
      desktopApi.setInteractive?.(interactive);
    }
  }
  function pointInEl(el, cx, cy, pad = 2) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    return cx >= rect.left - pad && cx <= rect.right + pad && cy >= rect.top - pad && cy <= rect.bottom + pad;
  }
  function isOverUi(cx, cy) {
    if (!quotaBtn.classList.contains('hidden') && pointInEl(quotaBtn, cx, cy, 4)) return true;
    if (bubble.classList.contains('show') && pointInEl(bubble, cx, cy, 2)) return true;
    if (hud.classList.contains('show') && hudPinned && pointInEl(hud, cx, cy, 2)) return true;
    if (menu.classList.contains('show') && pointInEl(menu, cx, cy, 4)) return true;
    if (submenu.classList.contains('show') && pointInEl(submenu, cx, cy, 4)) return true;
    if (chatBar.classList.contains('show') && pointInEl(chatBar, cx, cy, 4)) return true;
    if (panel.classList.contains('show') && pointInEl(panel, cx, cy, 2)) return true;
    return false;
  }

  // ---- Art: requested over the sidecar bridge, one pose at a time --------------------------
  const blobs = new Map(), pendingArt = new Map(), poses = new Map(), building = new Map();
  let current = null, previous = null, fade = 1, fadeStart = 0, wantedPose = null;

  function requestArt(name) {
    if (blobs.has(name)) return Promise.resolve(blobs.get(name));
    if (pendingArt.has(name)) return pendingArt.get(name).promise;
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    pendingArt.set(name, { promise, resolve });
    send({ type: 'art', name });
    return promise;
  }
  function receiveArt(name, data) {
    const entry = pendingArt.get(name);
    let blob = null;
    if (data) {
      const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      blob = new Blob([bytes], { type: 'image/webp' });
      blobs.set(name, blob);
    }
    pendingArt.delete(name);
    entry?.resolve(blob);
  }
  const decode = blob => createImageBitmap(blob, { premultiplyAlpha: 'premultiply' });

  async function ensurePose(name) {
    if (poses.has(name)) return poses.get(name);
    if (building.has(name)) return building.get(name);
    const job = (async () => {
      const info = HAGEMI.rigData[name];
      if (!info) return null;
      const files = await Promise.all([
        requestArt(name),
        info.blink ? requestArt(`blink/${name}`) : null,
        ...['tail', 'under', 'cut'].map(layer => (info.tailRect ? requestArt(`${layer}/${name}`) : null)),
      ]);
      if (!files[0] || !running) return null;
      const layers = await Promise.all(files.map(blob => (blob ? decode(blob) : null)));
      const pose = rig.buildPose(name, ...layers, info);
      for (const layer of layers) layer?.close();
      poses.set(name, pose);
      if (poses.size > POSE_CACHE) for (const [other, value] of poses) {
        if (value !== current && value !== previous && other !== wantedPose) { rig.freePose(value); poses.delete(other); break; }
      }
      return pose;
    })().finally(() => building.delete(name));
    building.set(name, job);
    return job;
  }
  async function preloadClones() {
    const art = await requestArt('idle');
    if (!art || !running) return;
    fx.setCloneImage(await createImageBitmap(art, { resizeWidth: 222, resizeHeight: 256, resizeQuality: 'high' }));
  }
  function usePose(name) {
    if (wantedPose === name || !name) return;
    wantedPose = name;
    ensurePose(name).then(pose => {
      if (!pose || wantedPose !== name || current === pose) return;
      previous = current;
      current = pose;
      fade = previous ? 0 : 1;
      fadeStart = performance.now();
      if (previous) animator.play('pop');
    });
  }

  function applySize() {
    const height = SIZES[settings.size] || SIZES.m;
    scale = height / STAGE.h;
    screenRatio = window.devicePixelRatio || 1;
    pixelRatio = Math.min(2, screenRatio);
    spriteW = 500 * scale;
    spriteH = height;
    const pixelW = Math.ceil((STAGE.w + MARGIN * 2) * scale * pixelRatio), pixelH = Math.ceil((STAGE.h + MARGIN * 2) * scale * pixelRatio);
    stage.style.width = `${pixelW / pixelRatio}px`;
    stage.style.height = `${pixelH / pixelRatio}px`;
    hit.style.left = `${MARGIN * scale}px`;
    hit.style.top = `${MARGIN * scale}px`;
    hit.style.width = `${STAGE.w * scale}px`;
    hit.style.height = `${spriteH}px`;
    rig.resize(pixelW, pixelH);
    fx.resize(pixelW, pixelH);
    keepInBounds();
  }

  const viewW = () => window.innerWidth, viewH = () => window.innerHeight;
  function keepInBounds() {
    if (docked) { x = docked === 'left' ? 0 : viewW(); y = clamp(y, spriteH * 0.3, Math.max(spriteH * 0.3, viewH() - spriteH * 0.3)); return; }
    const marginX = spriteW * 0.22, marginY = spriteH * 0.2;
    x = clamp(x, marginX, Math.max(marginX, viewW() - marginX));
    y = clamp(y, marginY, Math.max(marginY, viewH() - marginY));
  }

  let anchor = null, docked = null;
  function placeInitial() {
    const p = settings.position;
    anchor = p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
    docked = p && (p.dock === 'left' || p.dock === 'right') ? p.dock : null;
    settle();
  }
  function settle() {
    if (viewW() < 8 || viewH() < 8) return;
    if (!anchor) anchor = { x: 1 - (spriteW * 0.7) / viewW(), y: 1 - (spriteH * 0.62) / viewH() };
    x = anchor.x * viewW();
    y = anchor.y * viewH();
    keepInBounds();
  }
  function stopRoam() {
    roam = null;
    roamCooldown = rand(18, 34);
  }
  function centerPet(frac = null) {
    stopRoam();
    docked = null;
    vx = 0;
    vy = 0;
    x = (frac && Number.isFinite(frac.x) ? frac.x : 0.5) * viewW();
    y = (frac && Number.isFinite(frac.y) ? frac.y : 0.5) * viewH();
    keepInBounds();
    savePosition();
    animator.play('hop');
    fx.burst('sparkles', STAGE.cx, 400, 10);
    sound.play('chime', settings.sound);
  }

  // ---- Quick Quota Fish Badge (Zero per-frame reflow) -----------------------------------
  function measureBadge() {
    if (quotaBtn.offsetWidth > 0) badgeW = quotaBtn.offsetWidth;
    if (quotaBtn.offsetHeight > 0) badgeH = quotaBtn.offsetHeight;
  }
  function placeQuotaBadge(force = false) {
    const hidden = stage.style.display === 'none' || settings.ghostMode || !settings.showQuotaBadge || !!dragging || (docked && !animator.state.endsWith('Peek'));
    quotaBtn.classList.toggle('hidden', hidden);
    quotaBtn.classList.toggle('active', hudPinned);
    if (hidden) { lastBadgeKey = 'hidden'; return; }
    let left;
    if (docked === 'left') left = x + spriteW * 0.36;
    else if (docked === 'right') left = x - spriteW * 0.36 - badgeW;
    else {
      const preferRight = x + spriteW * 0.26;
      left = preferRight + badgeW + 8 <= viewW() ? preferRight : x - spriteW * 0.26 - badgeW;
    }
    const rx = Math.round(clamp(left, 8, viewW() - badgeW - 8));
    const ry = Math.round(clamp(y + spriteH * 0.28, 8, viewH() - badgeH - 8));
    const key = `${rx},${ry}`;
    if (force || key !== lastBadgeKey) {
      lastBadgeKey = key;
      quotaBtn.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    }
  }

  function updateQuotaBadge(stashLevel, stashLabel, tone) {
    quotaBtnPct.textContent = stashLabel || '--';
    quotaBtn.title = ui.quota_badge_tip || 'Click to view live quota';
    quotaBtn.dataset.tone = tone === 'critical' || tone === 'empty' ? 'bad' : tone === 'low' ? 'warn' : 'ok';
    quotaBtn.classList.remove('spinning');
    clearTimeout(badgeSpinTimer);
    measureBadge();
    placeQuotaBadge(true);
  }

  function triggerQuotaCheck({ toggle = true } = {}) {
    stopRoam();
    sound.play('quota', settings.sound);
    if (toggle && hudPinned) {
      unpinHud();
      return;
    }
    closeMenu();
    quotaBtn.classList.add('spinning');
    clearTimeout(badgeSpinTimer);
    badgeSpinTimer = setTimeout(() => quotaBtn.classList.remove('spinning'), 1400);
    pinHud();
    send({ type: 'quota_refresh' });
  }

  listen(quotaBtn, 'pointerdown', event => { event.stopPropagation(); });
  listen(quotaBtn, 'click', event => {
    event.stopPropagation();
    triggerQuotaCheck({ toggle: true });
  });

  // ---- Bubble ---------------------------------------------------------------------------
  let lastKeyAt = -1e9, lastPointerAt = performance.now();
  let speech = null, speechQueue = [];
  function placeBubble() {
    const width = bubble.offsetWidth, height = bubble.offsetHeight;
    const headX = docked === 'left' ? x + spriteW * 0.26 : docked === 'right' ? x - spriteW * 0.26 : x, top = y - spriteH * 0.52;
    let left = clamp(headX - width / 2, 8, viewW() - width - 8), topPx = top - height - 4, side = 'above';
    if (topPx < 6) {
      const roomRight = viewW() - (x + spriteW * 0.5);
      if (roomRight > width + 12) { left = x + spriteW * 0.46; side = 'right'; } else { left = Math.max(8, x - spriteW * 0.46 - width); side = 'left'; }
      topPx = clamp(y - spriteH * 0.38, 6, viewH() - height - 6);
    }
    bubble.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(topPx)}px, 0)`;
    bubble.dataset.side = side;
    bubble.style.setProperty('--tail-x', `${Math.round(clamp(headX - left, 18, width - 18))}px`);
  }
  function startSpeech(item) {
    const cjk = /[㐀-鿿぀-ヿ]/.test(item.text);
    speech = { ...item, chars: Array.from(item.text), shown: 0, clock: 0, step: cjk ? 0.042 : 0.019, finished: 0, hold: item.ms || clamp(1900 + item.text.length * (cjk ? 110 : 48), 2900, 9500) };
    bubbleText.textContent = '';
    bubbleMark.textContent = item.ai ? '✦' : '';
    bubble.classList.add('show');
    placeBubble();
    const mood = HAGEMI.MOODS[item.mood];
    if (mood && !sulking && !dragging && !docked) animator.override(mood, speech.hold + 600);
    animator.setTalking(true);
  }
  function stepSpeech(dt, now) {
    if (!speech) {
      if (speechQueue.length && (now - lastKeyAt > 1400 || now - speechQueue[0].queuedAt > 12000)) startSpeech(speechQueue.shift());
      return;
    }
    if (speech.shown < speech.chars.length) {
      speech.clock += dt;
      while (speech.clock >= speech.step && speech.shown < speech.chars.length) {
        speech.clock -= speech.step;
        speech.shown++;
      }
      bubbleText.textContent = speech.chars.slice(0, speech.shown).join('');
      placeBubble();
      if (speech.shown >= speech.chars.length) { speech.finished = now; animator.setTalking(false); }
    } else if (!bubble.matches(':hover') && now - speech.finished > speech.hold) {
      closeBubble();
    }
  }
  function closeBubble() {
    speech = null;
    animator.setTalking(false);
    bubble.classList.remove('show');
  }
  listen(bubble, 'click', closeBubble);

  // ---- Floating Quick Chat Bar ("聊一聊") -----------------------------------------------
  let chatBusy = false;
  function placeChatBar() {
    const width = chatBar.offsetWidth || 286;
    const height = chatBar.offsetHeight || 42;
    const left = Math.round(clamp(x - width / 2, 8, viewW() - width - 8));
    const below = y + spriteH * 0.44 + 8;
    const top = Math.round(below + height < viewH() - 6 ? below : clamp(y - spriteH * 0.48 - height - 8, 8, viewH() - height - 8));
    chatBar.style.setProperty('--chat-x', `${left}px`);
    chatBar.style.setProperty('--chat-y', `${top}px`);
  }
  function refreshChatBarLabels() {
    chatInput.placeholder = ui.chat_placeholder || 'Chat with Hagemi… (Enter to send)';
    chatGearBtn.title = ui.chat_settings_tip || 'Chat model & API settings';
    chatCloseBtn.title = ui.close || 'Close';
    chatSendBtn.textContent = chatBusy ? (ui.chat_sending || 'Thinking…') : (ui.chat_send || 'Send');
    chatSendBtn.disabled = chatBusy;
  }
  function openChatBar() {
    stopRoam();
    closeMenu();
    closePanel();
    unpinHud();
    hideHud();
    refreshChatBarLabels();
    placeChatBar();
    chatBar.classList.add('show');
    syncDesktopInput(true);
    setTimeout(() => { try { chatInput.focus(); } catch {} }, 30);
  }
  function closeChatBar() {
    if (!chatBar.classList.contains('show')) return;
    chatBar.classList.remove('show');
    chatInput.blur();
    syncDesktopInput(false);
  }
  listen(chatBar, 'submit', event => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text || chatBusy) return;
    sound.play('press', settings.sound);
    chatBusy = true;
    chatInput.value = '';
    refreshChatBarLabels();
    send({ type: 'chat_send', text });
  });
  listen(chatGearBtn, 'click', event => {
    event.stopPropagation();
    sound.play('press', settings.sound);
    closeChatBar();
    openPanel({ notify: true, focusSection: 'chat' });
  });
  listen(chatCloseBtn, 'click', event => {
    event.stopPropagation();
    closeChatBar();
  });
  for (const type of ['keydown', 'keyup', 'keypress']) {
    listen(chatBar, type, event => {
      event.stopPropagation();
      if (event.key === 'Escape') closeChatBar();
    });
  }

  // ---- 7-Day Trend Mini Bar Chart -------------------------------------------------------
  function renderTrendBars(parent, recent7) {
    const list = Array.isArray(recent7) ? recent7 : [];
    if (!list.length) return;
    const bars = make('div', 'trend-bars', parent);
    const maxPct = Math.max(10, ...list.map(d => d.maxUsedPct || 0));
    const maxTurns = Math.max(1, ...list.map(d => d.turnsDone || 0));
    for (const day of list) {
      const col = make('div', day.isToday ? 'trend-col today' : 'trend-col', bars);
      col.title = (ui.ledger_trend_tip || '{date}: ~{pct}% quota · {turns} turns · {tools} tools')
        .replace('{date}', day.date)
        .replace('{pct}', String(day.maxUsedPct ?? 0))
        .replace('{turns}', String(day.turnsDone ?? 0))
        .replace('{tools}', String(day.toolCalls ?? 0));
      const track = make('div', 'trend-bar-track', col);
      const fill = make('div', 'trend-bar-fill', track);
      const ratio = day.maxUsedPct > 0 ? day.maxUsedPct / maxPct : (day.turnsDone > 0 ? (day.turnsDone / maxTurns) * 0.65 : 0);
      fill.style.height = `${Math.max(4, Math.round(ratio * 100))}%`;
      make('span', 'trend-day', col).textContent = day.label;
    }
  }

  // ---- HUD (Smoked Liquid Glass + Expandable 7-Day Trend) -------------------------------
  function renderHud() {
    hud.replaceChildren();
    if (hudPinned) {
      const head = make('div', 'hud-head', hud);
      make('span', '', head).textContent = ui.hud_title || 'Fish Stash & Status';
      const actions = make('span', 'hud-actions', head);
      const refreshBtn = make('button', 'hud-icon-btn', actions);
      refreshBtn.type = 'button';
      refreshBtn.title = ui.hud_refresh || 'Refresh quota';
      refreshBtn.textContent = '↻';
      refreshBtn.addEventListener('click', event => {
        event.stopPropagation();
        sound.play('quota', settings.sound);
        send({ type: 'quota_refresh' });
      });
      const closeBtn = make('button', 'hud-icon-btn', actions);
      closeBtn.type = 'button';
      closeBtn.title = ui.close || 'Close';
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', event => {
        event.stopPropagation();
        unpinHud();
      });
    }
    for (const row of hudRows) {
      if (row.divider) { make('div', 'hud-sep', hud); continue; }
      const line = make('div', 'row', hud);
      make('span', 'label', line).textContent = row.label;
      if (row.level != null) {
        const meter = make('span', 'meter', line);
        const fill = make('span', 'fill', meter);
        fill.style.width = `${Math.round(row.level * 100)}%`;
        fill.dataset.tone = row.level < 0.1 ? 'bad' : row.level < 0.25 ? 'warn' : 'ok';
      }
      make('span', 'value', line).textContent = row.value;
    }
    if (hudPinned && ledgerSummary?.recent7?.length) {
      const toggle = make('button', 'trend-toggle', hud);
      toggle.type = 'button';
      make('span', '', toggle).textContent = ui.ledger_trend_toggle || '📊 7-day trend';
      make('span', '', toggle).textContent = hudTrendOpen ? '▴' : '▾';
      toggle.addEventListener('click', event => {
        event.stopPropagation();
        sound.play('press', settings.sound);
        hudTrendOpen = !hudTrendOpen;
        renderHud();
        placeHud();
      });
      if (hudTrendOpen) renderTrendBars(hud, ledgerSummary.recent7);
    }
  }
  function placeHud() {
    const width = hud.offsetWidth, height = hud.offsetHeight;
    const left = clamp(x - width / 2, 8, viewW() - width - 8);
    const below = y + spriteH * 0.52 + 8;
    const top = below + height < viewH() ? below : clamp(y - spriteH * 0.52 - height - 8, 6, viewH() - height - 6);
    hud.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  }
  let hoverTimer = 0;
  function showHud() {
    if (hudRows.length && !dragging && !menu.classList.contains('show') && !panel.classList.contains('show')) {
      renderHud();
      hud.classList.add('show');
      placeHud();
      animator.setMood({ showStash: true });
    }
  }
  function hideHud() {
    if (hudPinned) return;
    hud.classList.remove('show');
    animator.setMood({ showStash: false });
  }
  function pinHud() {
    hudPinned = true;
    clearTimeout(hoverTimer);
    renderHud();
    hud.classList.add('show', 'pinned');
    placeHud();
    animator.setMood({ showStash: true });
    syncDesktopInput(true);
  }
  function unpinHud() {
    if (!hudPinned) return;
    hudPinned = false;
    hud.classList.remove('pinned', 'show');
    animator.setMood({ showStash: false });
    syncDesktopInput(false);
  }

  // ---- Apple iOS 26/27 Liquid Glass Context Menu + Pop-Out Secondary Submenus -----------
  let activeSubKey = null, subCloseTimer = 0, activeTriggerBtn = null;

  function closeSubmenu() {
    clearTimeout(subCloseTimer);
    activeSubKey = null;
    if (activeTriggerBtn) { activeTriggerBtn.classList.remove('active'); activeTriggerBtn = null; }
    submenu.classList.remove('show');
  }

  function makeMenuItem(parent, label, action, checked = null) {
    const button = make('button', 'item', parent);
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    const main = make('span', 'item-main', button);
    if (checked !== null) {
      const checkEl = make('span', 'item-check', main);
      checkEl.textContent = checked ? '✓' : '';
    }
    make('span', '', main).textContent = label;
    button.addEventListener('click', event => {
      event.stopPropagation();
      sound.play('press', settings.sound);
      closeMenu();
      action();
    });
    return button;
  }

  function openSubmenu(key, anchorBtn, buildFn) {
    clearTimeout(subCloseTimer);
    if (activeSubKey === key && submenu.classList.contains('show')) return;
    if (activeTriggerBtn) activeTriggerBtn.classList.remove('active');
    activeTriggerBtn = anchorBtn;
    anchorBtn.classList.add('active');
    activeSubKey = key;

    submenu.replaceChildren();
    buildFn(submenu);

    const anchorRect = anchorBtn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const subW = submenu.offsetWidth || 196;
    const subH = submenu.offsetHeight || 160;
    const fitsRight = menuRect.right + 6 + subW <= viewW() - 6;
    const sx = Math.round(fitsRight ? menuRect.right + 6 : Math.max(6, menuRect.left - subW - 6));
    const sy = Math.round(clamp(anchorRect.top - 6, 6, viewH() - subH - 6));
    submenu.style.setProperty('--sub-x', `${sx}px`);
    submenu.style.setProperty('--sub-y', `${sy}px`);
    submenu.style.setProperty('--sub-ox', fitsRight ? '0%' : '100%');
    submenu.style.setProperty('--sub-oy', `${Math.round(clamp(anchorRect.top - sy + anchorRect.height / 2, 12, subH - 12))}px`);
    submenu.style.setProperty('--sub-shift', fitsRight ? '-10px' : '10px');
    submenu.classList.remove('show');
    void submenu.offsetWidth;
    submenu.classList.add('show');
    sound.play('menu', { ...settings.sound, volume: (settings.sound?.volume ?? 0.65) * 0.55 });
  }

  function scheduleSubmenuClose() {
    clearTimeout(subCloseTimer);
    subCloseTimer = setTimeout(() => {
      if (!submenu.matches(':hover')) closeSubmenu();
    }, 150);
  }
  listen(submenu, 'pointerenter', () => clearTimeout(subCloseTimer));
  listen(submenu, 'pointerleave', scheduleSubmenuClose);

  function openMenu(px, py) {
    stopRoam();
    clearTimeout(hoverTimer);
    unpinHud();
    hideHud();
    closeSubmenu();
    sound.play('menu', settings.sound);
    send({ type: 'sounds_scan' });
    menu.replaceChildren();

    const divider = (parent = menu) => make('div', 'divider', parent);
    const subGroup = (key, label, buildFn) => {
      const button = make('button', 'item', menu);
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.setAttribute('aria-haspopup', 'menu');
      make('span', 'item-main', button).textContent = label;
      make('span', 'item-arrow', button).textContent = '›';
      button.addEventListener('pointerenter', () => openSubmenu(key, button, buildFn));
      button.addEventListener('click', event => {
        event.stopPropagation();
        openSubmenu(key, button, buildFn);
      });
      return button;
    };

    const primaryItem = (label, action) => {
      const btn = makeMenuItem(menu, label, action, null);
      btn.addEventListener('pointerenter', scheduleSubmenuClose);
      return btn;
    };

    primaryItem(ui.menu_chat || '💬 Chat with Hagemi', () => openChatBar());
    primaryItem(ui.menu_check_quota || '🐟 Check live quota', () => triggerQuotaCheck({ toggle: false }));
    primaryItem(ui.menu_screen_peek || '👀 Peek at screen', () => send({ type: 'screen_peek', manual: true }));
    primaryItem(ui.menu_feed_fish || '🐟 Feed dried fish', () => send({ type: 'feed_fish' }));
    primaryItem(ui.talk || 'Say something', () => send({ type: 'talk' }));
    primaryItem(ui.pat || 'Pat her head', () => petted());
    divider();

    subGroup('display', `🖥️ ${ui.menu_group_display || 'Display & window'}`, sub => {
      makeMenuItem(sub, ui.menu_mode_desktop || 'Desktop overlay', () => patch({ displayMode: 'desktop' }), settings.displayMode === 'desktop');
      makeMenuItem(sub, ui.menu_mode_app || 'Antigravity window only', () => patch({ displayMode: 'app' }), settings.displayMode === 'app');
      makeMenuItem(sub, ui.display_mode_both || 'Both', () => patch({ displayMode: 'both' }), settings.displayMode === 'both');
      divider(sub);
      makeMenuItem(sub, ui.menu_ontop_full || 'Always on top (over fullscreen)', () => patch({ alwaysOnTop: settings.alwaysOnTop === 'screen-saver' ? 'floating' : 'screen-saver' }), settings.alwaysOnTop === 'screen-saver');
      makeMenuItem(sub, ui.menu_ghost_mode || '👻 Ghost click-through mode', () => patch({ ghostMode: !settings.ghostMode }), !!settings.ghostMode);
      makeMenuItem(sub, ui.menu_roam || 'Idle desktop roaming', () => patch({ roamEnabled: !settings.roamEnabled }), !!settings.roamEnabled);
      if (isMac) {
        makeMenuItem(sub, ui.menu_dock_icon || 'Show icon in Dock (macOS)', () => patch({ showInDock: !settings.showInDock }), !!settings.showInDock);
      }
      divider(sub);
      makeMenuItem(sub, ui.menu_center || '🎯 Center pet', () => {
        if (desktopApi?.centerOnCursor) desktopApi.centerOnCursor();
        else centerPet();
      }, null);
      if (desktopApi?.focusAntigravity) {
        makeMenuItem(sub, ui.menu_focus_app || '🚀 Bring Antigravity to front', () => desktopApi.focusAntigravity(), null);
      }
      if (desktopApi?.nextDisplay) {
        makeMenuItem(sub, ui.menu_next_display || '🖥️ Move to next screen', () => desktopApi.nextDisplay(), null);
      }
    });

    subGroup('appearance', `📐 ${ui.menu_group_appearance || 'Size & language'}`, sub => {
      for (const [key, label] of [
        ['xs', ui.size_xs || 'Tiny'],
        ['s', ui.size_s || 'Small'],
        ['m', ui.size_m || 'Medium'],
        ['l', ui.size_l || 'Large'],
        ['xl', ui.size_xl || 'Huge'],
      ]) {
        makeMenuItem(sub, label, () => patch({ size: key }), settings.size === key);
      }
      divider(sub);
      makeMenuItem(sub, ui.theme_auto || 'Follow system', () => patch({ theme: 'auto' }), (settings.theme || 'auto') === 'auto');
      makeMenuItem(sub, ui.theme_light || 'Light Frosted', () => patch({ theme: 'light' }), settings.theme === 'light');
      makeMenuItem(sub, ui.theme_dark || 'Dark Smoked', () => patch({ theme: 'dark' }), settings.theme === 'dark');
      makeMenuItem(sub, ui.theme_liquid || '✨ Liquid Glass', () => patch({ theme: 'liquid' }), settings.theme === 'liquid');
      divider(sub);
      makeMenuItem(sub, ui.language_zhs || '简体中文', () => patch({ language: 'zhs' }), settings.language === 'zhs');
      makeMenuItem(sub, ui.language_en || 'English', () => patch({ language: 'en' }), settings.language === 'en');
      makeMenuItem(sub, ui.language_auto || 'Follow app language', () => patch({ language: 'auto' }), settings.language === 'auto');
    });

    subGroup('audio', `🔊 ${ui.menu_group_audio || 'Sound & alerts'}`, sub => {
      makeMenuItem(sub, ui.menu_sound || 'Sound effects', () => patch({ sound: { enabled: !settings.sound?.enabled } }), settings.sound?.enabled !== false);
      makeMenuItem(sub, ui.menu_sound_dir || 'Open sound folder…', () => send({ type: 'open_sound_dir' }), null);
      divider(sub);
      makeMenuItem(sub, ui.menu_notifications || 'System notifications', () => patch({ notifications: { enabled: !settings.notifications?.enabled } }), settings.notifications?.enabled !== false);
      makeMenuItem(sub, ui.mute || 'Mute comments', () => patch({ muted: !settings.muted }), !!settings.muted);
      makeMenuItem(sub, ui.ai || 'AI comments', () => patch({ ai: { enabled: !settings.ai?.enabled } }), !!settings.ai?.enabled);
    });

    divider();
    primaryItem(`⚙️ ${ui.settings || 'Settings…'}`, () => openPanel());
    primaryItem((updateState.phase === 'available' ? ui.update_available_menu : ui.update_menu) || '🐾 Check for updates…', () => { openPanel(); if (updateState.phase === 'idle') send({ type: 'update_check' }); });
    primaryItem(`🙈 ${ui.hide || 'Hide for 1 hour'}`, () => patch({ hiddenUntil: Date.now() + 3600000 }));

    menu.classList.remove('show');
    const width = menu.offsetWidth || 202, height = menu.offsetHeight || 270;
    const mx = Math.round(clamp(px, 6, viewW() - width - 6));
    const my = Math.round(clamp(py, 6, viewH() - height - 6));
    menu.style.setProperty('--menu-x', `${mx}px`);
    menu.style.setProperty('--menu-y', `${my}px`);
    menu.style.setProperty('--menu-ox', `${Math.round(clamp(px - mx, 0, width))}px`);
    menu.style.setProperty('--menu-oy', `${Math.round(clamp(py - my, 0, height))}px`);
    void menu.offsetWidth;
    menu.classList.add('show');
    syncDesktopInput(true);
  }

  function closeMenu() {
    closeSubmenu();
    if (!menu.classList.contains('show')) return;
    menu.classList.remove('show');
    syncDesktopInput(false);
  }

  listen(window, 'pointerdown', event => {
    if (!event.composedPath().includes(host)) {
      closeMenu();
      closePanel();
      closeChatBar();
      unpinHud();
    }
  }, { capture: true });
  listen(root, 'pointerdown', event => {
    const path = event.composedPath();
    if (!path.includes(menu) && !path.includes(submenu)) closeMenu();
    if (!path.includes(panel) && !path.includes(menu) && !path.includes(submenu)) closePanel();
    if (!path.includes(chatBar) && !path.includes(bubble) && !path.includes(menu)) closeChatBar();
    if (hudPinned && !path.includes(hud) && !path.includes(quotaBtn)) unpinHud();
  }, { capture: true });

  // ---- Settings panel (In-place live updates — zero re-render storm!) -------------------
  let modelChoices = [], usage = null;
  function renderUpdate() {
    if (!updateCard) return;
    updateCard.replaceChildren();
    const title = make('div', 'update-title', updateCard);
    make('span', 'update-paw', title).textContent = '🐾';
    make('b', '', title).textContent = ui.update_title;
    const version = [updateState.currentVersion && `v${updateState.currentVersion}`, updateState.currentSha?.slice(0, 7)].filter(Boolean).join(' · ');
    if (version) make('span', 'update-version', title).textContent = version;
    const status = make('div', 'panel-note update-status', updateCard);
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = ui[`update_status_${updateState.phase}`] || ui.update_status_idle;
    if (['available', 'manual'].includes(updateState.phase) && updateState.latestSha) status.textContent += ` (${updateState.latestSha.slice(0, 7)})`;
    if (updateState.reason) make('div', 'panel-note update-reason', updateCard).textContent = ui[`update_reason_${updateState.reason}`] || '';
    const button = make('button', 'update-button', updateCard);
    button.type = 'button';
    const install = updateState.phase === 'available' && updateState.canInstall;
    button.textContent = install ? ui.update_install : updateState.phase === 'checking' ? ui.update_checking : updateState.phase === 'installing' ? ui.update_installing : updateState.phase === 'installed' ? ui.update_installed : ui.update_check;
    button.disabled = ['checking', 'installing', 'installed'].includes(updateState.phase);
    button.addEventListener('click', () => send({ type: install ? 'update_install' : 'update_check' }));
  }

  function renderSoundPackOptions() {
    if (!soundPackSelectEl) return;
    const isZh = ui.close === '关闭';
    const currentVal = settings.sound?.pack || 'builtin:soft';
    const opts = (soundPacks.length ? soundPacks : [
      { id: 'builtin:soft', labelEn: 'Soft Bubble (built-in)', labelZhs: '软萌气泡（内置）' },
      { id: 'builtin:mechanical', labelEn: 'Tactile Click (built-in)', labelZhs: '清脆按键（内置）' },
    ]).map(p => [p.id, p.label || (isZh ? p.labelZhs : p.labelEn) || p.id]);
    if (!opts.some(([id]) => id === currentVal) && currentVal) opts.push([currentVal, currentVal]);
    soundPackSelectEl.replaceChildren();
    for (const [key, text] of opts) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = text;
      soundPackSelectEl.appendChild(option);
    }
    soundPackSelectEl.value = currentVal;
  }

  function renderPanelLedger() {
    if (ledgerNoteEl && ledgerSummary) {
      ledgerNoteEl.textContent = (ui.ledger_summary || 'Quota used ~{pct}% · {turns} turns ({tools} tools) · {subagents} subagents · {errors} errors')
        .replace('{pct}', String(ledgerSummary.maxUsedPct ?? 0))
        .replace('{turns}', String(ledgerSummary.turnsDone ?? 0))
        .replace('{tools}', String(ledgerSummary.toolCalls ?? 0))
        .replace('{subagents}', String(ledgerSummary.subagents ?? 0))
        .replace('{errors}', String(ledgerSummary.errors ?? 0));
    }
    if (usageNoteEl && usage) {
      usageNoteEl.textContent = (ui.usage || '{calls} AI comments, about {tokens} tokens')
        .replace('{calls}', usage.calls)
        .replace('{tokens}', usage.tokens);
    }
    if (ledgerTrendEl) {
      ledgerTrendEl.replaceChildren();
      if (ledgerSummary?.recent7?.length) renderTrendBars(ledgerTrendEl, ledgerSummary.recent7);
    }
  }

  function openPanel({ notify = true, focusSection = null } = {}) {
    const wasOpen = panel.classList.contains('show');
    stopRoam();
    closeChatBar();
    panel.replaceChildren();
    ledgerNoteEl = null;
    ledgerTrendEl = null;
    soundPackSelectEl = null;
    usageNoteEl = null;
    const sectionEls = {};

    const s = settings, ai = settings.ai || {}, snd = settings.sound || {}, notif = settings.notifications || {}, sp = settings.screenPeek || {}, chat = settings.chat || {};
    const head = make('div', 'panel-head', panel);
    make('b', '', head).textContent = ui.settings_title || 'Hagemi settings';
    const close = make('button', 'panel-close', head);
    close.type = 'button';
    close.setAttribute('aria-label', ui.close || 'Close');
    close.textContent = '×';
    close.addEventListener('click', closePanel);
    updateCard = make('div', 'update-card', panel);
    renderUpdate();

    const section = (title, key = null) => {
      const el = make('div', 'panel-section', panel);
      el.textContent = title;
      if (key) sectionEls[key] = el;
      return el;
    };
    const field = (label, control, parent = panel) => {
      const row = make('label', 'field', parent);
      make('span', '', row).textContent = label;
      row.appendChild(control);
    };
    const select = (value, opts, onChange) => {
      const control = document.createElement('select');
      for (const [key, text] of opts) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = text;
        control.appendChild(option);
      }
      control.value = value;
      control.addEventListener('change', () => onChange(control.value));
      return control;
    };
    const check = (value, onChange) => {
      const control = document.createElement('input');
      control.type = 'checkbox';
      control.checked = !!value;
      control.addEventListener('change', () => onChange(control.checked));
      return control;
    };
    const number = (value, min, max, onChange) => {
      const control = document.createElement('input');
      control.type = 'number';
      control.min = min;
      control.max = max;
      control.value = value;
      control.addEventListener('change', () => onChange(Number(control.value)));
      return control;
    };

    section(ui.section_desktop || 'Desktop & display');
    field(ui.display_mode || 'Display mode', select(s.displayMode || 'desktop', [
      ['desktop', ui.display_mode_desktop || 'Desktop overlay'],
      ['app', ui.display_mode_app || 'Antigravity window'],
      ['both', ui.display_mode_both || 'Both'],
    ], value => patch({ displayMode: value })));
    field(ui.theme_label || 'Appearance theme', select(s.theme || 'auto', [
      ['auto', ui.theme_auto || 'Follow system (Light / Dark)'],
      ['light', ui.theme_light || 'Light Frosted'],
      ['dark', ui.theme_dark || 'Dark Smoked'],
      ['liquid', ui.theme_liquid || '✨ Liquid Glass (Apple style)'],
    ], value => patch({ theme: value })));
    const opWrap = document.createElement('span');
    opWrap.className = 'range-wrap';
    const opSlider = document.createElement('input');
    opSlider.type = 'range';
    opSlider.min = 50;
    opSlider.max = 100;
    opSlider.value = Math.round((s.opacity ?? 1) * 100);
    const opLabel = document.createElement('span');
    opLabel.className = 'range-val';
    opLabel.textContent = `${opSlider.value}%`;
    opSlider.addEventListener('input', () => {
      opLabel.textContent = `${opSlider.value}%`;
      settings.opacity = Number(opSlider.value) / 100;
      applyVisibility();
    });
    opSlider.addEventListener('change', () => patch({ opacity: Number(opSlider.value) / 100 }));
    opWrap.append(opSlider, opLabel);
    field(ui.opacity_label || 'Pet opacity', opWrap);
    field(ui.always_on_top || 'Keep above fullscreen apps', check(s.alwaysOnTop === 'screen-saver', value => patch({ alwaysOnTop: value ? 'screen-saver' : 'floating' })));
    field(ui.ghost_mode_label || 'Ghost focus mode (full click-through)', check(!!s.ghostMode, value => patch({ ghostMode: value })));
    field(ui.show_quota_badge || 'Show quick quota fish button', check(s.showQuotaBadge !== false, value => patch({ showQuotaBadge: value })));
    field(ui.roam_enabled || 'Idle desktop roaming', check(!!s.roamEnabled, value => patch({ roamEnabled: value })));
    field(ui.break_reminder || 'Water & stretch reminder', select(String(s.breakReminderMin || 0), [
      ['0', ui.break_off || 'Off'],
      ['25', (ui.break_min || 'Every {min} min').replace('{min}', '25')],
      ['45', (ui.break_min || 'Every {min} min').replace('{min}', '45')],
      ['60', (ui.break_min || 'Every {min} min').replace('{min}', '60')],
      ['90', (ui.break_min || 'Every {min} min').replace('{min}', '90')],
    ], value => patch({ breakReminderMin: Number(value) })));
    field(ui.launch_at_login || 'Launch at system login', check(!!s.launchAtLogin, value => patch({ launchAtLogin: value })));
    if (isMac) {
      field(ui.show_in_dock || 'Show icon in macOS Dock', check(!!s.showInDock, value => patch({ showInDock: value })));
    }
    make('div', 'panel-note', panel).textContent = ui.shortcut_hint || 'Global hide/show shortcut: Ctrl+Shift+H (macOS: Cmd+Shift+H)';

    section(ui.section_chat || 'Chat with Hagemi', 'chat');
    const chatFieldsHost = make('div', '', panel);
    const renderChatProviderFields = provider => {
      chatFieldsHost.replaceChildren();
      const curChat = settings.chat || {};
      if (provider === 'gemini') {
        field(ui.chat_model_gemini || 'Gemini model', select(curChat.geminiModel || 'gemini-4-hydrogen', [
          ['gemini-4-hydrogen', 'gemini-4-hydrogen (Balanced)'],
          ['gemini-4-neon', 'gemini-4-neon (Smart)'],
          ['gemini-4-argon', 'gemini-4-argon (Reasoning)'],
          ['gemini-3.5-flash-lite', 'gemini-3.5-flash-lite (Fastest)'],
        ], value => patch({ chat: { geminiModel: value } })), chatFieldsHost);
        const keyInput = document.createElement('input');
        keyInput.type = 'password';
        keyInput.autocomplete = 'off';
        keyInput.placeholder = ui.chat_api_key_placeholder || '';
        keyInput.value = curChat.apiKey || '';
        keyInput.addEventListener('change', () => patch({ chat: { apiKey: keyInput.value } }));
        field(ui.chat_api_key || 'Chat API key', keyInput, chatFieldsHost);
      } else if (provider === 'openai') {
        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.placeholder = ui.chat_base_url_placeholder || '';
        urlInput.value = curChat.baseUrl || '';
        urlInput.addEventListener('change', () => patch({ chat: { baseUrl: urlInput.value } }));
        field(ui.chat_base_url || 'API Base URL', urlInput, chatFieldsHost);

        const modelInput = document.createElement('input');
        modelInput.type = 'text';
        modelInput.placeholder = ui.chat_custom_model_placeholder || '';
        modelInput.value = curChat.customModel || '';
        modelInput.addEventListener('change', () => patch({ chat: { customModel: modelInput.value } }));
        field(ui.chat_custom_model || 'Model ID', modelInput, chatFieldsHost);

        const keyInput = document.createElement('input');
        keyInput.type = 'password';
        keyInput.autocomplete = 'off';
        keyInput.placeholder = ui.chat_api_key_placeholder || '';
        keyInput.value = curChat.apiKey || '';
        keyInput.addEventListener('change', () => patch({ chat: { apiKey: keyInput.value } }));
        field(ui.chat_api_key || 'Chat API key', keyInput, chatFieldsHost);
      } else {
        const agyChoices = [...new Set([curChat.model || ai.model, ...modelChoices])].filter(Boolean).map(label => [label, label]);
        field(ui.chat_model_agy || 'Antigravity model', select(curChat.model || ai.model, agyChoices, value => patch({ chat: { model: value } })), chatFieldsHost);
      }
    };
    field(ui.chat_provider || 'Chat provider', select(chat.provider || 'antigravity', [
      ['antigravity', ui.chat_provider_antigravity || 'Antigravity built-in model'],
      ['gemini', ui.chat_provider_gemini || 'Custom Gemini API'],
      ['openai', ui.chat_provider_openai || 'Custom OpenAI-compatible API'],
    ], value => {
      patch({ chat: { provider: value } });
      renderChatProviderFields(value);
    }));
    // Move dynamic fields directly under the provider selector cleanly.
    panel.appendChild(chatFieldsHost);
    renderChatProviderFields(chat.provider || 'antigravity');
    const chatBtnRow = make('div', 'panel-btn-row', panel);
    const clearMemBtn = make('button', 'panel-btn', chatBtnRow);
    clearMemBtn.type = 'button';
    clearMemBtn.textContent = ui.chat_clear_memory || 'Clear chat memory';
    clearMemBtn.addEventListener('click', () => {
      sound.play('press', settings.sound);
      send({ type: 'chat_clear' });
    });

    section(ui.section_screen_peek || 'Screen peek & commentary');
    const peekBtnRow = make('div', 'panel-btn-row', panel);
    const peekNowBtn = make('button', 'panel-btn', peekBtnRow);
    peekNowBtn.type = 'button';
    peekNowBtn.textContent = ui.peek_now_btn || '👀 Peek at screen now';
    peekNowBtn.addEventListener('click', () => {
      sound.play('press', settings.sound);
      closePanel();
      send({ type: 'screen_peek', manual: true });
    });
    field(ui.peek_mode || 'Peek mode', select(sp.mode || 'auto', [
      ['auto', ui.peek_mode_auto || 'Auto'],
      ['vision', ui.peek_mode_vision || 'Gemini Vision screenshot only'],
      ['window', ui.peek_mode_window || 'Window title only'],
    ], value => patch({ screenPeek: { mode: value } })));
    field(ui.peek_interval || 'Auto-peek interval', select(String(sp.autoIntervalMin || 0), [
      ['0', ui.peek_off || 'Manual only'],
      ['5', (ui.peek_min || 'Every {min} min').replace('{min}', '5')],
      ['10', (ui.peek_min || 'Every {min} min').replace('{min}', '10')],
      ['15', (ui.peek_min || 'Every {min} min').replace('{min}', '15')],
      ['30', (ui.peek_min || 'Every {min} min').replace('{min}', '30')],
    ], value => patch({ screenPeek: { autoIntervalMin: Number(value) } })));
    field(ui.peek_model || 'Vision model', select(sp.model || 'gemini-3.5-flash-lite', [
      ['gemini-3.5-flash-lite', 'gemini-3.5-flash-lite (Fastest)'],
      ['gemini-4-hydrogen', 'gemini-4-hydrogen (Balanced)'],
      ['gemini-4-argon', 'gemini-4-argon (Reasoning)'],
    ], value => patch({ screenPeek: { model: value } })));
    const apiKeyInput = document.createElement('input');
    apiKeyInput.type = 'password';
    apiKeyInput.autocomplete = 'off';
    apiKeyInput.placeholder = ui.peek_api_key_placeholder || '';
    apiKeyInput.value = sp.apiKey || '';
    apiKeyInput.addEventListener('change', () => patch({ screenPeek: { apiKey: apiKeyInput.value } }));
    field(ui.peek_api_key || 'Gemini API key (optional)', apiKeyInput);
    const blockedInput = document.createElement('input');
    blockedInput.type = 'text';
    blockedInput.placeholder = ui.peek_blocked_placeholder || '';
    blockedInput.value = sp.blockedKeywords || '';
    blockedInput.addEventListener('change', () => patch({ screenPeek: { blockedKeywords: blockedInput.value } }));
    field(ui.peek_blocked || 'Privacy blocked keywords', blockedInput);
    make('div', 'panel-note', panel).textContent = ui.peek_privacy_note || '';

    section(ui.section_notifications || 'System notifications');
    field(ui.notif_enabled || 'Enable OS notifications', check(notif.enabled !== false, value => patch({ notifications: { enabled: value } })));
    field(ui.notif_turn_done || 'Notify on big tasks / waiting reply', check(notif.onTurnDone !== false, value => patch({ notifications: { onTurnDone: value } })));
    field(ui.notif_quota || 'Notify on low quota / refill', check(notif.onQuotaAlert !== false, value => patch({ notifications: { onQuotaAlert: value } })));

    section(ui.section_pet || 'Pet');
    field(ui.language || 'Language', select(s.language, [['auto', ui.language_auto], ['en', ui.language_en], ['zhs', ui.language_zhs]], value => patch({ language: value })));
    field(ui.size || 'Size', select(s.size, [['xs', ui.size_xs], ['s', ui.size_s], ['m', ui.size_m], ['l', ui.size_l], ['xl', ui.size_xl]], value => patch({ size: value })));
    field(ui.animation || 'Animation', select(s.animation, [['smooth', ui.animation_smooth], ['balanced', ui.animation_balanced], ['saver', ui.animation_saver]], value => patch({ animation: value })));
    field(ui.chattiness || 'Chattiness', select(s.chattiness, [['quiet', ui.chattiness_quiet], ['normal', ui.chattiness_normal], ['chatty', ui.chattiness_chatty]], value => patch({ chattiness: value })));
    field(ui.followCursor || 'Watch the cursor', check(s.followCursor, value => patch({ followCursor: value })));
    field(ui.autoCheckUpdates, check(s.autoCheckUpdates, value => patch({ autoCheckUpdates: value })));
    field(ui.quotaHoverDelayMs || 'Quota hover delay (ms)', number(s.quotaHoverDelayMs, 0, 10000, value => patch({ quotaHoverDelayMs: value })));
    field(ui.mute || 'Mute comments', check(s.muted, value => patch({ muted: value })));

    section(ui.section_sound || 'Sound effects');
    field(ui.sound_enabled || 'Enable sound effects', check(snd.enabled !== false, value => patch({ sound: { enabled: value } })));
    soundPackSelectEl = document.createElement('select');
    renderSoundPackOptions();
    soundPackSelectEl.addEventListener('change', () => {
      const value = soundPackSelectEl.value;
      patch({ sound: { pack: value } });
      sound.play('press', { ...settings.sound, pack: value });
    });
    field(ui.sound_pack || 'Sound pack', soundPackSelectEl);
    const volWrap = document.createElement('span');
    volWrap.className = 'range-wrap';
    const volSlider = document.createElement('input');
    volSlider.type = 'range';
    volSlider.min = 0;
    volSlider.max = 100;
    volSlider.value = Math.round((snd.volume ?? 0.65) * 100);
    const volLabel = document.createElement('span');
    volLabel.className = 'range-val';
    volLabel.textContent = `${volSlider.value}%`;
    volSlider.addEventListener('input', () => { volLabel.textContent = `${volSlider.value}%`; });
    volSlider.addEventListener('change', () => {
      const volume = Number(volSlider.value) / 100;
      patch({ sound: { volume } });
      sound.play('press', { ...settings.sound, volume });
    });
    volWrap.append(volSlider, volLabel);
    field(ui.sound_volume || 'Volume', volWrap);
    const soundBtnRow = make('div', 'panel-btn-row', panel);
    const openSoundBtn = make('button', 'panel-btn', soundBtnRow);
    openSoundBtn.type = 'button';
    openSoundBtn.textContent = ui.sound_open_dir || 'Open sound/ folder';
    openSoundBtn.addEventListener('click', () => send({ type: 'open_sound_dir' }));
    make('div', 'panel-note', panel).textContent = ui.sound_hint || '';

    section(ui.section_ai || 'AI comments');
    field(ui.ai_enabled || 'Use AI', check(ai.enabled, value => patch({ ai: { enabled: value } })));
    const choices = [...new Set([ai.model, ...modelChoices])].filter(Boolean).map(label => [label, label]);
    field(ui.ai_model || 'Model', select(ai.model, choices, value => patch({ ai: { model: value } })));
    field(ui.ai_contextLevel || 'What she can see', select(ai.contextLevel, [['minimal', ui.context_minimal], ['titles', ui.context_titles], ['snippets', ui.context_snippets]], value => patch({ ai: { contextLevel: value } })));
    field(ui.ai_minIntervalMin || 'Minutes between', number(ai.minIntervalMin, 1, 1440, value => patch({ ai: { minIntervalMin: value } })));
    field(ui.ai_maxPerHour || 'Max per hour', number(ai.maxPerHour, 0, 60, value => patch({ ai: { maxPerHour: value } })));
    field(ui.ai_maxPerDay || 'Max per day', number(ai.maxPerDay, 0, 500, value => patch({ ai: { maxPerDay: value } })));
    field(ui.ai_dailyTokenBudget || 'Daily token budget', number(ai.dailyTokenBudget, 0, 500000, value => patch({ ai: { dailyTokenBudget: value } })));
    field(ui.ai_pauseBelowQuota || 'Stop below quota %', number(Math.round((ai.pauseBelowQuota ?? 0.1) * 100), 0, 100, value => patch({ ai: { pauseBelowQuota: value / 100 } })));
    field(ui.ai_onlyWhenFocused || 'Only when focused', check(ai.onlyWhenFocused, value => patch({ ai: { onlyWhenFocused: value } })));
    const persona = document.createElement('textarea');
    personaTextareaEl = persona;
    persona.rows = 3;
    persona.maxLength = 600;
    persona.value = ai.personaExtra ?? '';
    persona.addEventListener('change', () => patch({ ai: { personaExtra: persona.value } }));
    field(ui.ai_personaExtra || 'Character persona', persona);
    const personaBtnRow = make('div', 'panel-btn-row', panel);
    const resetPersonaBtn = make('button', 'panel-btn', personaBtnRow);
    resetPersonaBtn.type = 'button';
    resetPersonaBtn.textContent = ui.ai_persona_reset || 'Restore default Hagemi-nyan persona';
    resetPersonaBtn.addEventListener('click', () => {
      sound.play('press', settings.sound);
      send({ type: 'persona_reset' });
    });

    section(ui.section_ledger || "Today's ledger");
    ledgerNoteEl = make('div', 'panel-note', panel);
    usageNoteEl = make('div', 'panel-note', panel);
    ledgerTrendEl = make('div', '', panel);
    renderPanelLedger();
    const ledgerBtnRow = make('div', 'panel-btn-row', panel);
    const resetLedgerBtn = make('button', 'panel-btn', ledgerBtnRow);
    resetLedgerBtn.type = 'button';
    resetLedgerBtn.textContent = ui.ledger_reset || "Reset today's ledger";
    resetLedgerBtn.addEventListener('click', () => {
      sound.play('press', settings.sound);
      send({ type: 'ledger_reset' });
    });
    const exportBtn = make('button', 'panel-btn', ledgerBtnRow);
    exportBtn.type = 'button';
    exportBtn.textContent = ui.backup_export || '📤 Export backup';
    exportBtn.addEventListener('click', () => {
      sound.play('press', settings.sound);
      send({ type: 'backup_export' });
    });
    const importBtn = make('button', 'panel-btn', ledgerBtnRow);
    importBtn.type = 'button';
    importBtn.textContent = ui.backup_import || '📥 Import backup';
    importBtn.addEventListener('click', () => {
      sound.play('press', settings.sound);
      send({ type: 'backup_import_request' });
    });

    section(ui.section_licenses || 'Credits and licenses');
    for (const key of ['license_code', 'license_art', 'license_inspired', 'license_fan']) make('div', 'panel-note', panel).textContent = ui[key] || '';
    const links = make('div', 'panel-note', panel);
    for (const [key, href] of [['license_link_crosspet', 'https://github.com/lokicorvus/crosspet'], ['license_link_art', 'https://creativecommons.org/licenses/by-nc-sa/4.0/']]) {
      const link = make('a', 'panel-link', links);
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = ui[key] || href;
    }

    panel.classList.add('show');
    if (!wasOpen) {
      const width = panel.offsetWidth || 324, height = panel.offsetHeight || 520;
      const left = x + spriteW * 0.5 + width + 10 < viewW() ? x + spriteW * 0.5 : Math.max(8, x - spriteW * 0.5 - width);
      panel.style.transform = `translate3d(${Math.round(clamp(left, 8, viewW() - width - 8))}px, ${Math.round(clamp(y - height / 2, 8, Math.max(8, viewH() - height - 8)))}px, 0)`;
    }
    if (focusSection && sectionEls[focusSection]) {
      const targetEl = sectionEls[focusSection];
      setTimeout(() => {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        targetEl.classList.remove('flash');
        void targetEl.offsetWidth;
        targetEl.classList.add('flash');
      }, 40);
    }
    if (notify && !wasOpen) send({ type: 'panelOpened' });
    syncDesktopInput(true);
  }

  function closePanel() {
    if (!panel.classList.contains('show')) return;
    panel.classList.remove('show');
    updateCard = null;
    ledgerNoteEl = null;
    ledgerTrendEl = null;
    soundPackSelectEl = null;
    usageNoteEl = null;
    syncDesktopInput(false);
  }
  for (const type of ['keydown', 'keyup', 'keypress']) listen(panel, type, event => { event.stopPropagation(); if (event.key === 'Escape') closePanel(); });

  function patch(change) {
    settings = {
      ...settings,
      ...change,
      chat: { ...settings.chat, ...change.chat },
      screenPeek: { ...settings.screenPeek, ...change.screenPeek },
      notifications: { ...settings.notifications, ...change.notifications },
      sound: { ...settings.sound, ...change.sound },
      ai: { ...settings.ai, ...change.ai },
    };
    if (!settings.roamEnabled) stopRoam();
    applyTheme();
    applyVisibility();
    applySize();
    placeQuotaBadge(true);
    send({ type: 'settings', patch: change });
  }
  function applyVisibility() {
    const hidden = settings.hidden || (settings.hiddenUntil && Date.now() < settings.hiddenUntil);
    stage.style.display = hidden ? 'none' : 'block';
    const baseOpacity = Number.isFinite(settings.opacity) ? clamp(settings.opacity, 0.5, 1) : 1;
    stage.style.opacity = String(settings.ghostMode ? Math.max(0.28, baseOpacity * 0.42) : baseOpacity);
    stage.classList.toggle('ghost-mode', !!settings.ghostMode);
    if (hidden || settings.ghostMode) { closeMenu(); closePanel(); closeChatBar(); unpinHud(); hideHud(); }
    if (hidden) closeBubble();
    placeQuotaBadge(true);
  }

  // ---- Touch: pokes, pats, shakes, a short temper -----------------------------------------
  let annoyance = 0, rub = 0, lastRub = { x: 0, y: 0, at: 0 }, pettedUntil = 0, sulking = false;
  const inHead = py => py < y - spriteH * 0.06;
  function petted() {
    const now = performance.now();
    stopRoam();
    sound.play('pat', settings.sound);
    if (sulking) {
      sulking = false;
      annoyance = 0;
      animator.clearOverride('sulk');
      animator.override('coaxed', 1700, () => animator.override('forgiven', 2200));
      send({ type: 'touch', kind: 'coax' });
      return;
    }
    if (now > pettedUntil) send({ type: 'touch', kind: 'pet' });
    pettedUntil = now + 2400;
    animator.override('petted', 2400);
    if (Math.random() < 0.5) fx.burst('hearts', STAGE.cx, 400, 3);
    annoyance = Math.max(0, annoyance - 1.5);
  }
  function poked(head) {
    stopRoam();
    if (head) { petted(); return; }
    if (sulking) { animator.play('recoil'); return; }
    annoyance += 1;
    if (annoyance >= 7) {
      sulking = true;
      animator.override('sulk', 14000, () => { sulking = false; annoyance = 0; });
      send({ type: 'touch', kind: 'sulk' });
    } else if (annoyance >= 5.5) {
      animator.override('redhot', 2400);
      fx.burst('steam', STAGE.cx, 400);
      send({ type: 'touch', kind: 'redhot' });
    } else if (annoyance >= 4) {
      animator.override('puffed', 2600);
      animator.play('squish');
      send({ type: 'touch', kind: 'puffed' });
    } else if (annoyance >= 2.5) {
      animator.override('annoyed', 2200);
      animator.play('shake');
      send({ type: 'touch', kind: 'annoyed' });
    } else {
      animator.override('surprised', 1100);
      animator.play('gasp');
      send({ type: 'touch', kind: 'poke' });
    }
  }

  function updateHitTest(event) {
    if (dragging) { syncDesktopInput(true); return; }
    const originX = x - (STAGE.w / 2) * scale, originY = y - (STAGE.h / 2) * scale;
    const artX = (event.clientX - originX) / scale, artY = (event.clientY - originY) / scale;
    const overPet = stage.style.display !== 'none' && rig.opaqueAt(current, artX, artY);
    const value = overPet ? 'auto' : 'none';
    if (hit.style.pointerEvents !== value) hit.style.pointerEvents = value;
    const overUi = isOverUi(event.clientX, event.clientY);
    syncDesktopInput(overPet || overUi);
  }

  let lastClickAt = 0, shakeFlips = 0, shakeSign = 0, shakeClock = 0;
  listen(hit, 'pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    hit.setPointerCapture(event.pointerId);
    stopRoam();
    sound.play('press', settings.sound);
    clearTimeout(hoverTimer);
    dragging = { id: event.pointerId, startX: event.clientX, startY: event.clientY, offsetX: event.clientX - x, offsetY: event.clientY - y, moved: false, at: performance.now(), px: event.clientX, py: event.clientY };
    closeBubble();
    unpinHud();
    hideHud();
    syncDesktopInput(true);
  });
  listen(hit, 'pointermove', event => {
    if (!dragging || event.pointerId !== dragging.id) return;
    if (!dragging.moved && Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY) > 4) {
      dragging.moved = true;
      if (docked) {
        dragging.offsetX = 0;
        dragging.offsetY = 0;
        docked = null;
      }
      animator.override('dragged', 1e9);
      send({ type: 'touch', kind: 'grab' });
    }
    dragging.px = event.clientX;
    dragging.py = event.clientY;
    // Multi-monitor drag handoff: if user drags tightly against screen edge, check adjacent display.
    if (dragging.moved && desktopApi?.edgeCheck) {
      const now = performance.now();
      if ((event.clientX <= 3 || event.clientX >= viewW() - 4 || event.clientY <= 3 || event.clientY >= viewH() - 4) && now - lastEdgeCheckAt > 220) {
        lastEdgeCheckAt = now;
        desktopApi.edgeCheck(event.screenX, event.screenY);
      }
    }
  });
  const endDrag = event => {
    if (!dragging || (event.pointerId !== undefined && event.pointerId !== dragging.id)) return;
    const now = performance.now(), wasDrag = dragging.moved, heldAt = dragging.at, startY = dragging.startY;
    dragging = null;
    sound.play('release', settings.sound);
    if (wasDrag) {
      animator.clearOverride('dragged');
      if (shakeFlips >= 4) {
        animator.override('dizzy', 3200);
        send({ type: 'touch', kind: 'shaken' });
      } else if (x < spriteW * 0.2 || x > viewW() - spriteW * 0.2) {
        docked = x < spriteW * 0.2 ? 'left' : 'right';
        vx = vy = 0;
        keepInBounds();
        savePosition();
      } else if (Math.hypot(vx, vy) > 1100) {
        animator.override('surprised', 700);
      }
      shakeFlips = 0;
    } else if (now - heldAt < 400) {
      const isDouble = now - lastClickAt < 320;
      lastClickAt = now;
      if (isDouble) {
        animator.override('gift', 1200);
        send({ type: 'talk' });
      } else {
        poked(inHead(startY));
      }
    }
    syncDesktopInput(false);
  };
  listen(hit, 'pointerup', endDrag);
  listen(hit, 'pointercancel', endDrag);
  listen(hit, 'contextmenu', event => { event.preventDefault(); openMenu(event.clientX, event.clientY); });
  listen(hit, 'pointerenter', () => {
    if (hudPinned) return;
    clearTimeout(hoverTimer);
    if (settings.quotaHoverDelayMs === 0) showHud();
    else hoverTimer = setTimeout(showHud, settings.quotaHoverDelayMs);
  });
  listen(hit, 'pointerleave', () => { clearTimeout(hoverTimer); hideHud(); });
  listen(hit, 'pointermove', event => {
    if (dragging || !inHead(event.clientY)) return;
    const now = performance.now();
    if (now - lastRub.at > 420) { rub = 0; lastRub = { x: event.clientX, y: event.clientY, at: now }; }
    rub += Math.hypot(event.clientX - lastRub.x, event.clientY - lastRub.y);
    lastRub = { x: event.clientX, y: event.clientY, at: now };
    if (rub > 260) { rub = 120; petted(); }
  });

  let pointerX = 0, pointerY = 0;
  listen(window, 'pointermove', event => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    lastPointerAt = performance.now();
    updateHitTest(event);
  }, { passive: true, capture: true });
  listen(window, 'keydown', () => { lastKeyAt = performance.now(); }, { passive: true, capture: true });
  listen(window, 'resize', () => { applySize(); settle(); placeQuotaBadge(true); }, { passive: true });

  const presence = () => send({
    type: 'presence',
    visible: isDesktop ? stage.style.display !== 'none' : !document.hidden,
    focused: isDesktop ? true : document.hasFocus(),
    idleMs: Math.round(performance.now() - Math.max(lastPointerAt, lastKeyAt)),
    language: navigator.language,
  });
  listen(document, 'visibilitychange', presence);
  listen(window, 'focus', presence);
  listen(window, 'blur', presence);
  const presenceTimer = setInterval(presence, 15000);

  // ---- Frame loop -----------------------------------------------------------------------
  let lastFrame = performance.now(), t = rand(0, 100), raf = 0;
  let saveTimer = 0, savedAt = { x: -1, y: -1 }, lastMessageAt = performance.now();

  function savePosition() {
    savedAt = { x, y };
    anchor = { x: x / viewW(), y: y / viewH() };
    settings.position = docked ? { ...anchor, dock: docked } : anchor;
    send({ type: 'settings', patch: { position: settings.position } });
  }

  function stepRoam(dt) {
    if (!settings.roamEnabled || dragging || docked || sulking || isModalOpen() || speech || Math.hypot(vx, vy) > 4) {
      if (roam) roam = null;
      return;
    }
    const quietState = ['idle', 'float', 'hum'].includes(animator.state);
    if (!quietState) { roam = null; return; }
    if (!roam) {
      roamCooldown -= dt;
      if (roamCooldown > 0) return;
      const minX = spriteW * 0.45, maxX = Math.max(minX + 10, viewW() - spriteW * 0.45);
      const minY = Math.max(spriteH * 0.4, viewH() - spriteH * 1.15);
      const maxY = Math.max(minY + 4, viewH() - spriteH * 0.48);
      let targetX = rand(minX, maxX);
      if (Math.abs(targetX - x) < 140 && maxX - minX > 320) {
        targetX = x < (minX + maxX) / 2 ? rand(Math.min(maxX, x + 160), maxX) : rand(minX, Math.max(minX, x - 160));
      }
      const targetY = rand(minY, maxY);
      roam = { targetX, targetY, speed: rand(52, 78) };
      animator.override(Math.random() < 0.65 ? 'float' : 'hum', 6500);
      return;
    }
    const dx = roam.targetX - x, dy = roam.targetY - y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) {
      x = roam.targetX;
      y = roam.targetY;
      roam = null;
      roamCooldown = rand(18, 36);
      return;
    }
    const step = Math.min(dist, roam.speed * dt);
    x += (dx / dist) * step;
    y += (dy / dist) * step;
    keepInBounds();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!host.isConnected) { dispose(); return; }
    if ((!isDesktop && document.hidden) || stage.style.display === 'none') { lastFrame = now; return; }
    const lively = animator.busy || dragging || roam || Math.hypot(vx, vy) > 3 || speech || fade < 1;
    const fpsCap = panel.classList.contains('show') ? 24 : settings.animation === 'saver' ? 20 : settings.animation === 'smooth' || lively ? 60 : 30;
    if (now - lastFrame < 1000 / fpsCap - 2) return;
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    t += dt;
    if (!anchor) settle();

    if (dragging && dragging.moved) {
      const goalX = dragging.px - dragging.offsetX, goalY = dragging.py - dragging.offsetY;
      const nextX = lerp(x, goalX, 1 - Math.exp(-dt * 24)), nextY = lerp(y, goalY, 1 - Math.exp(-dt * 24));
      vx = (nextX - x) / Math.max(dt, 0.001);
      vy = (nextY - y) / Math.max(dt, 0.001);
      x = nextX;
      y = nextY;
      shakeClock += dt;
      const sign = Math.sign(vx);
      if (Math.abs(vx) > 700 && sign && sign !== shakeSign) { shakeSign = sign; shakeFlips++; shakeClock = 0; }
      if (shakeClock > 0.6) shakeFlips = 0;
    } else if (!dragging && !docked) {
      x += vx * dt;
      y += vy * dt;
      const friction = Math.exp(-dt * 2.6);
      vx *= friction;
      vy *= friction;
      const minX = spriteW * 0.22, maxX = viewW() - spriteW * 0.22, minY = spriteH * 0.2, maxY = viewH() - spriteH * 0.2;
      let bumped = 0;
      if (x < minX) { bumped = Math.abs(vx); x = minX; vx = Math.abs(vx) * 0.55; }
      if (x > maxX) { bumped = Math.abs(vx); x = maxX; vx = -Math.abs(vx) * 0.55; }
      if (y < minY) { bumped = Math.max(bumped, Math.abs(vy)); y = minY; vy = Math.abs(vy) * 0.55; }
      if (y > maxY) { bumped = Math.max(bumped, Math.abs(vy)); y = maxY; vy = -Math.abs(vy) * 0.55; }
      if (bumped > 420) {
        animator.play('squish');
        if (animator.state !== 'dizzy') animator.override('oops', 800);
        fx.burst('dust', STAGE.cx, 400, 6);
      }
      if (Math.abs(vx) < 2) vx = 0;
      if (Math.abs(vy) < 2) vy = 0;
      stepRoam(dt);
    }

    const ratio = window.devicePixelRatio || 1, snap = value => Math.round(value * ratio) / ratio;
    if (ratio !== screenRatio) applySize();
    stage.style.transform = `translate3d(${snap(x - (STAGE.w / 2 + MARGIN) * scale)}px, ${snap(y - (STAGE.h / 2 + MARGIN) * scale)}px, 0)`;

    if (!dragging && !roam && !vx && !vy && (Math.abs(x - savedAt.x) > 1 || Math.abs(y - savedAt.y) > 1)) {
      saveTimer += dt;
      if (saveTimer > 0.6) { saveTimer = 0; savePosition(); }
    }

    if (docked && !dragging) {
      const peeking = animator.state === `dock${docked === 'left' ? 'Left' : 'Right'}Peek`;
      const reach = (peeking ? 380 : 310) * scale;
      const near = Math.abs(pointerX - x) < reach && Math.abs(pointerY - y) < spriteH * 0.5 && now - lastPointerAt < 2000;
      const dockState = `dock${docked === 'left' ? 'Left' : 'Right'}${near ? 'Peek' : ''}`;
      animator.override(dockState, 1200);
    }

    const frameData = animator.update(dt, t, { vx: roam ? (roam.targetX - x) * 0.8 : vx, vy });
    const { P } = frameData;
    usePose(frameData.poseName);

    if (settings.followCursor) {
      const fresh = now - lastPointerAt < 3500;
      if (fresh && !['sleeping', 'sulk', 'exhausted'].includes(frameData.activeName)) {
        const dx = (pointerX - x) / 420, dy = (pointerY - (y - spriteH * 0.2)) / 340;
        const weight = frameData.activeName === 'idle' ? 1 : 0.35;
        P.lookX = lerp(P.lookX, clamp(dx, -1, 1), weight);
        P.lookY = lerp(P.lookY, clamp(dy, -1, 1), weight);
        P.head += clamp(dx, -1, 1) * 0.04 * weight;
      }
    }
    if (now - lastKeyAt < 1600 && frameData.activeName === 'idle') P.lookY = lerp(P.lookY, 0.85, 0.75);

    if (fade < 1) {
      fade = Math.min(1, (now - fadeStart) / FADE_MS);
      if (fade >= 1) previous = null;
    }
    rig.draw(current, previous, fade, P, t, frameData.blink, pixelRatio, scale);
    fx.draw(dt, t, scale * pixelRatio, MARGIN * scale * pixelRatio, { shiftX: P.shiftX, shiftY: P.shiftY, bob: P.bob, sleeping: frameData.sleeping });

    stepSpeech(dt, now);
    if (speech) placeBubble();
    if (hud.classList.contains('show') && (dragging || roam || Math.hypot(vx, vy) > 1)) placeHud();
    placeQuotaBadge(false);

    if (!options.standalone && now - lastMessageAt > 90000 && !leaving) leave();
    if (leaving && now > leaving) dispose();
  }

  function leave() {
    if (leaving) return;
    leaving = performance.now() + 1250;
    closeBubble();
    unpinHud();
    hideHud();
    animator.override('bye', 1400);
    animator.play('leave');
  }

  function dispose() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    clearInterval(presenceTimer);
    clearTimeout(hoverTimer);
    clearTimeout(badgeSpinTimer);
    clearTimeout(subCloseTimer);
    abort.abort();
    rig.destroy();
    fx.clear();
    sound.destroy();
    host.remove();
  }

  function receive(message) {
    lastMessageAt = performance.now();
    switch (message.t) {
      case 'hello':
        settings = {
          ...settings,
          ...message.settings,
          chat: { ...settings.chat, ...message.settings?.chat },
          screenPeek: { ...settings.screenPeek, ...message.settings?.screenPeek },
          notifications: { ...settings.notifications, ...message.settings?.notifications },
          sound: { ...settings.sound, ...message.settings?.sound },
        };
        ui = message.ui || ui;
        refreshChatBarLabels();
        if (personaTextareaEl && document.activeElement !== personaTextareaEl && settings.ai?.personaExtra !== undefined) {
          personaTextareaEl.value = settings.ai.personaExtra;
        }
        applyTheme();
        applySize();
        placeInitial();
        applyVisibility();
        break;
      case 'settings': {
        const langChanged = message.ui && message.ui.close !== ui.close;
        settings = {
          ...settings,
          ...message.settings,
          chat: { ...settings.chat, ...message.settings?.chat },
          screenPeek: { ...settings.screenPeek, ...message.settings?.screenPeek },
          notifications: { ...settings.notifications, ...message.settings?.notifications },
          sound: { ...settings.sound, ...message.settings?.sound },
        };
        ui = message.ui || ui;
        refreshChatBarLabels();
        if (!settings.roamEnabled) stopRoam();
        if (personaTextareaEl && document.activeElement !== personaTextareaEl && settings.ai?.personaExtra !== undefined) {
          personaTextareaEl.value = settings.ai.personaExtra;
        }
        applyTheme();
        if (langChanged && panel.classList.contains('show')) {
          const scroll = panel.scrollTop;
          openPanel({ notify: false });
          panel.scrollTop = scroll;
        }
        applySize();
        applyVisibility();
        break;
      }
      case 'art':
        receiveArt(message.name, message.data);
        break;
      case 'update':
        updateState = message.update || updateState;
        renderUpdate();
        break;
      case 'sounds':
        soundPacks = message.packs || [];
        sound.setPacks(soundPacks);
        renderSoundPackOptions();
        break;
      case 'ledger':
        ledgerSummary = message.summary || null;
        renderPanelLedger();
        if (hud.classList.contains('show') && hudPinned) { renderHud(); placeHud(); }
        break;
      case 'facts':
        if (!sulking) animator.setState(message.state);
        animator.setMood({ quota: message.quota || 'ok', late: !!message.late, stashLevel: message.stashLevel ?? null, stashLabel: message.stashLabel || '', subagents: message.subagents || 0 });
        hudRows = message.hud || [];
        updateQuotaBadge(message.stashLevel, message.stashLabel, message.quota || 'ok');
        if (hud.classList.contains('show')) { renderHud(); placeHud(); }
        break;
      case 'react':
        if (message.state && !sulking && !dragging && !docked) animator.override(message.state, message.ms || 2600);
        if (message.gesture) for (const name of [].concat(message.gesture)) animator.play(name);
        if (message.burst) {
          for (const name of [].concat(message.burst)) fx.burst(name, STAGE.cx, 400);
          if (['confetti', 'fish'].includes(message.burst)) sound.play('chime', settings.sound);
        }
        break;
      case 'say':
        if (settings.muted && !message.force) break;
        speechQueue.push({ text: message.text, mood: message.mood, ai: message.ai, ms: message.ms, queuedAt: performance.now() });
        if (speechQueue.length > 2) speechQueue.shift();
        break;
      case 'models':
        modelChoices = message.models || modelChoices;
        usage = message.usage || usage;
        renderPanelLedger();
        break;
      case 'center':
        centerPet(message.frac || null);
        break;
      case 'quota_show':
        triggerQuotaCheck({ toggle: false });
        break;
      case 'open_chat':
        openChatBar();
        break;
      case 'chat_done':
        chatBusy = false;
        refreshChatBarLabels();
        if (chatBar.classList.contains('show')) { try { chatInput.focus(); } catch {} }
        break;
      case 'open_settings':
        openPanel({ notify: true });
        break;
      case 'heartbeat':
        applyVisibility();
        break;
      case 'bye':
        leave();
        break;
      default:
        break;
    }
  }

  document.documentElement.appendChild(host);
  hit.style.pointerEvents = 'none';
  applySize();
  placeInitial();
  usePose('idle');
  preloadClones();
  raf = requestAnimationFrame(frame);
  presence();
  send({ type: 'ready' });
  return { receive, dispose, animator, centerPet, get position() { return { x, y }; } };
};
