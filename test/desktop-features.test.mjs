import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ChatSession, parseChatReply } from '../sidecars/pet/lib/chat.mjs';
import { DesktopBridge } from '../sidecars/pet/lib/desktop-bridge.mjs';
import { UsageLedger } from '../sidecars/pet/lib/ledger.mjs';
import { analyzeScreenWithGemini, buildScreenPeekPrompt, isSensitiveWindow } from '../sidecars/pet/lib/screen-peek.mjs';
import { DEFAULTS, sanitize, SettingsStore } from '../sidecars/pet/lib/settings.mjs';
import { readSoundFile, scanSoundPacks } from '../sidecars/pet/lib/sounds.mjs';

test('ledger tracks quota consumption deltas, ignores refills, and rolls over daily', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hagemi-ledger-'));
  let clock = new Date('2026-11-22T10:00:00');
  const ledger = new UsageLedger(join(dir, 'ledger.json'), { now: () => clock });

  // Baseline establishes starting remaining fraction without counting consumption.
  ledger.recordQuota([{ id: 'gemini-5h', group: 'Gemini', window: '5h', remaining: 0.9 }]);
  assert.equal(ledger.summary().maxUsedPct, 0);

  // Drop of 15% records as 15% consumed.
  ledger.recordQuota([{ id: 'gemini-5h', group: 'Gemini', window: '5h', remaining: 0.75 }]);
  assert.equal(ledger.summary().maxUsedPct, 15);

  // Refill back to 100% counts as a refill, not negative usage.
  ledger.recordQuota([{ id: 'gemini-5h', group: 'Gemini', window: '5h', remaining: 1.0 }]);
  assert.equal(ledger.summary().refills, 1);
  assert.equal(ledger.summary().maxUsedPct, 15);

  // Another 8% drop accumulates on top of 15% -> 23%.
  ledger.recordQuota([{ id: 'gemini-5h', group: 'Gemini', window: '5h', remaining: 0.92 }]);
  assert.equal(ledger.summary().maxUsedPct, 23);

  ledger.recordTurnEnd({ termination: 'completed', toolCount: 7 });
  ledger.recordTurnEnd({ termination: 'error', toolCount: 2 });
  ledger.recordSubagentStart();
  const sum = ledger.summary({ calls: 4, tokens: 1200 });
  assert.equal(sum.turnsDone, 1);
  assert.equal(sum.bigTurns, 1);
  assert.equal(sum.errors, 1);
  assert.equal(sum.toolCalls, 9);
  assert.equal(sum.subagents, 1);
  assert.equal(sum.aiCalls, 4);

  // Midnight rollover archives yesterday and resets today's counters while keeping baseline.
  clock = new Date('2026-11-23T00:05:00');
  ledger.recordQuota([{ id: 'gemini-5h', group: 'Gemini', window: '5h', remaining: 0.87 }]);
  const next = ledger.summary();
  assert.equal(next.date, '2026-11-23');
  assert.equal(next.historyDays, 1);
  assert.equal(next.turnsDone, 0);
  assert.equal(next.maxUsedPct, 5);
  assert.equal(next.recent7.length, 7);
  assert.equal(next.recent7[6].isToday, true);
  assert.equal(next.recent7[6].maxUsedPct, 5);
  assert.equal(next.recent7[5].maxUsedPct, 23);

  // Reset clears today's counters cleanly.
  ledger.resetToday();
  assert.equal(ledger.summary().maxUsedPct, 0);
});

test('sound scanner discovers paired custom files and blocks path traversal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hagemi-sound-'));
  writeFileSync(join(dir, '小熊猫11.mp3'), Buffer.from('press'));
  writeFileSync(join(dir, '小熊猫12.mp3'), Buffer.from('release'));
  writeFileSync(join(dir, 'orphan1.wav'), Buffer.from('incomplete'));
  writeFileSync(join(dir, 'notes.txt'), 'ignore');

  const packs = scanSoundPacks(dir);
  const custom = packs.filter(p => p.kind === 'custom');
  assert.equal(custom.length, 1);
  assert.equal(custom[0].id, 'custom:小熊猫1');
  assert.equal(custom[0].press, '小熊猫11.mp3');
  assert.equal(custom[0].release, '小熊猫12.mp3');

  const ok = readSoundFile(dir, '小熊猫11.mp3');
  assert.equal(ok.mime, 'audio/mpeg');
  assert.equal(ok.data.toString(), 'press');
  assert.equal(readSoundFile(dir, '../secret.mp3'), null);
  assert.equal(readSoundFile(dir, 'notes.txt'), null);
});

