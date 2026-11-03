import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, Night } from './types.js';

// One line of runs/<night>.jsonl. A missing `owner` reads as null.
type Entry = {
  at: string;
  job: string;
  status: DigestStatus;
  owner?: string | null;
  error?: string;
};

function isEntry(value: unknown): value is Entry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  if (!('at' in value && 'job' in value && 'status' in value)) return false;
  const { at, job, status } = value;
  if (typeof at !== 'string' || at === '') return false;
  if (typeof job !== 'string' || job === '') return false;
  if (status !== 'ok' && status !== 'retry' && status !== 'fail') return false;
  if ('owner' in value && value.owner !== null && typeof value.owner !== 'string') return false;
  if ('error' in value && typeof value.error !== 'string') return false;
  return true;
}

function parseLine(line: string): Entry | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  return isEntry(value) ? value : null;
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT';
}

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

export function readNight(runsDir: string, night: string): Night | null {
  // Checked before any file access: only a plain date ever reaches the path.
  if (!NIGHT.test(night)) return null;

  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }

  const jobs = new Map<string, DigestRow>();
  let badLines = 0;

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const entry = parseLine(line);
    if (entry === null) {
      badLines += 1;
      continue;
    }

    let row = jobs.get(entry.job);
    if (row === undefined) {
      row = {
        job: entry.job,
        owner: null,
        runs: 0,
        retries: 0,
        lastStatus: entry.status,
        lastError: null,
        first: entry.at,
        last: entry.at,
      };
      jobs.set(entry.job, row);
    }
    row.runs += 1;
    if (entry.status === 'retry') row.retries += 1;
    row.lastStatus = entry.status;
    if (entry.error) row.lastError = entry.error;
    row.owner = entry.owner ?? row.owner;
    row.last = entry.at;
  }

  // Code-unit order, not localeCompare: the same order on every machine.
  const rows = [...jobs.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines };
}
