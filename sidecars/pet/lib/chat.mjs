// Interactive Chat engine for "聊一聊" (Chat with Hagemi):
// Supports three providers:
//   1. antigravity: reuses the user's Antigravity Language Server models (no API key required)
//   2. gemini: calls the official @google/genai SDK (Interactions API, store: false)
//   3. openai: calls any OpenAI-compatible /chat/completions endpoint
import { fullWidthPunctuation, MOODS, PERSONA, scrub } from './persona.mjs';

export const CHAT_GEMINI_MODELS = Object.freeze([
  'gemini-4-hydrogen',
  'gemini-4-neon',
  'gemini-4-argon',
  'gemini-3.5-flash-lite',
]);

const MAX_HISTORY_TURNS = 6;

export function parseChatReply(text, language = 'zhs') {
  if (!text) return null;
  const cleanedLines = String(text)
    .trim()
    .split(/\r?\n/)
    .map(r => r.trim())
    .filter(Boolean);
  if (!cleanedLines.length) return null;

  let first = cleanedLines[0];
  let mood = null;
  const match = first.match(/^\s*([a-zA-Z]+)\s*[|｜]\s*(.+)$/);
  if (match && MOODS.includes(match[1].toLowerCase())) {
    mood = match[1].toLowerCase();
    first = match[2];
  }
  let line = [first, ...cleanedLines.slice(1)].join(' ');
  line = line
    .replace(/[*_`#]/g, '')
    .replace(/^["'“”「」『』\s]+|["'“”「」『』\s]+$/g, '')
    .replace(/\s*[—–]+\s*$/, '')
    .replace(/\s*[—–]+\s*/g, language === 'zhs' ? '\uff0c' : ', ')
    .replace(/\s+/g, ' ')
    .trim();
  if (language === 'zhs') line = fullWidthPunctuation(line);
  if (!line) return null;

  const chars = Array.from(line);
  const cap = language === 'zhs' ? 140 : 260;
  if (chars.length > cap) line = `${chars.slice(0, cap).join('')}…`;
  return { line, mood: mood || 'happy' };
}

export function buildChatMessages({ language = 'zhs', history = [], userMessage = '', personaExtra = '' }) {
  const zh = language === 'zhs';
  const system = [
    PERSONA[zh ? 'zhs' : 'en'],
    personaExtra ? scrub(personaExtra, 320) : '',
    zh
      ? `场景：大号猫猫打开了桌宠聊一聊输入框，正在直接和你打字聊天。请自然、俏皮、有温度地回复，称呼用户为“大号猫猫”，不超过 90 个字，不要用破折号、Markdown 或代码块。格式：只输出 情绪|回复内容。情绪可选：${MOODS.join(' ')}`
      : `Context: The user opened your desktop chat box to chat with you directly. Reply warmly and playfully, call the user "big cat", keep it under 45 words, and avoid dashes or markdown. Format: output only mood|reply. Moods: ${MOODS.join(' ')}`,
  ].filter(Boolean).join('\n\n');

  const trimmedHistory = history.slice(-MAX_HISTORY_TURNS * 2).map(turn => ({
    role: turn.role === 'assistant' ? 'assistant' : 'user',
    content: String(turn.content || '').slice(0, 400),
  }));

  const user = String(userMessage || '').trim().slice(0, 500);
  return { system, history: trimmedHistory, user };
}

export function flattenChatPrompt({ system, history, user }, language = 'zhs') {
  const zh = language === 'zhs';
  const lines = [system];
  if (history.length) {
    const transcript = history
      .map(m => `${m.role === 'user' ? (zh ? '大号猫猫' : 'User') : (zh ? '哈基米' : 'Hagemi')}: ${m.content}`)
      .join('\n');
    lines.push(`${zh ? '最近对话' : 'Recent chat'}:\n${transcript}`);
  }
  lines.push(`${zh ? '大号猫猫刚才说' : 'User just said'}: ${user}`);
  return lines.join('\n\n');
}

export class ChatSession {
  constructor() {
    this.history = [];
  }

  clear() {
    this.history = [];
  }

  record(userText, replyText) {
    this.history.push({ role: 'user', content: userText }, { role: 'assistant', content: replyText });
    if (this.history.length > MAX_HISTORY_TURNS * 2) {
      this.history = this.history.slice(-MAX_HISTORY_TURNS * 2);
    }
  }

  async send({
    userMessage,
    chatConfig = {},
    language = 'zhs',
    personaExtra = '',
    ls = null,
    models = null,
    fallbackModel = 'Gemini 3.8 Flash (Low)',
    geminiClientFactory = null,
    fetchFn = fetch,
  }) {
    const cleanUser = String(userMessage || '').trim().slice(0, 500);
    if (!cleanUser) throw new Error('empty-message');

    const bundle = buildChatMessages({ language, history: this.history, userMessage: cleanUser, personaExtra });
    const provider = chatConfig.provider || 'antigravity';
    let rawText = '';

    if (provider === 'gemini') {
      const apiKey = (chatConfig.apiKey || process.env.GEMINI_API_KEY || '').trim();
      if (!apiKey) throw new Error('missing-api-key');
      const model = CHAT_GEMINI_MODELS.includes(chatConfig.geminiModel) ? chatConfig.geminiModel : 'gemini-4-hydrogen';
      const prompt = flattenChatPrompt(bundle, language);
      const ai = geminiClientFactory
        ? geminiClientFactory(apiKey)
        : new (await import('@google/genai')).GoogleGenAI({ apiKey });
      const res = await ai.interactions.create({
        model,
        store: false,
        input: prompt,
      });
      rawText = res?.output_text || '';
    } else if (provider === 'openai') {
      const apiKey = (chatConfig.apiKey || '').trim();
      const baseUrl = (chatConfig.baseUrl || '').trim().replace(/\/+$/, '');
      const model = (chatConfig.customModel || '').trim();
      if (!baseUrl || !model) throw new Error('missing-custom-config');
      const endpoint = /\/chat\/completions$/i.test(baseUrl) ? baseUrl : `${baseUrl}/chat/completions`;
      const messages = [
        { role: 'system', content: bundle.system },
        ...bundle.history,
        { role: 'user', content: bundle.user },
      ];
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, messages, max_tokens: 220, temperature: 0.8 }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`http-${response.status}`);
      const json = await response.json();
      rawText = json?.choices?.[0]?.message?.content || '';
    } else {
      if (!ls || !models) throw new Error('antigravity-unavailable');
      await models.refresh().catch(() => {});
      const chosen = models.resolve(chatConfig.model || fallbackModel) || models.resolve(fallbackModel);
      if (!chosen) throw new Error('model-not-found');
      const prompt = flattenChatPrompt(bundle, language);
      const res = await ls.call('GetModelResponse', { prompt, model: chosen.id }, 30000);
      rawText = res?.response || '';
    }

    const parsed = parseChatReply(rawText, language);
    if (!parsed) throw new Error('empty-reply');
    this.record(cleanUser, parsed.line);
    return parsed;
  }
}
