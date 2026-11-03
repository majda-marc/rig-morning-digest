import type { Night } from '../digest/types.js';

export function DigestPage({ night }: { night: Night }) {
  const flagText = (retries: number, lastStatus: string): string => {
    const parts: string[] = [];
    if (retries >= 3) parts.push('retries');
    if (lastStatus === 'fail') parts.push('fail');
    return parts.length > 0 ? parts.join(' ') : '—';
  };

  return (
    <>
      <h1>digest {night.night}</h1>
      {night.badLines > 0 && <p class="warn">unreadable lines: {night.badLines}</p>}
      {night.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
              <th>flag</th>
            </tr>
          </thead>
          <tbody>
            {night.rows.map((row) => {
              const flag = flagText(row.retries, row.lastStatus);
              const isWarned = flag !== '—';
              return (
                <tr class={isWarned ? 'warn' : ''}>
                  <td>{row.job}</td>
                  <td>{row.owner === null || row.owner === '' ? '—' : row.owner}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.lastStatus}</td>
                  <td>{row.lastError === null ? '—' : row.lastError}</td>
                  <td>{row.first}</td>
                  <td>{row.last}</td>
                  <td>{flag}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
