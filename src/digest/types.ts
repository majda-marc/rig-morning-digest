export type DigestStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  // Log lines of the job.
  runs: number;
  // Lines of the job with status `retry`.
  retries: number;
  // Status of the job's last line.
  lastStatus: DigestStatus;
  // `error` of the job's latest line that has one, else `null`.
  lastError: string | null;
  // `at` of the job's first line, as written in the log, offset kept (docs/styleguide.md).
  first: string;
  // `at` of the job's last line, as written in the log, offset kept.
  last: string;
};

// The result for one night. Also the JSON body of GET /api/digest/:night.
export type Night = {
  // YYYY-MM-DD
  night: string;
  // One row per job, sorted by job.
  rows: DigestRow[];
  // Lines that did not parse.
  badLines: number;
};

// `null` means "no file for that night" (the routes answer 404).
export { readNight } from './read.js';
