// Sidecar & Desktop backend entry point: watches Antigravity, tracks quota & today's ledger,
// scans custom sound packs, and drives either the Electron desktop overlay, the in-app CDP pet, or both.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Brain, Budget, ModelResolver } from './lib/brain.mjs';
import { RendererBridge } from './lib/cdp.mjs';
import { ChatSession } from './lib/chat.mjs';
import { DesktopBridge } from './lib/desktop-bridge.mjs';
import { ambientTriggers, chooseState, classifyTurnEnd, festival, isLate, modelFamily, REACTIONS, timeOfDay } from './lib/director.mjs';
import { UsageLedger } from './lib/ledger.mjs';
import { fill, pickLine, resolveLanguage, UI } from './lib/lines.mjs';
import { LanguageServer } from './lib/ls-client.mjs';
import { Monitor } from './lib/monitor.mjs';
import { DEFAULT_PERSONA_EXTRA, estimateTokens, parseReply } from './lib/persona.mjs';
import { formatDuration, isResetSoon, levelForModel, parseQuota, quotaEvents, quotaRows, summarize } from './lib/quota.mjs';
import { readArt } from './lib/renderer-source.mjs';
import { analyzeScreenWithGemini, buildScreenPeekPrompt, getActiveWindow, isSensitiveWindow } from './lib/screen-peek.mjs';
import { SettingsStore } from './lib/settings.mjs';
import { ensureSoundDir, scanSoundPacks } from './lib/sounds.mjs';
import { Updater, UPDATE_INTERVAL_MS } from './lib/updater.mjs';

const MINUTE = 60000;
const log = message => console.log(`[hagemi] ${message}`);

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOUND_DIR = ensureSoundDir(join(PROJECT_ROOT, 'sound'));
const HOSTED_BY_ELECTRON = process.argv.includes('--electron-host');

const geminiDir = process.env.ANTIGRAVITY_GEMINI_DIR || join(homedir(), '.gemini');
const appDataDir = resolve(geminiDir, process.env.ANTIGRAVITY_APP_DATA_DIR || 'antigravity');
const dataDir = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR || join(appDataDir, 'sidecar_data', 'hagemi-pet-desktop', 'pet', 'data');

// Move cwd out of plugin folder so updates/uninstalls on Windows never lock the directory.
try { mkdirSync(dataDir, { recursive: true }); process.chdir(dataDir); } catch {}

const settings = new SettingsStore(join(dataDir, 'settings.json'));
const budget = new Budget(join(dataDir, 'budget.json'));
const ledger = new UsageLedger(join(dataDir, 'ledger.json'));
const chatSession = new ChatSession();
const ls = new LanguageServer();
const models = new ModelResolver(ls);

let appLanguage = 'zh-CN';
let facts = { running: 0, subagents: 0, category: null, idleMs: 0, quietMs: 0, connected: false };
let quota = { level: null, mood: 'ok', buckets: [], resetInMs: null };
let allBuckets = [];
let presence = { visible: true, focused: true, idleMs: 0 };
let selectedModel = null;
let activeSince = null, lastToolAt = 0;
let lastFactsJson = '', lastLoggedState = null, lastState = null;
let electronChild = null;

const language = () => resolveLanguage(settings.value.language, appLanguage);
const ui = () => UI[language()];
const quotaOptions = () => ({ lowAt: settings.value.quota.lowAt, criticalAt: settings.value.quota.criticalAt, resetSoonMs: settings.value.quota.resetSoonMin * MINUTE });

const cdpBridge = new RendererBridge({ onMessage: onPetMessage, log });
const desktopBridge = new DesktopBridge({ onMessage: onPetMessage, soundDir: SOUND_DIR, log });

const bridge = {
  post(session, message) {
    if (session?.kind === 'desktop') desktopBridge.broadcastAll(message);
    else cdpBridge.post(session, message);
  },
  broadcast(message) {
    cdpBridge.broadcast(message);
    desktopBridge.broadcast(message);
  },
  remount(session) {
    if (session?.kind !== 'desktop') cdpBridge.remount(session);
  },
};

