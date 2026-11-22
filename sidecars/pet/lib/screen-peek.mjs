// Screen Peek & Commentary engine:
//   - Privacy-first: zero screenshots written to disk, Gemini Interactions API called with store: false,
//     and sensitive windows (password managers, banking, incognito, .env) are skipped automatically.
//   - Dual channel:
//       1. Multimodal vision via official @google/genai SDK (when GEMINI_API_KEY is configured)
//       2. Zero-key fallback using active foreground window app/title + Antigravity's existing model
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MOODS, parseReply, PERSONA, scrub } from './persona.mjs';

const exec = promisify(execFile);

export const DEFAULT_BLOCKED_KEYWORDS = Object.freeze([
  'password', '1password', 'bitwarden', 'keepass', 'lastpass', 'dashlane', 'keychain',
  '密码', '钥匙串', '银行', '网银', '支付', '收银台', 'alipay', 'wechat pay',
  'incognito', 'inprivate', '无痕', '隐私浏览', 'private browsing',
  '.env', 'id_rsa', 'secret', 'credential', 'api key', 'apikey',
]);

export const VISION_MODELS = Object.freeze([
  'gemini-3.5-flash-lite',
  'gemini-4-hydrogen',
  'gemini-4-argon',
]);

export function parseBlockedList(extra = '') {
  if (typeof extra !== 'string' || !extra.trim()) return [];
  return extra
    .split(/[,，;\n]+/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isSensitiveWindow(info = {}, extraBlocked = '') {
  const haystack = `${info?.appName || ''} ${info?.title || ''}`.toLowerCase();
  if (!haystack.trim()) return false;
  const keywords = [...DEFAULT_BLOCKED_KEYWORDS, ...parseBlockedList(extraBlocked)];
  return keywords.some(kw => kw && haystack.includes(kw));
}

export async function getActiveWindow({ platform = process.platform, execFn = exec } = {}) {
  try {
    if (platform === 'win32') {
      const script = [
        'Add-Type -Namespace Win32 -Name Peek -MemberDefinition @"',
        '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
        '[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);',
        '[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
        '"@',
        '$h = [Win32.Peek]::GetForegroundWindow()',
        '$sb = New-Object System.Text.StringBuilder 512',
        '[void][Win32.Peek]::GetWindowText($h, $sb, 512)',
        '$pidOut = 0; [void][Win32.Peek]::GetWindowThreadProcessId($h, [ref]$pidOut)',
        '$proc = Get-Process -Id $pidOut -ErrorAction SilentlyContinue',
        '@{ appName = if ($proc) { $proc.ProcessName } else { "" }; title = $sb.ToString() } | ConvertTo-Json -Compress',
      ].join('\n');
      const { stdout } = await execFn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        windowsHide: true,
        timeout: 4000,
      });
      const parsed = JSON.parse(stdout.trim() || '{}');
      return {
        appName: scrub(String(parsed.appName || ''), 60),
        title: scrub(String(parsed.title || ''), 140),
      };
    }
    if (platform === 'darwin') {
      const script = [
        'tell application "System Events"',
        '  set frontApp to first application process whose frontmost is true',
        '  set appName to name of frontApp',
        '  set winTitle to ""',
        '  try',
        '    set winTitle to name of front window of frontApp',
        '  end try',
        '  return appName & "|||" & winTitle',
        'end tell',
      ].join('\n');
      const { stdout } = await execFn('osascript', ['-e', script], { timeout: 4000 });
      const [appName = '', title = ''] = stdout.trim().split('|||');
      return {
        appName: scrub(appName, 60),
        title: scrub(title, 140),
      };
    }
  } catch { /* Non-fatal if OS window query is unavailable. */ }
  return { appName: '', title: '' };
}

