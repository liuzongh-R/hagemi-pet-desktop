// Sound engine: plays paired press/release custom audio files from /sounds/<file>
// or lightweight built-in Web Audio synthesized feedback when using built-in packs.
HAGEMI.createSound = function createSound(options = {}) {
  let ctx = null;
  let packs = [];
  const audioCache = new Map();

  function ensureContext() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    try { ctx = new AudioCtx(); } catch { return null; }
    return ctx;
  }

  function tone(freqStart, freqEnd, duration, volume, type = 'sine', delay = 0) {
    const audio = ensureContext();
    if (!audio || volume <= 0.001) return;
    const now = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.min(0.45, volume * 0.28), now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function playCustom(fileName, volume) {
    if (!options.desktop || !fileName) return false;
    try {
      const url = `/sounds/${encodeURIComponent(fileName)}`;
      let base = audioCache.get(url);
      if (!base) {
        base = new Audio(url);
        base.preload = 'auto';
        audioCache.set(url, base);
      }
      const clip = base.cloneNode();
      clip.volume = Math.min(1, Math.max(0, volume));
      clip.play().catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  function play(kind, config = {}) {
    if (!config || !config.enabled) return;
    const volume = Number.isFinite(config.volume) ? Math.min(1, Math.max(0, config.volume)) : 0.65;
    if (volume <= 0.005) return;
    const packId = config.pack || 'builtin:soft';

    if (packId.startsWith('custom:') && (kind === 'press' || kind === 'release')) {
      const found = packs.find(p => p.id === packId);
      const file = found ? (kind === 'press' ? found.press : found.release) : null;
      if (file && playCustom(file, volume)) return;
    }

    const mech = packId === 'builtin:mechanical';
    switch (kind) {
      case 'press':
        if (mech) {
          tone(1450, 520, 0.032, volume, 'triangle');
          tone(320, 180, 0.025, volume * 0.6, 'square', 0.004);
        } else {
          tone(520, 760, 0.075, volume, 'sine');
        }
        break;
      case 'release':
        if (mech) {
          tone(920, 420, 0.028, volume * 0.75, 'triangle');
        } else {
          tone(760, 980, 0.065, volume * 0.8, 'sine');
        }
        break;
      case 'menu':
        tone(560, 840, 0.07, volume * 0.75, 'sine');
        tone(840, 1080, 0.06, volume * 0.55, 'sine', 0.045);
        break;
      case 'quota':
        tone(659, 659, 0.08, volume * 0.8, 'triangle');
        tone(880, 988, 0.11, volume * 0.85, 'sine', 0.065);
        break;
      case 'pat':
        tone(587, 740, 0.09, volume * 0.7, 'sine');
        tone(880, 1046, 0.12, volume * 0.65, 'sine', 0.07);
        break;
      case 'chime':
        tone(659, 659, 0.09, volume * 0.7, 'sine');
        tone(784, 784, 0.09, volume * 0.7, 'sine', 0.08);
        tone(1046, 1175, 0.16, volume * 0.75, 'sine', 0.16);
        break;
      default:
        break;
    }
  }

  return {
    play,
    setPacks(next) {
      packs = Array.isArray(next) ? next : [];
    },
    destroy() {
      audioCache.clear();
      if (ctx) { ctx.close().catch(() => {}); ctx = null; }
    },
  };
};