test('desktop settings sanitize and persist cleanly', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hagemi-desktop-settings-'));
  const file = join(dir, 'settings.json');
  const store = new SettingsStore(file);
  store.patch({
    displayMode: 'app',
    alwaysOnTop: 'floating',
    showQuotaBadge: false,
    roamEnabled: true,
    showInDock: true,
    notifications: { onTurnDone: false },
    sound: { volume: 0.4, pack: 'builtin:mechanical' },
  });
  const reloaded = new SettingsStore(file);
  assert.equal(reloaded.value.displayMode, 'app');
  assert.equal(reloaded.value.alwaysOnTop, 'floating');
  assert.equal(reloaded.value.showQuotaBadge, false);
  assert.equal(reloaded.value.roamEnabled, true);
  assert.equal(reloaded.value.showInDock, true);
  assert.equal(reloaded.value.notifications.enabled, true);
  assert.equal(reloaded.value.notifications.onTurnDone, false);
  assert.equal(reloaded.value.sound.volume, 0.4);
  assert.equal(reloaded.value.sound.pack, 'builtin:mechanical');
  assert.equal(reloaded.value.sound.enabled, DEFAULTS.sound.enabled);

  const junk = sanitize({ displayMode: 'moon', alwaysOnTop: 'invalid', sound: { volume: 99 } });
  assert.equal(junk.displayMode, DEFAULTS.displayMode);
  assert.equal(junk.alwaysOnTop, DEFAULTS.alwaysOnTop);
  assert.equal(junk.sound.volume, 1);
});

