import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/types.js';

// runs/ holds real nights and is read-only: everything the tests write goes under `tmp`.
const realRuns = fileURLToPath(new URL('../runs', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
const tmpRuns = join(tmp, 'runs');
mkdirSync(tmpRuns);
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const NIGHT = '2026-01-01';
const T1 = '2026-01-01T01:00:00+01:00';
const T2 = '2026-01-01T02:00:00+01:00';
const T3 = '2026-01-01T03:00:00+01:00';
const T4 = '2026-01-01T04:00:00+01:00';

const log = (...entries: object[]) => entries.map((e) => JSON.stringify(e)).join('\n') + '\n';

function readText(text: string) {
  writeFileSync(join(tmpRuns, `${NIGHT}.jsonl`), text);
  return readNight(tmpRuns, NIGHT);
}

describe('readNight on the real nights', () => {
  it('2026-10-28 gives 5 jobs in order and 1 bad line', () => {
    const night = readNight(realRuns, '2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('2026-10-28 gives the exact rows', () => {
    expect(readNight(realRuns, '2026-10-28')).toStrictEqual({
      night: '2026-10-28',
      badLines: 1,
      rows: [
        {
          job: 'digest/render',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          first: '2026-10-29T05:41:09+01:00',
          last: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh',
          owner: 'rook',
          runs: 4,
          retries: 3,
          lastStatus: 'ok',
          lastError: 'upstream 503',
          first: '2026-10-29T01:30:00+01:00',
          last: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync',
          owner: 'rook',
          runs: 8,
          retries: 1,
          lastStatus: 'ok',
          lastError: 'lock held',
          first: '2026-10-28T23:00:06+01:00',
          last: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: 'quota exceeded',
          first: '2026-10-29T04:00:01+01:00',
          last: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          first: '2026-10-28T23:00:02+01:00',
          last: '2026-10-28T23:00:02+01:00',
        },
      ],
    });
  });

  it('2026-10-27 gives 4 jobs, the exact rows and no bad line', () => {
    expect(readNight(realRuns, '2026-10-27')).toStrictEqual({
      night: '2026-10-27',
      badLines: 0,
      rows: [
        {
          job: 'fixtures/refresh',
          owner: 'rook',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          first: '2026-10-28T01:30:00+01:00',
          last: '2026-10-28T01:30:00+01:00',
        },
        {
          job: 'lane/sync',
          owner: 'rook',
          runs: 4,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          first: '2026-10-27T23:00:05+01:00',
          last: '2026-10-28T05:00:04+01:00',
        },
        {
          job: 'notes/backup',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          first: '2026-10-28T04:00:01+01:00',
          last: '2026-10-28T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          first: '2026-10-27T23:00:03+01:00',
          last: '2026-10-27T23:00:03+01:00',
        },
      ],
    });
  });
});

describe('readNight on a temp runs dir', () => {
  it('keeps a row whose owner is null or missing', () => {
    const night = readText(
      log({ at: T1, job: 'a', status: 'ok', owner: null }, { at: T2, job: 'b', status: 'ok' }),
    );
    expect(night?.badLines).toBe(0);
    expect(night?.rows).toMatchObject([
      { job: 'a', owner: null, runs: 1 },
      { job: 'b', owner: null, runs: 1 },
    ]);
  });

  it('takes the owner from the latest line that has one', () => {
    const night = readText(
      log(
        { at: T1, job: 'a', status: 'ok', owner: 'rook' },
        { at: T2, job: 'a', status: 'ok', owner: 'lane-07' },
        { at: T3, job: 'a', status: 'ok', owner: null },
      ),
    );
    expect(night?.rows).toMatchObject([{ job: 'a', owner: 'lane-07', runs: 3 }]);
  });

  it.each([
    ['text that is not JSON', 'not json'],
    ['a cut-off line', `{"at":"${T3}","job":"a","stat`],
    ['null', 'null'],
    ['an array', '[]'],
    ['a number', '5'],
    ['an entry without at', '{"job":"a","status":"ok","owner":null}'],
    ['an entry without job', `{"at":"${T3}","status":"ok","owner":null}`],
    ['an entry with an unknown status', `{"at":"${T3}","job":"a","status":"done","owner":null}`],
    ['an entry with an empty at', '{"at":"","job":"a","status":"ok","owner":null}'],
    ['an entry with an empty job', `{"at":"${T3}","job":"","status":"ok","owner":null}`],
    ['an entry with a numeric owner', `{"at":"${T3}","job":"a","status":"ok","owner":5}`],
    ['an entry with a numeric error', `{"at":"${T3}","job":"a","status":"ok","error":5}`],
  ])('counts %s as a bad line and keeps reading', (_what, bad) => {
    const text =
      log({ at: T1, job: 'a', status: 'ok', owner: 'rook' }) +
      `${bad}\n` +
      log({ at: T2, job: 'a', status: 'ok', owner: 'rook' });
    const night = readText(text);
    expect(night?.badLines).toBe(1);
    expect(night?.rows).toMatchObject([{ job: 'a', runs: 2 }]);
  });

  it('ignores blank and whitespace-only lines', () => {
    const a = JSON.stringify({ at: T1, job: 'a', status: 'ok', owner: 'rook' });
    const b = JSON.stringify({ at: T2, job: 'a', status: 'ok', owner: 'rook' });
    const night = readText(`\n${a}\n   \n\t\n${b}\n\n`);
    expect(night?.badLines).toBe(0);
    expect(night?.rows).toMatchObject([{ job: 'a', runs: 2 }]);
  });

  it('reads a CRLF file', () => {
    const a = JSON.stringify({ at: T1, job: 'a', status: 'retry', owner: 'rook', error: 'boom' });
    const b = JSON.stringify({ at: T2, job: 'b', status: 'ok', owner: null });
    // A blank line in the middle and a CRLF after the last line.
    expect(readText([a, '', b, ''].join('\r\n'))).toStrictEqual({
      night: NIGHT,
      badLines: 0,
      rows: [
        {
          job: 'a',
          owner: 'rook',
          runs: 1,
          retries: 1,
          lastStatus: 'retry',
          lastError: 'boom',
          first: T1,
          last: T1,
        },
        {
          job: 'b',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          first: T2,
          last: T2,
        },
      ],
    });
  });

  it('gives no rows and no bad lines for an empty file', () => {
    expect(readText('')).toStrictEqual({ night: NIGHT, badLines: 0, rows: [] });
  });

  it('gives null when the night has no file', () => {
    expect(readNight(tmpRuns, '2031-12-31')).toBeNull();
    expect(readNight(join(tmp, 'no-such-dir'), NIGHT)).toBeNull();
  });

  it.each(['../x', '2026-1-1', ''])(
    'gives null for the night %j even when the file it would name exists',
    (night) => {
      writeFileSync(
        join(tmpRuns, `${night}.jsonl`),
        log({ at: T1, job: 'a', status: 'ok', owner: 'rook' }),
      );
      expect(readNight(tmpRuns, night)).toBeNull();
    },
  );

  it('keeps the latest error after a job recovers', () => {
    const night = readText(
      log(
        { at: T1, job: 'a', status: 'retry', owner: 'rook', error: 'upstream 503' },
        { at: T1, job: 'b', status: 'ok', owner: 'rook' },
        { at: T2, job: 'a', status: 'retry', owner: 'rook', error: 'upstream 504' },
        { at: T3, job: 'a', status: 'ok', owner: 'rook' },
        { at: T4, job: 'a', status: 'ok', owner: 'rook', error: '' },
      ),
    );
    expect(night?.rows).toMatchObject([
      { job: 'a', runs: 4, retries: 2, lastStatus: 'ok', lastError: 'upstream 504' },
      { job: 'b', runs: 1, retries: 0, lastStatus: 'ok', lastError: null },
    ]);
  });

  it('keeps first and last exactly as written, offset included', () => {
    const night = readText(
      log(
        { at: '2026-03-29T01:30:00+01:00', job: 'a', status: 'ok', owner: 'rook' },
        { at: '2026-03-29T03:15:00.250+02:00', job: 'a', status: 'ok', owner: 'rook' },
        { at: '2026-03-28T20:00:00-03:30', job: 'b', status: 'ok', owner: 'rook' },
        { at: '2026-03-29T00:00:00Z', job: 'c', status: 'ok', owner: 'rook' },
      ),
    );
    expect(night?.rows).toMatchObject([
      { job: 'a', first: '2026-03-29T01:30:00+01:00', last: '2026-03-29T03:15:00.250+02:00' },
      { job: 'b', first: '2026-03-28T20:00:00-03:30', last: '2026-03-28T20:00:00-03:30' },
      { job: 'c', first: '2026-03-29T00:00:00Z', last: '2026-03-29T00:00:00Z' },
    ]);
  });

  it('sorts jobs by code unit, not by locale', () => {
    const jobs = ['a', 'B', '_x', '\u00e9', 'Z', 'b'];
    const night = readText(
      log(...jobs.map((job) => ({ at: T1, job, status: 'ok', owner: null }))),
    );
    expect(night?.rows.map((r) => r.job)).toEqual(['B', 'Z', '_x', 'a', 'b', '\u00e9']);
  });
});
