import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// Helper to extract table rows as arrays of cell contents
function parseTableRows(html: string): string[][] {
  const tbody = html.match(/<tbody>(.*?)<\/tbody>/s)?.[1] || '';
  const rows = tbody.match(/<tr[^>]*>.*?<\/tr>/gs) || [];
  return rows.map((row: string) => {
    const cells = row.match(/<td>([^<]*)<\/td>/g) || [];
    return cells.map((cell: string) => cell.match(/>([^<]*)</)?.[1] || '');
  });
}

// Helper to check if a row has the warn class
function hasWarnClass(html: string, jobName: string): boolean {
  const tbody = html.match(/<tbody>(.*?)<\/tbody>/s)?.[1] || '';
  const rows = tbody.match(/<tr[^>]*>.*?<\/tr>/gs) || [];
  const row = rows.find((r: string) => r.includes(`<td>${jobName}</td>`));
  if (!row) return false;
  return /<tr[^>]*class="warn"[^>]*>/.test(row) || /<tr[^>]*class="[^"]*warn[^"]*"[^>]*>/.test(row);
}

let tempRunsDir: string;
let app: any;

beforeAll(() => {
  tempRunsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));

  // 2026-11-01: Normal night with jobs out of order, various scenarios
  // Including one job with 3 retries, one with fail+error, one with null owner
  writeFileSync(
    join(tempRunsDir, '2026-11-01.jsonl'),
    [
      // Start with "z-job" to test sorting (should be last alphabetically)
      JSON.stringify({
        at: '2026-11-01T10:00:00+01:00',
        job: 'z-job',
        status: 'ok',
        owner: 'rook',
      }),
      // "build" with 3 retries then ok
      JSON.stringify({
        at: '2026-11-01T08:00:00+01:00',
        job: 'build',
        status: 'retry',
        owner: 'alice',
      }),
      JSON.stringify({
        at: '2026-11-01T08:05:00+01:00',
        job: 'build',
        status: 'retry',
        owner: 'alice',
      }),
      JSON.stringify({
        at: '2026-11-01T08:10:00+01:00',
        job: 'build',
        status: 'retry',
        owner: 'alice',
      }),
      JSON.stringify({
        at: '2026-11-01T08:15:00+01:00',
        job: 'build',
        status: 'ok',
        owner: 'alice',
      }),
      // "deploy" with fail and error, and null owner
      JSON.stringify({
        at: '2026-11-01T09:00:00+01:00',
        job: 'deploy',
        status: 'fail',
        owner: null,
        error: 'connection timeout',
      }),
      // "test" with ok status
      JSON.stringify({
        at: '2026-11-01T07:00:00+01:00',
        job: 'test',
        status: 'ok',
        owner: 'bob',
      }),
    ]
      .map((line) => line + '\n')
      .join(''),
  );

  // 2026-11-02: Empty night
  writeFileSync(join(tempRunsDir, '2026-11-02.jsonl'), '');

  // 2026-11-03: One bad line in the middle
  writeFileSync(
    join(tempRunsDir, '2026-11-03.jsonl'),
    [
      JSON.stringify({
        at: '2026-11-03T08:00:00+01:00',
        job: 'alpha',
        status: 'ok',
        owner: 'rook',
      }),
      // Invalid JSON (truncated object)
      '{{"broken": "json',
      JSON.stringify({
        at: '2026-11-03T09:00:00+01:00',
        job: 'beta',
        status: 'ok',
        owner: 'alice',
      }),
    ]
      .map((line) => line + '\n')
      .join(''),
  );

  // Note: No file for 2026-11-04 (to test 404)

  // Create app after temp dir is set up
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: tempRunsDir,
  });
});

afterAll(() => {
  rmSync(tempRunsDir, { recursive: true, force: true });
});

