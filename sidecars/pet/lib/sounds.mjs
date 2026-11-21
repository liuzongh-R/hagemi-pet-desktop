// Sound pack scanner: discovers built-in synth packs plus paired user audio files in sound/.
// Follows the DeepSeek-Pet naming rule:
//   <name>1.<ext> = press / click sound
//   <name>2.<ext> = release sound
// Example: 小熊猫11.mp3 + 小熊猫12.mp3 -> pack label "小熊猫1"
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join, normalize } from 'node:path';

export const SOUND_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a']);

export const BUILTIN_SOUND_PACKS = Object.freeze([
  { id: 'builtin:soft', kind: 'builtin', labelEn: 'Soft Bubble (built-in)', labelZhs: '软萌气泡（内置）' },
  { id: 'builtin:mechanical', kind: 'builtin', labelEn: 'Tactile Click (built-in)', labelZhs: '清脆按键（内置）' },
]);

const MIME_TYPES = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
};

export function ensureSoundDir(soundDir) {
  try {
    if (!existsSync(soundDir)) mkdirSync(soundDir, { recursive: true });
  } catch { /* Non-fatal if read-only. */ }
  return soundDir;
}

export function scanSoundPacks(soundDir) {
  const custom = [];
  if (soundDir && existsSync(soundDir)) {
    const pairs = new Map();
    let files = [];
    try { files = readdirSync(soundDir, { withFileTypes: true }); } catch { files = []; }
    for (const entry of files) {
      if (!entry.isFile()) continue;
      const ext = extname(entry.name).toLowerCase();
      if (!SOUND_EXTENSIONS.has(ext)) continue;
      const stem = entry.name.slice(0, -ext.length);
      if (stem.length < 2) continue;
      const suffix = stem.slice(-1);
      if (suffix !== '1' && suffix !== '2') continue;
      const name = stem.slice(0, -1);
      if (!name) continue;
      const record = pairs.get(name) || { name, press: null, release: null };
      if (suffix === '1' && !record.press) record.press = entry.name;
      if (suffix === '2' && !record.release) record.release = entry.name;
      pairs.set(name, record);
    }
    for (const record of [...pairs.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))) {
      if (record.press && record.release) {
        custom.push({
          id: `custom:${record.name}`,
          kind: 'custom',
          label: record.name,
          press: record.press,
          release: record.release,
        });
      }
    }
  }
  return [...BUILTIN_SOUND_PACKS, ...custom];
}

export function readSoundFile(soundDir, fileName) {
  if (!soundDir || typeof fileName !== 'string' || !fileName) return null;
  const safe = basename(fileName);
  if (safe !== fileName || safe.includes('..')) return null;
  const ext = extname(safe).toLowerCase();
  if (!SOUND_EXTENSIONS.has(ext)) return null;
  const fullPath = normalize(join(soundDir, safe));
  if (!fullPath.startsWith(normalize(soundDir))) return null;
  try {
    return { data: readFileSync(fullPath), mime: MIME_TYPES[ext] || 'application/octet-stream' };
  } catch {
    return null;
  }
}
