// Daily usage ledger: tracks today's quota consumption delta, agent turns, tool calls,
// subagents, and quota refills, archiving past days automatically.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const MAX_HISTORY_DAYS = 30;
const REFILL_JUMP = 0.1;
const DROP_EPSILON = 0.001;

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function emptyDay(date) {
  return {
    date,
    turnsDone: 0,
    bigTurns: 0,
    errors: 0,
    toolCalls: 0,
    subagents: 0,
    refills: 0,
    buckets: {},
  };
}

function bucketKey(bucket) {
  return bucket.id || `${bucket.group || 'default'}:${bucket.window || 'main'}`;
}

export class UsageLedger {
  constructor(file, { now = () => new Date() } = {}) {
    this.file = file;
    this.now = now;
    this.state = this.load();
    this.rolloverIfNeeded();
  }

  load() {
    const today = localDateKey(this.now());
    try {
      if (!existsSync(this.file)) return { today: emptyDay(today), history: [] };
      const parsed = JSON.parse(readFileSync(this.file, 'utf8').replace(/^\uFEFF/, ''));
      if (!parsed || typeof parsed !== 'object') return { today: emptyDay(today), history: [] };
      const current = parsed.today && typeof parsed.today === 'object'
        ? { ...emptyDay(parsed.today.date || today), ...parsed.today, buckets: { ...(parsed.today.buckets || {}) } }
        : emptyDay(today);
      const history = Array.isArray(parsed.history) ? parsed.history.slice(-MAX_HISTORY_DAYS) : [];
      return { today: current, history };
    } catch {
      return { today: emptyDay(today), history: [] };
    }
  }