describe('digest routes', () => {
  describe('page route /digest/:night', () => {
    it('200 for an existing night with jobs', async () => {
      const res = await app.request('/digest/2026-11-01');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('digest 2026-11-01');
      expect(html).toContain('<table');
    });

    it('404 for a night with no file', async () => {
      const res = await app.request('/digest/2026-11-04');
      expect(res.status).toBe(404);
      const html = await res.text();
      expect(html).toContain('no such night');
    });

    it('404 for an invalid night format', async () => {
      const res = await app.request('/digest/bad');
      expect(res.status).toBe(404);
      const html = await res.text();
      expect(html).toContain('no such night');
    });

    it('shows "nothing ran" for an empty night', async () => {
      const res = await app.request('/digest/2026-11-02');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('nothing ran');
      expect(html).not.toContain('<table');
    });

    it('shows "unreadable lines: 1" for a night with one bad line', async () => {
      const res = await app.request('/digest/2026-11-03');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('unreadable lines: 1');
    });

    it('does not show "unreadable lines" when there are zero bad lines', async () => {
      const res = await app.request('/digest/2026-11-01');
      const html = await res.text();
      expect(html).not.toContain('unreadable lines');
    });

    it('table header cells are in lowercase', async () => {
      const res = await app.request('/digest/2026-11-01');
      const html = await res.text();
      const headers = [
        'job',
        'owner',
        'runs',
        'retries',
        'last status',
        'last error',
        'first',
        'last',
        'flag',
      ];
      for (const header of headers) {
        expect(html).toContain(`<th>${header}</th>`);
      }
    });

    it('flagged row (retries >= 3) has warn class', async () => {
      const res = await app.request('/digest/2026-11-01');
      const html = await res.text();
      // The "build" job has 3 retries, so should be flagged
      expect(hasWarnClass(html, 'build')).toBe(true);
    });

    it('flagged row (fail status) has warn class', async () => {
      const res = await app.request('/digest/2026-11-01');
      const html = await res.text();
      // The "deploy" job has fail status, so should be flagged
      expect(hasWarnClass(html, 'deploy')).toBe(true);
    });

    it('unflagged row has no warn class but has flag cell', async () => {
      const res = await app.request('/digest/2026-11-01');
      const html = await res.text();
      // The "z-job" has ok status and 0 retries, so unflagged
      expect(hasWarnClass(html, 'z-job')).toBe(false);
      // Should still have the "—" in the flag cell
      const tbody = html.match(/<tbody>(.*?)<\/tbody>/s)?.[1] || '';
      const rows = tbody.split('</tr>');
      const zJobRow = rows.find((row: string) => row.includes('>z-job<'));
      expect(zJobRow).toContain('—');
    });

    it('flag cell shows "retries" for job with >= 3 retries and ok status', async () => {
      const res = await app.request('/digest/2026-11-01');
      const html = await res.text();
      const tbody = html.match(/<tbody>(.*?)<\/tbody>/s)?.[1] || '';
      const buildRow = tbody.match(/<tr[^>]*>.*?<td>build<\/td>.*?<\/tr>/s)?.[0] || '';
      const cells = buildRow.match(/<td>[^<]*<\/td>/g) || [];
      // Last cell should be the flag cell
      expect(cells[cells.length - 1]).toContain('retries');
    });

    it('flag cell shows "fail" for job with fail status and < 3 retries', async () => {
      const res = await app.request('/digest/2026-11-01');
      const html = await res.text();
      const tbody = html.match(/<tbody>(.*?)<\/tbody>/s)?.[1] || '';
      const deployRow = tbody.match(/<tr[^>]*>.*?<td>deploy<\/td>.*?<\/tr>/s)?.[0] || '';
      const cells = deployRow.match(/<td>[^<]*<\/td>/g) || [];
      expect(cells[cells.length - 1]).toContain('fail');
    });

    it('null owner shows as —', async () => {
      const res = await app.request('/digest/2026-11-01');
      const html = await res.text();
      const tbody = html.match(/<tbody>(.*?)<\/tbody>/s)?.[1] || '';
      // The "deploy" job has null owner
      const deployRow = tbody.match(/<tr[^>]*>.*?<td>deploy<\/td>.*?<\/tr>/s)?.[0] || '';
      expect(deployRow).toContain('—');
    });

    it('jobs in table are sorted by job name', async () => {
      const res = await app.request('/digest/2026-11-01');
      const html = await res.text();
      const rows = parseTableRows(html);
      const jobNames = rows.map((row) => row[0]); // First cell is job name
      // Should be in order: build, deploy, test, z-job
      expect(jobNames).toEqual(['build', 'deploy', 'test', 'z-job']);
    });
  });

  describe('JSON route /api/digest/:night', () => {
    it('200 for an existing night', async () => {
      const res = await app.request('/api/digest/2026-11-01');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
      const body = await res.json();
      expect(body).toHaveProperty('night');
      expect(body).toHaveProperty('rows');
      expect(body).toHaveProperty('badLines');
    });

    it('404 with error message for a night with no file', async () => {
      const res = await app.request('/api/digest/2026-11-04');
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: 'no such night' });
    });

    it('404 with error message for invalid night', async () => {
      const res = await app.request('/api/digest/bad');
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: 'no such night' });
    });

    it('empty night returns empty rows and badLines=0', async () => {
      const res = await app.request('/api/digest/2026-11-02');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Night;
      expect(body.night).toBe('2026-11-02');
      expect(body.rows).toEqual([]);
      expect(body.badLines).toBe(0);
    });

    it('night with bad line returns badLines=1', async () => {
      const res = await app.request('/api/digest/2026-11-03');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Night;
      expect(body.night).toBe('2026-11-03');
      expect(body.badLines).toBe(1);
      expect(body.rows.length).toBe(2);
    });

    it('rows are sorted by job name', async () => {
      const res = await app.request('/api/digest/2026-11-01');
      const body = (await res.json()) as Night;
      const jobNames = body.rows.map((r) => r.job);
      expect(jobNames).toEqual(['build', 'deploy', 'test', 'z-job']);
    });

    it('returns correct job data for a normal night', async () => {
      const res = await app.request('/api/digest/2026-11-01');
      const body = (await res.json()) as Night;
      expect(body.night).toBe('2026-11-01');
      expect(body.rows.length).toBe(4);
      expect(body.badLines).toBe(0);
    });

    it('build job has 3 retries and ok final status', async () => {
      const res = await app.request('/api/digest/2026-11-01');
      const body = (await res.json()) as Night;
      const buildRow = body.rows.find((r) => r.job === 'build');
      expect(buildRow).toBeDefined();
      expect(buildRow?.retries).toBe(3);
      expect(buildRow?.runs).toBe(4);
      expect(buildRow?.lastStatus).toBe('ok');
    });

    it('deploy job has fail status and error message', async () => {
      const res = await app.request('/api/digest/2026-11-01');
      const body = (await res.json()) as Night;
      const deployRow = body.rows.find((r) => r.job === 'deploy');
      expect(deployRow).toBeDefined();
      expect(deployRow?.lastStatus).toBe('fail');
      expect(deployRow?.lastError).toBe('connection timeout');
    });

    it('deploy job has null owner', async () => {
      const res = await app.request('/api/digest/2026-11-01');
      const body = (await res.json()) as Night;
      const deployRow = body.rows.find((r) => r.job === 'deploy');
      expect(deployRow?.owner).toBeNull();
    });
  });

  describe('page and JSON consistency', () => {
    it('job names in page table appear in same order as JSON rows for 2026-11-01', async () => {
      const pageRes = await app.request('/digest/2026-11-01');
      const jsonRes = await app.request('/api/digest/2026-11-01');

      const pageHtml = await pageRes.text();
      const jsonBody = (await jsonRes.json()) as Night;

      // Extract job names from page table
      const rows = parseTableRows(pageHtml);
      const pageJobs = rows.map((row) => row[0]); // First cell is job name

      // Get job names from JSON
      const jsonJobs = jsonBody.rows.map((r) => r.job);

      expect(pageJobs).toEqual(jsonJobs);
    });
  });
});