export function buildScreenPeekPrompt({ language = 'zhs', hasImage = false, activeWindow = {}, recent = [], personaExtra = '' }) {
  const zh = language === 'zhs';
  const appLine = activeWindow.appName || activeWindow.title
    ? `${activeWindow.appName || ''}${activeWindow.title ? ` (${activeWindow.title})` : ''}`
    : (zh ? '未知窗口' : 'Unknown window');
  const recentLine = recent.length ? `${zh ? '你刚说过（别重复）' : 'You just said (do not repeat)'}: ${recent.map(l => `"${l}"`).join(' ')}` : '';
  const extraLine = personaExtra ? scrub(personaExtra, 240) : '';

  if (zh) {
    return [
      PERSONA.zhs,
      extraLine,
      hasImage
        ? '你刚偷偷瞄了一眼大号猫猫的电脑屏幕截图。请根据画面里正在做的事（写代码、看视频、刷网页、玩游戏、聊天、看文档等）随口碎碎念一句俏皮、具体、带点吐槽或鼓励的话。如果像在摸鱼就调皮调侃，如果在认真干活就夸夸或提醒喝水。'
        : '你刚瞄了一眼大号猫猫当前打开的窗口标题。请根据他在做的事随口碎碎念一句俏皮、贴切的话。',
      `规则：称呼用户一律用“大号猫猫”，不要用破折号、Markdown 或 emoji，只说一句话且不超过 42 个字，不要念出任何隐私、密码、路径或网址。格式：只输出 情绪|台词。情绪从这些里选一个：${MOODS.join(' ')}`,
      recentLine,
      `<observation>\n当前前台窗口: ${appLine}\n</observation>`,
    ].filter(Boolean).join('\n\n');
  }

  return [
    PERSONA.en,
    extraLine,
    hasImage
      ? 'You just peeked at the user\'s screen screenshot. Make one brief, playful, specific remark about what they are doing (coding, browsing, watching videos, gaming, reading, etc.).'
      : 'You just glanced at the user\'s active window title. Make one brief, playful remark about what they are up to.',
    `Rules: call the user "big cat", never use dashes, markdown, or emoji, say one sentence under 24 words, and never recite private info, URLs, or paths. Format: output only mood|line. Pick the mood from: ${MOODS.join(' ')}`,
    recentLine,
    `<observation>\nActive window: ${appLine}\n</observation>`,
  ].filter(Boolean).join('\n\n');
}

export async function callGeminiInteractions({ apiKey, model, input, clientFactory = null, fetchFn = fetch }) {
  if (clientFactory) {
    const ai = clientFactory(apiKey);
    return ai.interactions.create({ model, store: false, input });
  }
  try {
    const mod = await import('@google/genai');
    const ai = new mod.GoogleGenAI({ apiKey });
    return await ai.interactions.create({ model, store: false, input });
  } catch (err) {
    if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
  }
  const res = await fetchFn('https://generativelanguage.googleapis.com/v1/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({ model, store: false, input }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`gemini-http-${res.status}`);
  const data = await res.json();
  const outputText = data.output_text || (data.steps || [])
    .filter(s => s.type === 'model_output')
    .flatMap(s => s.content || [])
    .filter(c => c.type === 'text' && c.text)
    .map(c => c.text)
    .join('');
  return { ...data, output_text: outputText };
}

export async function analyzeScreenWithGemini({
  apiKey,
  model = 'gemini-3.5-flash-lite',
  base64Jpeg,
  language = 'zhs',
  activeWindow = {},
  recent = [],
  personaExtra = '',
  clientFactory = null,
}) {
  const key = (apiKey || process.env.GEMINI_API_KEY || '').trim();
  if (!key) throw new Error('missing-gemini-api-key');
  if (!base64Jpeg) throw new Error('missing-screenshot');

  const prompt = buildScreenPeekPrompt({ language, hasImage: true, activeWindow, recent, personaExtra });
  const chosenModel = VISION_MODELS.includes(model) ? model : 'gemini-3.5-flash-lite';
  const interaction = await callGeminiInteractions({
    apiKey: key,
    model: chosenModel,
    clientFactory,
    input: [
      { type: 'text', text: prompt },
      { type: 'image', data: base64Jpeg, mime_type: 'image/jpeg' },
    ],
  });

  const text = interaction?.output_text || '';
  return parseReply(text, language);
}