  save() {
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const temp = `${this.file}.${process.pid}.tmp`;
      writeFileSync(temp, JSON.stringify(this.state, null, 2));
      renameSync(temp, this.file);
    } catch { /* Best-effort persistence: never crash the pet over disk IO. */ }
  }

  rolloverIfNeeded() {
    const today = localDateKey(this.now());
    if (this.state.today.date === today) return false;
    const previous = this.state.today;
    const hasActivity = previous.turnsDone > 0 || previous.errors > 0 || previous.toolCalls > 0
      || Object.values(previous.buckets || {}).some(b => (b.usedPct || 0) > 0);
    if (hasActivity) {
      this.state.history.push(previous);
      if (this.state.history.length > MAX_HISTORY_DAYS) {
        this.state.history = this.state.history.slice(-MAX_HISTORY_DAYS);
      }
    }
    // Carry over lastRemaining baselines so drops across midnight are measured cleanly.
    const next = emptyDay(today);
    for (const [key, entry] of Object.entries(previous.buckets || {})) {
      if (Number.isFinite(entry.lastRemaining)) {
        next.buckets[key] = {
          group: entry.group || '',
          window: entry.window || '',
          usedPct: 0,
          lastRemaining: entry.lastRemaining,
        };
      }
    }
    this.state.today = next;
    this.save();
    return true;
  }

  recordQuota(buckets = []) {
    this.rolloverIfNeeded();
    let changed = false;
    for (const bucket of buckets) {
      if (bucket.remaining == null || !Number.isFinite(bucket.remaining)) continue;
      const key = bucketKey(bucket);
      const prev = this.state.today.buckets[key];
      if (!prev || !Number.isFinite(prev.lastRemaining)) {
        this.state.today.buckets[key] = {
          group: bucket.group || '',
          window: bucket.window || '',
          usedPct: prev?.usedPct || 0,
          lastRemaining: bucket.remaining,
        };
        changed = true;
        continue;
      }
      const delta = prev.lastRemaining - bucket.remaining;
      if (delta > DROP_EPSILON) {
        prev.usedPct = Math.round(((prev.usedPct || 0) + delta * 100) * 10) / 10;
        prev.lastRemaining = bucket.remaining;
        changed = true;
      } else if (-delta > REFILL_JUMP) {
        this.state.today.refills += 1;
        prev.lastRemaining = bucket.remaining;
        changed = true;
      } else if (bucket.remaining !== prev.lastRemaining) {
        prev.lastRemaining = bucket.remaining;
        changed = true;
      }
    }
    if (changed) this.save();
    return changed;
  }

  recordTurnEnd(event = {}) {
    this.rolloverIfNeeded();
    const today = this.state.today;
    const term = event.termination || '';
    if (term === 'error' || term === 'failed') {
      today.errors += 1;
    } else {
      today.turnsDone += 1;
      if ((event.toolCount || 0) >= 6) today.bigTurns += 1;
    }
    if (Number.isFinite(event.toolCount) && event.toolCount > 0) {
      today.toolCalls += Math.round(event.toolCount);
    }
    this.save();
  }

  recordSubagentStart() {
    this.rolloverIfNeeded();
    this.state.today.subagents += 1;
    this.save();
  }

  exportState() {
    this.rolloverIfNeeded();
    return JSON.parse(JSON.stringify(this.state));
  }

  importState(data) {
    if (!data || typeof data !== 'object') return false;
    const todayKey = localDateKey(this.now());
    const incomingToday = data.today && typeof data.today === 'object'
      ? { ...emptyDay(data.today.date || todayKey), ...data.today, buckets: { ...(data.today.buckets || {}) } }
      : emptyDay(todayKey);
    const incomingHistory = Array.isArray(data.history)
      ? data.history.filter(item => item && typeof item === 'object' && item.date).slice(-MAX_HISTORY_DAYS)
      : [];
    this.state = { today: incomingToday, history: incomingHistory };
    this.rolloverIfNeeded();
    this.save();
    return true;
  }

  resetToday() {
    const today = localDateKey(this.now());
    const preserved = {};
    for (const [key, entry] of Object.entries(this.state.today.buckets || {})) {
      if (Number.isFinite(entry.lastRemaining)) {
        preserved[key] = {
          group: entry.group || '',
          window: entry.window || '',
          usedPct: 0,
          lastRemaining: entry.lastRemaining,
        };
      }
    }
    this.state.today = { ...emptyDay(today), buckets: preserved };
    this.save();
  }

  recentDays(days = 7) {
    this.rolloverIfNeeded();
    const byDate = new Map();
    for (const item of this.state.history || []) {
      if (item && item.date) byDate.set(item.date, item);
    }
    byDate.set(this.state.today.date, this.state.today);
    const anchor = this.now();
    const result = [];
    for (let offset = days - 1; offset >= 0; offset--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - offset);
      const key = localDateKey(d);
      const rec = byDate.get(key);
      const vals = rec ? Object.values(rec.buckets || {}).map(b => Number(b.usedPct) || 0).filter(v => v > 0) : [];
      result.push({
        date: key,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        isToday: offset === 0,
        maxUsedPct: vals.length ? Math.round(Math.max(...vals) * 10) / 10 : 0,
        turnsDone: rec?.turnsDone || 0,
        toolCalls: rec?.toolCalls || 0,
        errors: rec?.errors || 0,
        subagents: rec?.subagents || 0,
      });
    }
    return result;
  }

  summary(budgetUsage = { calls: 0, tokens: 0 }) {
    this.rolloverIfNeeded();
    const today = this.state.today;
    const usedValues = Object.values(today.buckets || {})
      .map(b => Number(b.usedPct) || 0)
      .filter(v => v > 0);
    const maxUsedPct = usedValues.length ? Math.round(Math.max(...usedValues) * 10) / 10 : 0;
    const byBucket = Object.entries(today.buckets || {})
      .filter(([, b]) => (b.usedPct || 0) > 0)
      .map(([id, b]) => ({ id, group: b.group, window: b.window, usedPct: b.usedPct }));
    return {
      date: today.date,
      turnsDone: today.turnsDone,
      bigTurns: today.bigTurns,
      errors: today.errors,
      toolCalls: today.toolCalls,
      subagents: today.subagents,
      refills: today.refills,
      maxUsedPct,
      byBucket,
      aiCalls: budgetUsage?.calls || 0,
      aiTokens: budgetUsage?.tokens || 0,
      historyDays: this.state.history.length,
      recent7: this.recentDays(7),
    };
  }
}