function openSoundFolder() {
  ensureSoundDir(SOUND_DIR);
  try {
    if (process.platform === 'win32') {
      spawn('explorer.exe', [SOUND_DIR], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [SOUND_DIR], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [SOUND_DIR], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (error) {
    log(`open sound folder failed: ${error.message}`);
  }
}

function resolveElectronBinary() {
  try {
    const req = createRequire(join(PROJECT_ROOT, 'package.json'));
    const bin = req('electron');
    return typeof bin === 'string' && existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
}

function ensureElectronOverlay() {
  if (HOSTED_BY_ELECTRON || electronChild || !desktopBridge.url) return;
  const electronBin = resolveElectronBinary();
  if (!electronBin) {
    log('electron not installed in project; falling back to in-app CDP mode');
    cdpBridge.start();
    return;
  }
  const entry = join(PROJECT_ROOT, 'electron', 'main.cjs');
  if (!existsSync(entry)) return;
  const env = {
    ...process.env,
    HAGEMI_BRIDGE_URL: desktopBridge.url,
    HAGEMI_SOUND_DIR: SOUND_DIR,
    HAGEMI_DATA_DIR: dataDir,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  electronChild = spawn(electronBin, [PROJECT_ROOT], {
    cwd: PROJECT_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
  });
  electronChild.stdout?.on('data', chunk => {
    const line = String(chunk).trim();
    if (line) log(`electron: ${line}`);
  });
  electronChild.stderr?.on('data', chunk => {
    const line = String(chunk).trim();
    if (line) log(`electron stderr: ${line}`);
  });
  electronChild.on('error', err => log(`electron spawn error: ${err.message}`));
  electronChild.on('exit', (code, signal) => {
    log(`electron exited (code=${code}, signal=${signal})`);
    electronChild = null;
  });
  log('launched Electron desktop overlay');
}

async function applyDisplayMode() {
  const mode = settings.value.displayMode || 'desktop';
  if (mode === 'desktop') {
    await cdpBridge.stop();
    await desktopBridge.start();
    ensureElectronOverlay();
  } else if (mode === 'app') {
    await desktopBridge.start();
    cdpBridge.start();
  } else {
    await desktopBridge.start();
    ensureElectronOverlay();
    cdpBridge.start();
  }
}

const updater = new Updater({
  root: PROJECT_ROOT,
  installedRoot: join(geminiDir, 'config', 'plugins', 'hagemi-pet-desktop'),
  log,
  onChange: update => bridge.broadcast({ t: 'update', update }),
  onInstalled: () => {
    bridge.broadcast({ t: 'react', state: 'happy', gesture: 'hop', burst: 'sparkles' });
    setTimeout(shutdown, 1500);
  },
});
updater.local().then(local => updater.publish(local));

const brain = new Brain({
  ls, budget, models, log,
  getSettings: () => settings.value,
  getLanguage: language,
  getPresence: () => presence,
  getQuotaLevel: () => levelForModel(allBuckets, models.resolve(settings.value.ai.model)?.label || settings.value.ai.model),
  say: (result, trigger) => {
    bridge.broadcast({ t: 'say', text: result.text, mood: result.mood, ai: result.ai, force: trigger === 'greet' });
    if (process.env.HAGEMI_DEBUG) log(`${trigger}${result.ai ? ' (ai)' : ''}: ${result.text}`);
  },
});

function broadcastLedger() {
  bridge.broadcast({ t: 'ledger', summary: ledger.summary(budget.usage) });
}

function broadcastSounds(session = null) {
  const payload = { t: 'sounds', packs: scanSoundPacks(SOUND_DIR) };
  if (session) bridge.post(session, payload);
  else bridge.broadcast(payload);
}

function hudRows() {
  const strings = ui();
  const rows = quotaRows(quota.buckets, strings, language());
  rows.push({ label: strings.hud_agents, value: facts.subagents ? fill(strings.hud_subagents, facts) : facts.running ? fill(strings.hud_running, facts) : strings.hud_idle });
  const usage = budget.usage;
  if (settings.value.ai.enabled) rows.push({ label: strings.hud_comments, value: `${usage.calls}/${settings.value.ai.maxPerDay} · ~${usage.tokens}` });
  const led = ledger.summary(usage);
  rows.push({ divider: true });
  rows.push({ label: strings.hud_today_used, value: `~${led.maxUsedPct}%` });
  rows.push({ label: strings.hud_today_turns, value: fill(strings.hud_today_turns_val, { turns: led.turnsDone, tools: led.toolCalls }) });
  if (!facts.connected) rows.push({ label: 'Antigravity', value: strings.hud_unavailable });
  return rows;
}

function publishFacts(force = false) {
  const idleMs = Math.min(facts.idleMs || 0, presence.visible ? presence.idleMs : Infinity);
  const state = chooseState({ ...facts, idleMs }, quota, { resetSoon: isResetSoon(quota, quotaOptions()) });
  if (lastState === 'sleeping' && state !== 'sleeping') moment('wake');
  lastState = state;
  const message = {
    t: 'facts', state, quota: quota.mood === 'empty' ? 'critical' : quota.mood, late: isLate(new Date()),
    subagents: facts.subagents, stashLevel: quota.level, stashLabel: quota.level == null ? '' : `${Math.round(quota.level * 100)}%`, hud: hudRows(),
  };
  const json = JSON.stringify(message);
  if (process.env.HAGEMI_DEBUG && state !== lastLoggedState) {
    lastLoggedState = state;
    log(`state: ${state} (running ${facts.running}, subagents ${facts.subagents}, tool ${facts.lastTool || '-'}, category ${facts.category || '-'})`);
  }
  if (force || json !== lastFactsJson) {
    lastFactsJson = json;
    bridge.broadcast(message);
  } else bridge.broadcast({ t: 'heartbeat' });
}

function act(trigger) {
  const reaction = REACTIONS[trigger]?.react;
  if (reaction) bridge.broadcast({ t: 'react', ...reaction });
}

function context(extra = {}) {
  return {
    running: facts.running, subagents: facts.subagents, lastTool: facts.lastTool, toolCount: facts.toolCount, title: facts.title,
    userText: facts.userText, agentText: facts.agentText, quotaPercent: quota.level == null ? null : Math.round(quota.level * 100), model: selectedModel?.label,
    ...extra,
  };
}

function moment(trigger, extra = {}, options = {}) {
  act(trigger);
  brain.consider(trigger, context(extra), options).catch(error => log(`remark failed: ${error.message}`));
}

function sendOsNotification(kind, title, body) {
  const n = settings.value.notifications;
  if (!n?.enabled) return;
  if ((kind === 'turn_done' || kind === 'turn_error' || kind === 'waiting') && !n.onTurnDone) return;
  if (kind.startsWith('quota') && !n.onQuotaAlert) return;
  desktopBridge.broadcastAll({ t: 'notify', kind, title, body });
}

const pendingCaptures = new Map();
let peekInFlight = false;
let chatInFlight = false;
let lastAutoPeekAt = Date.now();
let lastBreakAt = Date.now();

async function handleChatSend(userText) {
  const clean = String(userText || '').trim();
  if (!clean || chatInFlight) {
    bridge.broadcast({ t: 'chat_done' });
    return;
  }
  chatInFlight = true;
  const lang = language();
  try {
    bridge.broadcast({ t: 'react', state: 'thinking', ms: 6000 });
    const reply = await chatSession.send({
      userMessage: clean,
      chatConfig: settings.value.chat || {},
      language: lang,
      personaExtra: settings.value.ai?.personaExtra || '',
      ls,
      models,
      fallbackModel: settings.value.ai?.model || 'Gemini 3.8 Flash (Low)',
    });
    if (reply?.line) {
      if ((settings.value.chat?.provider || 'antigravity') === 'antigravity') {
        budget.record(estimateTokens(clean) + estimateTokens(reply.line));
      }
      bridge.broadcast({ t: 'say', text: reply.line, mood: reply.mood || 'happy', ai: true, force: true });
    }
  } catch (error) {
    log(`chat failed: ${error.message}`);
    const keyErr = error.message === 'missing-api-key' || error.message === 'missing-custom-config';
    const fallback = pickLine(lang, keyErr ? 'chat_no_key' : 'chat_failed');
    if (fallback) bridge.broadcast({ t: 'say', text: fallback.text, mood: fallback.mood, ai: false, force: true });
  } finally {
    chatInFlight = false;
    bridge.broadcast({ t: 'chat_done' });
  }
}

function handleBackupExport() {
  const payload = {
    app: 'hagemi-pet-desktop',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: settings.value,
    ledger: ledger.exportState(),
  };
  desktopBridge.broadcastAll({ t: 'backup_export_dialog', payload });
}

function handleBackupImportData(message) {
  const lang = language();
  if (message.error || !message.data || typeof message.data !== 'object') {
    const line = pickLine(lang, 'backup_failed');
    if (line) bridge.broadcast({ t: 'say', text: line.text, mood: line.mood, ai: false, force: true });
    return;
  }
  try {
    const beforeMode = settings.value.displayMode;
    if (message.data.settings && typeof message.data.settings === 'object') {
      settings.replaceAll(message.data.settings);
    }
    if (message.data.ledger && typeof message.data.ledger === 'object') {
      ledger.importState(message.data.ledger);
    }
    bridge.broadcast({ t: 'settings', settings: settings.value, ui: ui() });
    broadcastLedger();
    publishFacts(true);
    if (settings.value.displayMode !== beforeMode) applyDisplayMode();
    const line = pickLine(lang, 'backup_imported');
    bridge.broadcast({ t: 'react', state: 'happy', ms: 2600, gesture: 'hop', burst: 'sparkles' });
    if (line) bridge.broadcast({ t: 'say', text: line.text, mood: line.mood, ai: false, force: true });
  } catch (error) {
    log(`backup import failed: ${error.message}`);
    const line = pickLine(lang, 'backup_failed');
    if (line) bridge.broadcast({ t: 'say', text: line.text, mood: line.mood, ai: false, force: true });
  }
}

function requestScreenCapture(timeoutMs = 8000) {
  return new Promise(resolve => {
    const requestId = `cap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      pendingCaptures.delete(requestId);
      resolve({ error: 'timeout' });
    }, timeoutMs);
    pendingCaptures.set(requestId, result => {
      clearTimeout(timer);
      pendingCaptures.delete(requestId);
      resolve(result);
    });
    desktopBridge.broadcastAll({ t: 'capture_screen', requestId });
  });
}

async function handleScreenPeek({ manual = true } = {}) {
  if (peekInFlight) return;
  peekInFlight = true;
  const lang = language();
  const sp = settings.value.screenPeek || {};
  try {
    const activeWindow = await getActiveWindow();
    if (isSensitiveWindow(activeWindow, sp.blockedKeywords)) {
      if (manual) {
        const line = pickLine(lang, 'peek_sensitive');
        bridge.broadcast({ t: 'react', state: 'wink', ms: 2200, gesture: 'nod' });
        if (line) bridge.broadcast({ t: 'say', text: line.text, mood: line.mood, ai: false, force: true });
      }
      return;
    }

    bridge.broadcast({ t: 'react', state: 'searching', ms: 3400, gesture: 'lookAround' });

    const apiKey = (sp.apiKey || process.env.GEMINI_API_KEY || '').trim();
    const canCapture = desktopBridge.clients.size > 0;
    const wantVision = sp.mode === 'vision' || (sp.mode === 'auto' && Boolean(apiKey));
    let reply = null;

    if (wantVision && apiKey && canCapture) {
      const cap = await requestScreenCapture();
      if (cap?.error === 'no_permission') {
        if (manual) {
          const line = pickLine(lang, 'peek_no_permission');
          if (line) bridge.broadcast({ t: 'say', text: line.text, mood: line.mood, ai: false, force: true });
        }
        return;
      }
      if (cap?.base64Jpeg) {
        reply = await analyzeScreenWithGemini({
          apiKey,
          model: sp.model || 'gemini-3.5-flash-lite',
          base64Jpeg: cap.base64Jpeg,
          language: lang,
          activeWindow,
          recent: brain.recent.slice(-2),
          personaExtra: settings.value.ai?.personaExtra || '',
        });
      }
    }

    // Fallback to zero-key active window title commentary via Antigravity's built-in model.
    if (!reply && sp.mode !== 'vision') {
      await models.refresh().catch(() => {});
      const model = models.resolve(settings.value.ai?.model || 'Gemini 3.8 Flash (Low)');
      if (model) {
        const prompt = buildScreenPeekPrompt({
          language: lang,
          hasImage: false,
          activeWindow,
          recent: brain.recent.slice(-2),
          personaExtra: settings.value.ai?.personaExtra || '',
        });
        const response = await ls.call('GetModelResponse', { prompt, model: model.id }, 25000);
        reply = parseReply(response.response, lang);
        budget.record(estimateTokens(prompt) + estimateTokens(response.response || ''));
      }
    }

    if (reply?.line) {
      brain.recent.push(reply.line);
      if (brain.recent.length > 4) brain.recent.shift();
      bridge.broadcast({ t: 'say', text: reply.line, mood: reply.mood || 'wink', ai: true, force: true });
      lastAutoPeekAt = Date.now();
    } else if (manual) {
      const fallback = pickLine(lang, 'peek_failed');
      if (fallback) bridge.broadcast({ t: 'say', text: fallback.text, mood: fallback.mood, ai: false, force: true });
    }
  } catch (error) {
    log(`screen peek failed: ${error.message}`);
    if (manual) {
      const fallback = pickLine(lang, 'peek_failed');
      if (fallback) bridge.broadcast({ t: 'say', text: fallback.text, mood: fallback.mood, ai: false, force: true });
    }
  } finally {
    peekInFlight = false;
  }
}

function handleFeedFish() {
  const line = pickLine(language(), 'feed_fish');
  bridge.broadcast({ t: 'react', state: 'gift', ms: 3000, gesture: 'hop', burst: ['fish', 'hearts'] });
  if (line) bridge.broadcast({ t: 'say', text: line.text, mood: line.mood, ai: false, force: true });
}

function checkPeriodicReminders() {
  const now = Date.now();
  const s = settings.value;
  const hidden = s.hidden || (s.hiddenUntil && now < s.hiddenUntil);
  if (hidden) return;

  if (s.breakReminderMin > 0 && now - lastBreakAt >= s.breakReminderMin * MINUTE) {
    lastBreakAt = now;
    const line = pickLine(language(), 'break_reminder');
    const strings = ui();
    bridge.broadcast({ t: 'react', state: 'stretch', ms: 4200, gesture: 'hop', burst: 'sparkles' });
    if (line) bridge.broadcast({ t: 'say', text: line.text, mood: line.mood, ai: false, force: true });
    sendOsNotification('break', strings.notif_title_break, fill(strings.notif_body_break, { min: s.breakReminderMin }));
  }

  const peekMin = s.screenPeek?.autoIntervalMin || 0;
  if (peekMin > 0 && now - lastAutoPeekAt >= peekMin * MINUTE && !peekInFlight && facts.running === 0) {
    lastAutoPeekAt = now;
    handleScreenPeek({ manual: false });
  }
}

function onEvent(event) {
  if (process.env.HAGEMI_DEBUG) log(`event: ${event.type}${event.name ? ` ${event.name}` : ''}${event.termination ? ` ${event.termination}` : ''}${event.isSubagent ? ' (subagent)' : ''}`);
  switch (event.type) {
    case 'turn_start':
      if (!activeSince) activeSince = Date.now();
      lastToolAt = Date.now();
      moment('turn_start');
      break;
    case 'turn_end': {
      ledger.recordTurnEnd(event);
      broadcastLedger();
      const trigger = classifyTurnEnd(event);
      const strings = ui();
      if (trigger === 'turn_done_big' || (event.durationMs || 0) >= 2 * MINUTE) {
        sendOsNotification('turn_done', strings.notif_title_done, fill(strings.notif_body_done, { count: event.toolCount || 0 }));
      } else if (trigger === 'turn_error') {
        sendOsNotification('turn_error', strings.notif_title_error, strings.notif_body_error);
      }
      moment(trigger, {
        title: event.title, toolCount: event.toolCount, durationMin: Math.round((event.durationMs || 0) / MINUTE),
        userText: event.userText, agentText: event.agentText, vars: { count: event.toolCount || 0 },
      });
      publishFacts(true);
      break;
    }
    case 'tool':
      lastToolAt = Date.now();
      if (event.category === 'drawing') moment('drawing');
      break;
    case 'step_error':
      moment('step_error');
      break;
    case 'compact':
      moment('compact');
      break;
    case 'context_big':
      moment('context_big', { title: event.title });
      break;
    case 'subagent_start': {
      ledger.recordSubagentStart();
      broadcastLedger();
      const count = facts.subagents + 1;
      moment(count >= 3 ? 'subagent_many' : 'subagent_start', { vars: { count } });
      break;
    }
    case 'subagent_done':
      if (facts.subagents <= 1) moment('subagent_done');
      break;
    default:
      break;
  }
}

let previousRunning = 0, previousWaiting = false;
const monitor = new Monitor({
  ls, brainDir: join(appDataDir, 'brain'), onEvent,
  onFacts(next) {
    const now = Date.now();
    facts = { ...next, quietMs: lastToolAt ? now - lastToolAt : 0 };
    if (next.waiting && !previousWaiting) {
      moment('waiting');
      const strings = ui();
      sendOsNotification('waiting', strings.notif_title_waiting, strings.notif_body_waiting);
    }
    previousWaiting = next.waiting;
    if (next.running === 2 && previousRunning < 2) moment('busy');
    if (next.running >= 3 && previousRunning < 3) moment('swamped', { vars: { count: next.running } });
    previousRunning = next.running;
    if (next.running || next.subagents) activeSince ||= now;
    else if (next.idleMs > 10 * MINUTE) activeSince = null;
    if (next.longestRunMs > 12 * MINUTE && !monitor.longRunWarned) { monitor.longRunWarned = true; moment('long_run', { durationMin: Math.round(next.longestRunMs / MINUTE) }); }
    if (!next.running) monitor.longRunWarned = false;
    publishFacts();
  },
});
monitor.onError = error => {
  if (facts.connected) log(`monitor: ${error.message}`);
  facts = { ...facts, connected: false };
};

async function pollQuota(forcePush = false) {
  try {
    const response = await ls.call('RetrieveUserQuotaSummary');
    const now = Date.now();
    allBuckets = parseQuota(response, now);
    ledger.recordQuota(allBuckets);
    const next = summarize(allBuckets, selectedModel?.label || 'gemini', quotaOptions(), now);
    for (const event of quotaEvents(quota, next, quotaOptions())) {
      if (event.type === 'quota_ok') continue;
      const left = formatDuration(event.resetInMs, language());
      moment(event.type, { vars: { left } });
      const strings = ui();
      if (event.type === 'quota_refilled') {
        sendOsNotification('quota_refill', strings.notif_title_quota_refill, strings.notif_body_quota_refill);
      } else if (['quota_low', 'quota_critical', 'quota_empty'].includes(event.type)) {
        sendOsNotification('quota_low', strings.notif_title_quota_low, fill(strings.notif_body_quota_low, { left }));
      }
    }
    quota = next;
    broadcastLedger();
    publishFacts(forcePush);
  } catch (error) {
    log(`quota: ${error.message}`);
    if (forcePush) publishFacts(true);
  }
}

async function pollModel() {
  try {
    const state = await readFile(join(appDataDir, 'antigravity_state.pbtxt'), 'utf8');
    const id = state.match(/last_selected_agent_model:\s*(\S+)/)?.[1];
    if (!id) return;
    await models.refresh();
    const label = models.labelOf(id);
    if (!label) return;
    const next = { id, label, family: modelFamily(label) };
    const previous = selectedModel;
    selectedModel = next;
    if (previous && previous.id !== next.id) {
      if (next.family === 'claude' || next.family === 'gpt') moment(`model_rival_${next.family}`);
      else if (next.family === 'gemini' && previous.family !== 'gemini') moment('model_back');
    }
  } catch {}
}

function greet() {
  const now = new Date();
  const fest = festival(now);
  const scene = fest || `greet_${timeOfDay(now)}`;
  bridge.broadcast({ t: 'react', state: scene, ms: 4200, gesture: 'hop', burst: 'sparkles' });
  brain.consider('greet', {}, { line: scene }).catch(() => {});
}

function ambient() {
  for (const trigger of ambientTriggers({
    now: Date.now(), active: facts.running > 0, activeSinceMs: activeSince ? Date.now() - activeSince : 0,
    lastRemarkAgoMs: Date.now() - brain.lastBubbleAt, idleMs: Math.min(facts.idleMs || 0, presence.idleMs || 0),
  })) {
    moment(trigger, { vars: { name: `${new Date().getHours()}:00` } });
    break;
  }
}

let greeted = false;
function onPetMessage(message, session) {
  switch (message.type) {
    case 'ready':
      bridge.post(session, { t: 'hello', settings: settings.value, ui: ui() });
      bridge.post(session, { t: 'update', update: updater.state });
      bridge.post(session, { t: 'ledger', summary: ledger.summary(budget.usage) });
      broadcastSounds(session);
      lastFactsJson = '';
      publishFacts(true);
      sendModelChoices(session);
      if (!greeted) { greeted = true; setTimeout(greet, 900); }
      break;
    case 'panelOpened':
      bridge.post(session, { t: 'update', update: updater.state });
      bridge.post(session, { t: 'ledger', summary: ledger.summary(budget.usage) });
      broadcastSounds(session);
      break;
    case 'quota_refresh':
      pollQuota(true);
      break;
    case 'sounds_scan':
      broadcastSounds(session);
      break;
    case 'open_sound_dir':
      openSoundFolder();
      break;
    case 'ledger_reset':
      ledger.resetToday();
      broadcastLedger();
      publishFacts(true);
      break;
    case 'feed_fish':
      handleFeedFish();
      break;
    case 'screen_peek':
      handleScreenPeek({ manual: message.manual !== false });
      break;
    case 'screen_capture_result': {
      const resolver = pendingCaptures.get(message.requestId);
      if (resolver) resolver(message);
      break;
    }
    case 'chat_send':
      handleChatSend(message.text);
      break;
    case 'chat_clear':
      chatSession.clear();
      break;
    case 'persona_reset': {
      const def = language() === 'zhs' ? DEFAULT_PERSONA_EXTRA.zhs : DEFAULT_PERSONA_EXTRA.en;
      settings.patch({ ai: { personaExtra: def } });
      bridge.broadcast({ t: 'settings', settings: settings.value, ui: ui() });
      break;
    }
    case 'backup_export':
      handleBackupExport();
      break;
    case 'backup_exported': {
      const line = pickLine(language(), message.ok ? 'backup_exported' : 'backup_failed');
      if (line) bridge.broadcast({ t: 'say', text: line.text, mood: line.mood, ai: false, force: true });
      break;
    }
    case 'backup_import_request':
      desktopBridge.broadcastAll({ t: 'backup_import_dialog' });
      break;
    case 'backup_import_data':
      handleBackupImportData(message);
      break;
    case 'tray_action':
      if (message.action === 'center') bridge.broadcast({ t: 'center', frac: message.frac || null });
      else if (message.action === 'quota_show') { bridge.broadcast({ t: 'quota_show' }); pollQuota(true); }
      else if (message.action === 'open_chat') bridge.broadcast({ t: 'open_chat' });
      else if (message.action === 'open_settings') bridge.broadcast({ t: 'open_settings' });
      else if (message.action === 'quit') shutdown();
      break;
    case 'update_check':
      updater.check();
      break;
    case 'update_install':
      updater.install();
      break;
    case 'art':
      bridge.post(session, { t: 'art', name: message.name, data: readArt(message.name) });
      break;
    case 'settings': {
      const beforeMode = settings.value.displayMode;
      settings.patch(message.patch);
      bridge.broadcast({ t: 'settings', settings: settings.value, ui: ui() });
      if (settings.value.displayMode !== beforeMode) applyDisplayMode();
      publishFacts(true);
      break;
    }
    case 'presence':
      presence = { visible: !!message.visible, focused: !!message.focused, idleMs: Number(message.idleMs) || 0 };
      if (message.language) appLanguage = message.language;
      break;
    case 'remount':
      bridge.remount(session);
      break;
    case 'talk':
      brain.consider('talk', context(), { force: true, line: 'talk_offline' }).catch(() => {});
      break;
    case 'touch': {
      const known = ['poke', 'pet', 'coax', 'annoyed', 'puffed', 'redhot', 'sulk', 'shaken', 'grab'];
      if (known.includes(message.kind)) brain.consider(message.kind, {}).catch(() => {});
      break;
    }
    case 'error':
      log(`pet error: ${String(message.message).slice(0, 400)}`);
      break;
    default:
      break;
  }
}

async function sendModelChoices(session) {
  try {
    const configs = await models.refresh();
    bridge.post(session, { t: 'models', models: configs.map(c => c.label), usage: budget.usage });
  } catch {}
}

const timers = [
  setInterval(() => pollQuota(false), 60000),
  setInterval(pollModel, 20000),
  setInterval(ambient, 5 * MINUTE),
  setInterval(checkPeriodicReminders, 60000),
];
const checkUpdates = () => { if (settings.value.autoCheckUpdates) updater.check(); };
timers.push(setTimeout(checkUpdates, 15000), setInterval(checkUpdates, UPDATE_INTERVAL_MS));
for (const timer of timers) timer.unref?.();

await desktopBridge.start();
if (HOSTED_BY_ELECTRON) {
  console.log(`HAGEMI_BRIDGE_URL=${desktopBridge.url}`);
}
await applyDisplayMode();
pollModel().then(() => pollQuota(true));
monitor.start();
log(`started, data in ${dataDir}`);

const keepAlive = setInterval(() => {}, 1 << 30);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(keepAlive);
  monitor.stop();
  const force = setTimeout(() => process.exit(0), 2500);
  force.unref?.();
  if (electronChild && !electronChild.killed) {
    try { electronChild.kill(); } catch {}
  }
  await Promise.allSettled([cdpBridge.stop(), desktopBridge.stop()]);
  process.exit(0);
}
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, shutdown);
if (HOSTED_BY_ELECTRON) {
  process.stdin.resume();
  process.stdin.once('end', shutdown);
  process.stdin.once('close', shutdown);
}

const manifest = join(dirname(fileURLToPath(import.meta.url)), 'sidecar.json');
const orphanCheck = setInterval(() => {
  if (existsSync(manifest)) return;
  log('plugin files removed, leaving');
  shutdown();
}, 5000);
orphanCheck.unref?.();
