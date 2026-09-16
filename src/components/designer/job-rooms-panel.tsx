'use client';
import type { Design } from '@/designer/model';

/** Same shape the other panels take; declared here to stay standalone. */
type Commit = (
  change: (current: Design) => Design,
  protectPlacement?: boolean,
) => void;
import {
  jobItemList,
  jobTotals,
  jobsFrom,
  roomsInJob,
} from '@/designer/job-rooms';
import { money } from '@/designer/quote';

/**
 * The rooms of one job, and what they come to together.
 *
 * A design is one room. A job that covers a kitchen, a vanity and a laundry
 * is three designs sharing a job, each keeping its own drawings and its own
 * approval, with the money and the ordering list added up here.
 */
export function JobRooms({
  design,
  saved,
  commit,
}: {
  design: Design;
  saved: Design[];
  commit: Commit;
}) {
  // The open design may be newer than the copy in the saved list.
  const all = [design, ...saved.filter((d) => d.id !== design.id)];
  const jobs = jobsFrom(all);
  const current = design.job;
  const rooms = current ? roomsInJob(all, current.id) : [];
  const totals = jobTotals(rooms);
  const lines = jobItemList(rooms);
  return (
    <div className="job-rooms">
      <div className="designer-row">
        <label>
          Job
          <select
            aria-label="Job this room belongs to"
            value={current?.id ?? ''}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return commit((d) => ({ ...d, job: undefined }));
              if (id === 'new')
                return commit((d) => ({
                  ...d,
                  job: {
                    id: crypto.randomUUID(),
                    name: d.name,
                    room: d.job?.room ?? '',
                  },
                }));
              const name = jobs.find((j) => j.id === id)?.name ?? '';
              return commit((d) => ({
                ...d,
                job: { id, name, room: d.job?.room ?? '' },
              }));
            }}
          >
            <option value="">Not part of a job</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.name}
              </option>
            ))}
            <option value="new">New job from this design…</option>
          </select>
        </label>
        {current && (
          <>
            <label>
              Job name
              <input
                aria-label="Job name"
                value={current.name}
                maxLength={100}
                onChange={(e) =>
                  commit((d) => ({
                    ...d,
                    job: current && { ...current, name: e.target.value },
                  }))
                }
              />
            </label>
            <label>
              This room
              <input
                aria-label="Room name"
                placeholder={design.name}
                value={current.room}
                maxLength={100}
                onChange={(e) =>
                  commit((d) => ({
                    ...d,
                    job: current && { ...current, room: e.target.value },
                  }))
                }
              />
            </label>
          </>
        )}
      </div>
      {current ? (
        <>
          <table className="job-room-table">
            <tbody>
              {rooms.map((r) => (
                <tr key={r.design.id}>
                  <th scope="row">
                    {r.room}
                    {r.design.id === design.id ? ' · open' : ''}
                  </th>
                  <td>{r.items} items</td>
                  <td>{money(r.total)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">
                  {totals.rooms} room{totals.rooms === 1 ? '' : 's'}
                </th>
                <td>{totals.items} items</td>
                <td>
                  <strong>{money(totals.total)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="designer-muted">
            Each room keeps its own tax, discount and delivery; this adds them
            up as they stand rather than re-pricing one room against another
            room&apos;s assumptions. Rooms appear once they are saved. Demo
            prices, not a supplier quotation.
          </p>
          <details>
            <summary>Ordering list across the job ({lines.length})</summary>
            <ul className="job-room-list">
              {lines.map((line) => (
                <li key={`${line.sku}|${line.size}`}>
                  {line.quantity} × {line.sku} · {line.size} ·{' '}
                  {line.rooms.join(', ')}
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <p className="designer-muted">
          A design holds one room. Put several in a job - a kitchen, a vanity, a
          laundry - and their quotes and ordering list add up here, while each
          keeps its own drawings and approval.
        </p>
      )}
    </div>
  );
}
