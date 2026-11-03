import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { lastBeat, type Beat } from './heartbeat.js';
import { readNight } from './digest/types.js';

export type NightSummary = {
  night: string;
  counts: { ok: number; retry: number; fail: number } | null;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  const nights = nightsOnDisk(config.runsDir).map((night) => {
    let counts: { ok: number; retry: number; fail: number } | null = null;
    try {
      const nightData = readNight(config.runsDir, night);
      if (nightData !== null) {
        const ok = nightData.rows.filter((row) => row.lastStatus === 'ok').length;
        const retry = nightData.rows.filter((row) => row.lastStatus === 'retry').length;
        const fail = nightData.rows.filter((row) => row.lastStatus === 'fail').length;
        counts = { ok, retry, fail };
      }
    } catch {
      // If readNight throws, counts stays null
    }
    return { night, counts };
  });

  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights,
  };
}
