import type { Status } from '../status.js';

export function StatusBoard({ status }: { status: Status }) {
  return (
    <>
      <h1>status</h1>
      <table>
        <tbody>
          <tr><th>adapter</th><td>{status.adapter}</td></tr>
          <tr><th>installed</th><td>{status.installed}</td></tr>
          <tr>
            <th>last beat</th>
            <td>{status.lastBeat ? `${status.lastBeat.at} · pid ${status.lastBeat.pid}` : <span class="warn">none</span>}</td>
          </tr>
        </tbody>
      </table>
      <h2>nights on disk</h2>
      {status.nights.length === 0 ? (
        <p class="mute">nothing in runs/</p>
      ) : (
        <ul>
          {status.nights.map((summary) => (
            <li>
              <a href={`/digest/${summary.night}`}>{summary.night}</a> ok{' '}
              {summary.counts ? summary.counts.ok : '—'} · retry{' '}
              {summary.counts ? summary.counts.retry : '—'} · fail{' '}
              {summary.counts ? summary.counts.fail : '—'}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
