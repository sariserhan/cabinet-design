'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type Design, itemPolygon } from '@/designer/model';
import { roomOutline } from '@/designer/room';
import { money } from '@/designer/quote';
import {
  customerComparisonHtml,
  approvedRevision,
  emptyJobWorkflow,
  installerPackage,
  jobFingerprint,
  jobWorkflowSchema,
  measurementRows,
  optionComparison,
  orderRows,
  parseJobWorkflow,
  pilotSummary,
  pilotTasks,
  releaseIssues,
  revisionDiff,
  tiers,
  type JobWorkflow,
} from '@/designer/job-workflow';
import { projectDataChanged } from '@/designer/local-project-events';
import { compactPhoto } from './compact-photo';
import { openProjectTool } from './project-hub';
import { downloadJson } from './business-tools';
const at = () => new Date().toISOString();
type Props = {
  design: Design;
  ownerId: string;
  onApply: (d: Design) => void;
  onLocate: (id: string) => void;
};
export function JobWorkspace(props: Props) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className="business-panel job-workspace"
      onToggle={(e) => setOpened(e.currentTarget.open)}
    >
      <summary>Job workflow · site to installation</summary>
      {opened && <JobWorkspaceContents {...props} />}
    </details>
  );
}
function JobWorkspaceContents({
  design,
  ownerId,
  onApply,
  onLocate,
}: {
  design: Design;
  ownerId: string;
  onApply: (d: Design) => void;
  onLocate: (id: string) => void;
}) {
  const key = `kitchen-job:${ownerId}:${design.id}`;
  const [value, setValue] = useState(() => emptyJobWorkflow(design.id));
  const raw = useRef<string | null>(null),
    alive = useRef(true),
    latest = useRef(value);
  latest.current = value;
  const [ready, setReady] = useState(false),
    [message, setMessage] = useState(''),
    [reviewer, setReviewer] = useState(''),
    [tab, setTab] = useState('Site'),
    [revisionId, setRevisionId] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    alive.current = true;
    const read = () => {
      try {
        const text = localStorage.getItem(key);
        const next = text
          ? parseJobWorkflow(text, design.id, true)
          : emptyJobWorkflow(design.id);
        raw.current = text;
        setValue(next);
        setReady(true);
      } catch {
        setReady(false);
        setMessage(
          'Job records could not be read. Recover the saved records before replacing them.',
        );
      }
    };
    read();
    const changed = (e: StorageEvent) => {
      if (e.key === key) read();
    };
    window.addEventListener('storage', changed);
    return () => {
      alive.current = false;
      window.removeEventListener('storage', changed);
    };
  }, [key, design.id]);
  function save(next: JobWorkflow) {
    const checked = jobWorkflowSchema.parse(next);
    if (localStorage.getItem(key) !== raw.current)
      throw Error(
        'Job records changed in another tab. Reopen this project before saving.',
      );
    const text = JSON.stringify(checked);
    parseJobWorkflow(text, design.id, true);
    localStorage.setItem(key, text);
    raw.current = text;
    latest.current = checked;
    setValue(checked);
    projectDataChanged();
    setMessage('Job records saved on this browser.');
  }
  function act(fn: () => void) {
    try {
      fn();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Could not complete this action.',
      );
    }
  }
  const measurements = useMemo(() => measurementRows(design), [design]),
    checks = useMemo(() => orderRows(design), [design]),
    issues = useMemo(() => releaseIssues(design, value), [design, value]);
  const approved = approvedRevision(design, value),
    previous =
      value.revisions.find((r) => r.id === revisionId) ??
      value.revisions.at(-1),
    changes = previous ? revisionDiff(previous.design, design) : [];
  function evidence(
    kind: 'measurements' | 'checks',
    row: { key: string; basis: string },
    note: string,
    status: 'verified' | 'needs_change',
  ) {
    save({
      ...value,
      [kind]: [
        ...value[kind].filter((v) => v.key !== row.key),
        {
          key: row.key,
          basis: row.basis,
          by: reviewer.trim(),
          at: at(),
          note,
          status,
        },
      ],
    });
  }
  async function handoff(release: boolean) {
    setBusy(true);
    try {
      const files = installerPackage(design, value, reviewer, release);
      const { zipSync, strToU8 } = await import('fflate');
      if (!alive.current) return;
      const zipped = zipSync(
        Object.fromEntries(
          Object.entries(files).map(([k, v]) => [k, strToU8(v)]),
        ),
      );
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(zipped)], { type: 'application/zip' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `installer-${release ? 'reviewed' : 'draft'}-${jobFingerprint(design).slice(0, 12)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        'Installer package downloaded. Open index.html after extracting the ZIP.',
      );
    } catch (e) {
      if (alive.current) setMessage((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const evidenceList = (
    kind: 'measurements' | 'checks',
    rows: { key: string; label: string; basis: string }[],
  ) =>
    rows.map((row) => {
      const recorded = value[kind].find((e) => e.key === row.key),
        current =
          recorded?.basis === row.basis && recorded.status === 'verified';
      return (
        <article className="job-card" key={row.key}>
          <strong>{row.label}</strong>
          <p>
            {current
              ? `Verified by ${recorded.by} · ${new Date(recorded.at).toLocaleDateString()}`
              : recorded
                ? recorded.status === 'needs_change'
                  ? 'Needs correction — see recorded finding'
                  : recorded.status === 'unverified'
                    ? 'Imported evidence — verification required'
                    : 'Changed since verification — recheck required'
                : 'Not verified'}
          </p>
          {recorded && <p>{recorded.note}</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                note = String(new FormData(form).get('note') ?? '');
              act(() => {
                evidence(
                  kind,
                  row,
                  note,
                  new FormData(form).get('status') as
                    'verified' | 'needs_change',
                );
                form.reset();
              });
            }}
          >
            <label>
              Observed value / source and review notes
              <input
                name="note"
                aria-label={`Evidence for ${row.key}`}
                required
                maxLength={1500}
              />
            </label>
            <label>
              Review outcome
              <select
                name="status"
                aria-label={`Review outcome for ${row.key}`}
              >
                <option value="verified">Checked and matches</option>
                <option value="needs_change">Needs correction</option>
              </select>
            </label>
            <button disabled={!reviewer.trim()}>
              {current ? 'Update verification' : 'Record verification'}
            </button>
            {recorded && (
              <button
                type="button"
                onClick={() =>
                  act(() =>
                    save({
                      ...value,
                      [kind]: value[kind].filter((e) => e.key !== row.key),
                    }),
                  )
                }
              >
                Clear verification
              </button>
            )}
            {row.key.startsWith('product:') && (
              <button type="button" onClick={() => onLocate(row.key.slice(8))}>
                Locate item
              </button>
            )}
          </form>
        </article>
      );
    });
  return (
    <div>
      <p>
        Verify the site, compare options, review the order and issue one
        coordinated handoff. Checks are recorded attestations; customer sign-off
        here records an approval received outside the app.
      </p>
      <label>
        Recorded by / package preparer
        <input
          aria-label="Job reviewer"
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value)}
          maxLength={120}
        />
      </label>
      <nav aria-label="Job workflow sections" className="designer-row">
        {['Site', 'Order', 'Options', 'Revisions', 'Handoff', 'Pilot'].map(
          (t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t}
            </button>
          ),
        )}
      </nav>
      <p role="status">{message}</p>
      <fieldset
        disabled={!ready || busy}
        style={{ border: 0, padding: 0, minWidth: 0 }}
      >
        {tab === 'Site' && (
          <section aria-label="Site verification">
            <h3>Measured site checklist</h3>
            <p>
              Dimensions below are in inches. Use the measurement wizard to
              enter or correct room dimensions, openings and utility locations,
              then record the actual site readings here.
            </p>
            <button onClick={() => openProjectTool('Guided room measurements')}>
              Open new-room measurement wizard
            </button>
            {evidenceList('measurements', measurements)}
            <h3>Site photos ({value.photos.length}/8)</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  data = new FormData(form),
                  file = data.get('photo');
                if (!(file instanceof File) || !file.size) return;
                setBusy(true);
                try {
                  const url = await compactPhoto(file);
                  if (alive.current) {
                    save({
                      ...latest.current,
                      photos: [
                        ...latest.current.photos,
                        {
                          id: crypto.randomUUID(),
                          caption: String(data.get('caption') ?? ''),
                          url,
                        },
                      ],
                    });
                    form.reset();
                  }
                } catch (error) {
                  if (alive.current) setMessage((error as Error).message);
                } finally {
                  if (alive.current) setBusy(false);
                }
              }}
            >
              <label>
                Photo description
                <input
                  name="caption"
                  aria-label="Site photo description"
                  required
                  maxLength={1500}
                />
              </label>
              <label>
                Site image
                <input
                  name="photo"
                  aria-label="Job site photo"
                  type="file"
                  accept="image/*"
                  required
                />
              </label>
              <button disabled={value.photos.length >= 8}>
                Attach site photo
              </button>
            </form>
            <div className="job-options">
              {value.photos.map((p) => (
                <figure key={p.id}>
                  <img src={p.url} alt={p.caption} width={240} />
                  <figcaption>{p.caption}</figcaption>
                  <button
                    onClick={() =>
                      act(() =>
                        save({
                          ...value,
                          photos: value.photos.filter((x) => x.id !== p.id),
                        }),
                      )
                    }
                  >
                    Remove photo
                  </button>
                </figure>
              ))}
            </div>
          </section>
        )}
        {tab === 'Order' && (
          <section aria-label="Order readiness">
            <h3>
              {issues.length
                ? `${issues.length} checks before release`
                : 'Ready for reviewed coordination release'}
            </h3>
            <p>
              Review exact supplier specifications and prices. Recording a check
              does not clear calculated layout warnings. Existing purchase
              drafts remain available for review.
            </p>
            <details>
              <summary>Outstanding release checks</summary>
              <ul>
                {issues.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </details>
            {evidenceList('checks', checks)}
            <button
              onClick={() => openProjectTool('Orders, changes & deliveries')}
            >
              Open purchasing workspace
            </button>
          </section>
        )}
        {tab === 'Options' && (
          <section aria-label="Customer options">
            <h3>Good / Better / Best</h3>
            <p>
              Save the current design into each tier after making its changes.
              Prices below use the demo estimator, not supplier quotations;
              verify supplier prices before ordering.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget),
                  tier = f.get('tier') as (typeof tiers)[number];
                act(() =>
                  save({
                    ...value,
                    options: [
                      ...value.options.filter((o) => o.tier !== tier),
                      {
                        tier,
                        scope: String(f.get('scope') ?? ''),
                        design: structuredClone(design),
                      },
                    ],
                  }),
                );
              }}
            >
              <label>
                Option tier
                <select name="tier" aria-label="Customer option tier">
                  {tiers.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Included scope and exclusions
                <textarea
                  name="scope"
                  aria-label="Customer option scope"
                  required
                  maxLength={1500}
                />
              </label>
              <button>Save current customer option</button>
            </form>
            <div className="job-options">
              {optionComparison(value).map((o) => (
                <article className="job-card" key={o.tier}>
                  <h4>
                    {o.tier} · {money(o.total)} estimated
                  </h4>
                  <p>
                    {money(o.delta)} versus{' '}
                    {value.options.some((o) => o.tier === 'Good')
                      ? 'Good'
                      : 'first saved option'}
                  </p>
                  <svg
                    role="img"
                    aria-label={`${o.tier} option plan`}
                    viewBox={`-8 -8 ${o.design.room.width + 16} ${o.design.room.depth + 16}`}
                  >
                    <polygon
                      points={roomOutline(o.design.room)
                        .map((p) => `${p.x},${p.y}`)
                        .join(' ')}
                      fill="#f1f4ef"
                      stroke="#698076"
                    />
                    {o.design.items
                      .filter((i) => !i.hidden)
                      .map((i) => (
                        <polygon
                          key={i.id}
                          points={itemPolygon(i)
                            .map((p) => `${p.x},${p.y}`)
                            .join(' ')}
                          fill={
                            {
                              linen: '#e7e0d4',
                              oak: '#b79365',
                              slate: '#53626b',
                            }[i.finish ?? o.design.finish]
                          }
                          stroke="#354b43"
                        />
                      ))}
                  </svg>
                  <p>{o.scope}</p>
                  <p>
                    {o.design.items.length} items · {o.design.finish} cabinets ·{' '}
                    {o.design.appearance?.countertop ?? 'quartz'} worktops
                  </p>
                  <details>
                    <summary>
                      {o.changes.length} differences from baseline option
                    </summary>
                    <ul>
                      {o.changes.map((c) => (
                        <li key={c.field}>
                          <strong>{c.label}</strong>: {c.before} → {c.after}
                        </li>
                      ))}
                    </ul>
                  </details>
                  <button onClick={() => onApply(structuredClone(o.design))}>
                    Load {o.tier} option
                  </button>
                </article>
              ))}
            </div>
            <button
              disabled={!value.options.length}
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([customerComparisonHtml(value)], {
                    type: 'text/html',
                  }),
                );
                const a = document.createElement('a');
                a.href = url;
                a.download = 'customer-options.html';
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              Export customer comparison
            </button>
          </section>
        )}
        {tab === 'Revisions' && (
          <section aria-label="Revision approval">
            <h3>
              {approved
                ? `Current revision signed off: ${approved.title}`
                : value.revisions.some((r) => r.approval)
                  ? 'Design changed after sign-off — approval required'
                  : 'Current revision needs customer sign-off'}
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  f = new FormData(form);
                act(() => {
                  save({
                    ...value,
                    revisions: [
                      ...value.revisions,
                      {
                        id: crypto.randomUUID(),
                        title: String(f.get('title') ?? ''),
                        reason: String(f.get('reason') ?? ''),
                        at: at(),
                        design: structuredClone(design),
                      },
                    ],
                  });
                  form.reset();
                });
              }}
            >
              <label>
                Revision title
                <input
                  aria-label="Job revision title"
                  name="title"
                  required
                  maxLength={120}
                />
              </label>
              <label>
                Reason for revision
                <textarea
                  aria-label="Job revision reason"
                  name="reason"
                  required
                  maxLength={1500}
                />
              </label>
              <button disabled={value.revisions.length >= 8}>
                Save job revision
              </button>
            </form>
            <label>
              Compare revision to current design
              <select
                aria-label="Job revision comparison"
                value={previous?.id ?? ''}
                onChange={(e) => setRevisionId(e.target.value)}
              >
                <option value="">Choose revision</option>
                {value.revisions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                    {r.approval ? ' · signed off' : ''}
                  </option>
                ))}
              </select>
            </label>
            {previous && (
              <>
                <p>
                  {previous.reason} · {previous.at}
                </p>
                <p>
                  {changes.length} changed fields since {previous.title}.
                </p>
                <div className="job-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Before</th>
                        <th>Current</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map((c) => (
                        <tr key={c.field}>
                          <td>{c.label}</td>
                          <td>{c.before}</td>
                          <td>{c.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {previous.approval && (
                  <p>
                    Sign-off recorded for {previous.approval.customer} by{' '}
                    {previous.approval.recordedBy}:{' '}
                    {previous.approval.reference}.{' '}
                    {jobFingerprint(previous.design) !== jobFingerprint(design)
                      ? 'This sign-off does not cover current changes.'
                      : ''}
                  </p>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    act(() => {
                      if (
                        jobFingerprint(previous.design) !==
                        jobFingerprint(design)
                      )
                        throw Error(
                          'Save a revision of the current design before recording sign-off.',
                        );
                      save({
                        ...value,
                        revisions: value.revisions.map((r) =>
                          r.id === previous.id
                            ? {
                                ...r,
                                approval: {
                                  customer: String(f.get('customer') ?? ''),
                                  recordedBy: reviewer.trim(),
                                  reference: String(f.get('reference') ?? ''),
                                  at: at(),
                                },
                              }
                            : r,
                        ),
                      });
                    });
                  }}
                >
                  <label>
                    Customer name
                    <input
                      aria-label="Job approval customer"
                      name="customer"
                      required
                      maxLength={120}
                    />
                  </label>
                  <label>
                    Approval evidence / reference
                    <textarea
                      aria-label="Job approval reference"
                      name="reference"
                      required
                      maxLength={1500}
                    />
                  </label>
                  <label>
                    <input type="checkbox" required /> I received approval for
                    this exact revision and am recording it accurately.
                  </label>
                  <button
                    disabled={
                      !reviewer.trim() ||
                      changes.length > 0 ||
                      !!previous.approval
                    }
                  >
                    Record customer sign-off
                  </button>
                </form>
                <button
                  onClick={() =>
                    act(() =>
                      save({
                        ...value,
                        revisions: value.revisions.filter(
                          (r) => r.id !== previous.id,
                        ),
                      }),
                    )
                  }
                >
                  Delete selected job revision
                </button>
              </>
            )}
          </section>
        )}
        {tab === 'Handoff' && (
          <section aria-label="Installer package">
            <h3>One package for the installer</h3>
            <p>
              ZIP includes numbered plans and elevations, dimensions, CSV item
              list, site photos and notes, recorded checks, and the installation
              checklist. Extract the ZIP and open index.html.
            </p>
            <p>
              {issues.length
                ? `${issues.length} outstanding checks. Only draft export is available.`
                : 'All recorded release checks are current.'}
            </p>
            <button
              disabled={!reviewer.trim()}
              onClick={() => void handoff(false)}
            >
              Download draft installer ZIP
            </button>
            <button
              disabled={!reviewer.trim() || issues.length > 0}
              onClick={() => void handoff(true)}
            >
              Issue reviewed installer ZIP
            </button>
            <p>
              Reviewed means the entered checks and recorded sign-off match this
              revision. It does not certify manufacturer compliance.
            </p>
          </section>
        )}
        {tab === 'Pilot' && (
          <section aria-label="Dealer installer pilot">
            <h3>Dealer and installer pilot</h3>
            <p>
              Run these tasks with real participants, record where they get
              stuck, fix the issue, then add a retest observation. Rehearsal
              results are not field evidence.
            </p>
            <label>
              Pilot type
              <select
                aria-label="Job pilot type"
                value={value.pilot.kind}
                onChange={(e) =>
                  act(() =>
                    save({
                      ...value,
                      pilot: {
                        ...value.pilot,
                        kind: e.target.value as 'real' | 'rehearsal',
                      },
                    }),
                  )
                }
              >
                <option value="rehearsal">Synthetic rehearsal</option>
                <option value="real">Real participant session</option>
              </select>
            </label>
            {(['dealer', 'installer'] as const).map((role) => (
              <label key={role}>
                {role} participant
                <input
                  aria-label={`Job pilot ${role}`}
                  value={value.pilot[role]}
                  maxLength={120}
                  onChange={(e) =>
                    act(() =>
                      save({
                        ...value,
                        pilot: { ...value.pilot, [role]: e.target.value },
                      }),
                    )
                  }
                />
              </label>
            ))}
            <ul>
              {pilotSummary(value, jobFingerprint(design)).map((t) => (
                <li key={t.id}>
                  {t.role}: {t.title} — <strong>{t.result}</strong> ·{' '}
                  {t.attempts} attempts · {t.minutes} minutes
                </li>
              ))}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  f = new FormData(form);
                act(() => {
                  const task = String(f.get('task')),
                    role = pilotTasks.find((t) => t.id === task)?.role,
                    participant =
                      role === 'Dealer'
                        ? value.pilot.dealer
                        : value.pilot.installer;
                  if (!participant.trim())
                    throw Error('Enter the participant name for this task.');
                  const prior = value.pilot.observations
                    .filter(
                      (o) =>
                        o.task === task &&
                        o.kind === value.pilot.kind &&
                        o.result === 'blocked',
                    )
                    .at(-1);
                  if (
                    f.get('result') === 'pass' &&
                    prior &&
                    !prior.resolution.trim()
                  )
                    throw Error(
                      'Record the fix for the blocked observation before adding a passing retest.',
                    );
                  save({
                    ...value,
                    pilot: {
                      ...value.pilot,
                      observations: [
                        ...value.pilot.observations,
                        {
                          id: crypto.randomUUID(),
                          task,
                          participant,
                          kind: value.pilot.kind,
                          fingerprint: jobFingerprint(design),
                          minutes: Number(f.get('minutes')),
                          result: f.get('result') as 'pass' | 'blocked',
                          note: String(f.get('note') ?? ''),
                          at: at(),
                          resolution: '',
                        },
                      ],
                    },
                  });
                  form.reset();
                });
              }}
            >
              <label>
                Task
                <select aria-label="Job pilot task" name="task">
                  {pilotTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.role}: {t.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Minutes
                <input
                  aria-label="Job pilot minutes"
                  name="minutes"
                  type="number"
                  min={0}
                  max={10000}
                  defaultValue={0}
                  required
                />
              </label>
              <label>
                Observed result
                <select aria-label="Job pilot result" name="result">
                  <option value="pass">Completed without help</option>
                  <option value="blocked">Blocked / needed help</option>
                </select>
              </label>
              <label>
                Observation and reproduction steps
                <textarea
                  aria-label="Job pilot observation"
                  name="note"
                  required
                  maxLength={1500}
                />
              </label>
              <button disabled={value.pilot.observations.length >= 60}>
                Record pilot observation
              </button>
            </form>
            {value.pilot.observations.map((o) => (
              <article className="job-card" key={o.id}>
                <strong>
                  {o.participant} · {o.kind} · {o.result}
                </strong>
                <p>
                  {o.note} · {o.at}
                </p>
                {o.result === 'blocked' && (
                  <label>
                    Fix applied (record a separate retest to pass the task)
                    <textarea
                      aria-label={`Resolution for ${o.id}`}
                      value={o.resolution}
                      maxLength={1500}
                      onChange={(e) =>
                        act(() =>
                          save({
                            ...value,
                            pilot: {
                              ...value.pilot,
                              observations: value.pilot.observations.map((x) =>
                                x.id === o.id
                                  ? { ...x, resolution: e.target.value }
                                  : x,
                              ),
                            },
                          }),
                        )
                      }
                    />
                  </label>
                )}
              </article>
            ))}
            <button
              onClick={() =>
                downloadJson(
                  {
                    format: 'kitchen-pilot-report-v1',
                    project: design.name,
                    ...value.pilot,
                    summary: pilotSummary(value, jobFingerprint(design)),
                  },
                  'dealer-installer-pilot.json',
                )
              }
            >
              Export pilot report
            </button>
          </section>
        )}
        <hr />
        <div className="designer-row">
          <button onClick={() => downloadJson(value, 'job-workflow.json')}>
            Export job records
          </button>
          <label>
            Import job records
            <input
              aria-label="Import job records"
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  if (file.size > 2200000)
                    throw Error('Job records exceed 2.2 MB.');
                  const importBasis = raw.current;
                  const next = parseJobWorkflow(await file.text(), design.id);
                  if (importBasis !== raw.current)
                    throw Error(
                      'Job records changed during import. Retry with the latest records.',
                    );
                  if (alive.current) {
                    save(next);
                    setMessage(
                      'Imported job records. Reverify checks and customer sign-offs before release.',
                    );
                  }
                } catch (error) {
                  if (alive.current) setMessage((error as Error).message);
                }
              }}
            />
          </label>
        </div>
        <p>
          Stored on this browser and included in complete project backups.
          Imported approvals and verifications must be recorded again.
        </p>
      </fieldset>
    </div>
  );
}