test('desktop bridge serves page, renderer script, custom sounds, and receives messages', async () => {
  const soundDir = mkdtempSync(join(tmpdir(), 'hagemi-bridge-sound-'));
  writeFileSync(join(soundDir, 'pop1.wav'), Buffer.from('RIFF'));
  const received = [];
  const bridge = new DesktopBridge({
    soundDir,
    onMessage: msg => received.push(msg),
  });
  const url = await bridge.start();
  try {
    const htmlRes = await fetch(url);
    assert.equal(htmlRes.status, 200);
    assert.match(await htmlRes.text(), /Hagemi Pet Desktop/);

    const jsRes = await fetch(`${url}/pet.js`);
    assert.equal(jsRes.status, 200);
    assert.match(await jsRes.text(), /desktop: true/);

    const soundRes = await fetch(`${url}/sounds/pop1.wav`);
    assert.equal(soundRes.status, 200);
    assert.equal(soundRes.headers.get('content-type'), 'audio/wav');

    const postRes = await fetch(`${url}/api/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'quota_refresh' }),
    });
    assert.equal(postRes.status, 204);
    assert.equal(received.length, 1);
    assert.equal(received[0].type, 'quota_refresh');
  } finally {
    await bridge.stop();
  }
});

test('screen peek blocks sensitive windows and calls Gemini Interactions API with store=false', async () => {
  assert.equal(isSensitiveWindow({ appName: '1Password', title: 'Vault' }), true);
  assert.equal(isSensitiveWindow({ appName: 'chrome', title: '招商银行网上银行' }), true);
  assert.equal(isSensitiveWindow({ appName: 'Code', title: '.env - project' }), true);
  assert.equal(isSensitiveWindow({ appName: 'WeChat', title: '聊天' }, 'wechat, 财务'), true);
  assert.equal(isSensitiveWindow({ appName: 'Code', title: 'pet.js - hagemi-pet-desktop' }), false);

  const prompt = buildScreenPeekPrompt({ language: 'zhs', hasImage: true, activeWindow: { appName: 'Code', title: 'pet.js' } });
  assert.match(prompt, /哈基米/);

  let capturedReq = null;
  const reply = await analyzeScreenWithGemini({
    apiKey: 'test-key',
    model: 'gemini-3.5-flash-lite',
    base64Jpeg: Buffer.from('fakejpeg').toString('base64'),
    language: 'zhs',
    activeWindow: { appName: 'Code', title: 'pet.js' },
    clientFactory: () => ({
      interactions: {
        async create(req) {
          capturedReq = req;
          return { output_text: 'wink|大号猫猫写代码好认真喵，记得喝口水！' };
        },
      },
    }),
  });
  assert.equal(capturedReq.model, 'gemini-3.5-flash-lite');
  assert.equal(capturedReq.store, false);
  assert.equal(capturedReq.input[1].type, 'image');
  assert.equal(capturedReq.input[1].mime_type, 'image/jpeg');
  assert.equal(reply.mood, 'wink');
  assert.match(reply.line, /大号猫猫/);
});

test('new theme, opacity, ghost mode, break reminder, and screenPeek settings sanitize safely', () => {
  const s = sanitize({
    theme: 'dark',
    opacity: 0.78,
    ghostMode: true,
    launchAtLogin: true,
    breakReminderMin: 45,
    screenPeek: { mode: 'vision', autoIntervalMin: 15, model: 'gemini-4-hydrogen', blockedKeywords: '微信, 银行' },
  });
  assert.equal(s.theme, 'dark');
  assert.equal(s.opacity, 0.78);
  assert.equal(s.ghostMode, true);
  assert.equal(s.launchAtLogin, true);
  assert.equal(s.breakReminderMin, 45);
  assert.equal(s.screenPeek.mode, 'vision');
  assert.equal(s.screenPeek.autoIntervalMin, 15);
  assert.equal(s.screenPeek.model, 'gemini-4-hydrogen');

  const bad = sanitize({ theme: 'neon', opacity: 0.1, breakReminderMin: 999, screenPeek: { mode: 'x', model: 'gemini-1.5-pro' } });
  assert.equal(bad.theme, 'auto');
  assert.equal(bad.opacity, 0.5);
  assert.equal(bad.breakReminderMin, 0);
  assert.equal(bad.screenPeek.mode, 'auto');
  assert.equal(bad.screenPeek.model, 'gemini-3.5-flash-lite');

  assert.equal(sanitize({ theme: 'liquid' }).theme, 'liquid');
});

test('chat session supports antigravity, gemini, and openai-compatible providers with memory', async () => {
  const session = new ChatSession();

  // 1. Gemini provider
  let gemReq = null;
  const r1 = await session.send({
    userMessage: '今天好累呀',
    chatConfig: { provider: 'gemini', geminiModel: 'gemini-4-hydrogen', apiKey: 'test-key' },
    language: 'zhs',
    geminiClientFactory: () => ({
      interactions: {
        async create(req) {
          gemReq = req;
          return { output_text: 'love|辛苦啦大号猫猫，本喵给你呼噜呼噜充电喵！' };
        },
      },
    }),
  });
  assert.equal(gemReq.model, 'gemini-4-hydrogen');
  assert.equal(gemReq.store, false);
  assert.equal(r1.mood, 'love');
  assert.equal(session.history.length, 2);

  // 2. OpenAI-compatible provider carries prior turn in history
  let openAiBody = null;
  const r2 = await session.send({
    userMessage: '刚才我说了啥',
    chatConfig: { provider: 'openai', baseUrl: 'https://example.com/v1', customModel: 'deepseek-chat', apiKey: 'sk-test' },
    language: 'zhs',
    fetchFn: async (_url, opts) => {
      openAiBody = JSON.parse(opts.body);
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: 'smug|大号猫猫说今天好累呀，本喵记得一清二楚喵！' } }] };
        },
      };
    },
  });
  assert.equal(openAiBody.model, 'deepseek-chat');
  assert.equal(openAiBody.messages.some(m => m.content.includes('今天好累呀')), true);
  assert.equal(r2.mood, 'smug');
  assert.equal(session.history.length, 4);

  session.clear();
  assert.equal(session.history.length, 0);
  assert.equal(parseChatReply('happy|Hello, big cat!', 'en').line, 'Hello, big cat!');
});

test('backup export/import restores settings and ledger history', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hagemi-backup-'));
  const storeA = new SettingsStore(join(dir, 'a-settings.json'));
  const ledgerA = new UsageLedger(join(dir, 'a-ledger.json'));
  storeA.patch({ theme: 'liquid', chat: { provider: 'gemini', geminiModel: 'gemini-4-neon' } });
  ledgerA.recordTurnEnd({ termination: 'completed', toolCount: 5 });

  const exportedSettings = storeA.value;
  const exportedLedger = ledgerA.exportState();

  const storeB = new SettingsStore(join(dir, 'b-settings.json'));
  const ledgerB = new UsageLedger(join(dir, 'b-ledger.json'));
  storeB.replaceAll(exportedSettings);
  assert.equal(ledgerB.importState(exportedLedger), true);

  assert.equal(storeB.value.theme, 'liquid');
  assert.equal(storeB.value.chat.provider, 'gemini');
  assert.equal(storeB.value.chat.geminiModel, 'gemini-4-neon');
  assert.equal(ledgerB.summary().turnsDone, 1);
  assert.equal(ledgerB.summary().toolCalls, 5);
});
