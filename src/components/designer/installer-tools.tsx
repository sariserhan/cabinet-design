'use client';
import { SiteReportMerge } from './site-report-merge';
import { useState, useRef } from 'react';
import { itemPolygon, type Design } from '@/designer/model';
import { siteTasksSchema, type SiteTask } from '@/designer/decision-schema';
import { roomEdges, roomOutline } from '@/designer/room';
import {
  handoffPackage,
  inspectSiteReport,
} from '@/designer/installer-handoff';
import { downloadJson } from './business-tools';

export function SiteTasks({
  design,
  onChange,
}: {
  design: Design;
  onChange: (d: Design) => void;
}) {
  const [title, setTitle] = useState(''),
    [wall, setWall] = useState(0),
    [message, setMessage] = useState('');
  const latest = useRef(design);
  latest.current = design;
  const tasks = design.siteTasks ?? [],
    edges = roomEdges(design.room);
  function save(next: SiteTask[]) {
    const parsed = siteTasksSchema.safeParse(next);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? 'Invalid site task');
      return;
    }
    onChange({ ...design, siteTasks: parsed.data });
    setMessage('Site notes updated.');
  }
  function patch(id: string, change: Partial<SiteTask>) {
    save(
      tasks.map((t) =>
        t.id === id
          ? { ...t, ...change, updatedAt: new Date().toISOString() }
          : t,
      ),
    );
  }
  return (
    <section className="site-tasks">
      <h3>Site questions & photos</h3>
      <p>
        {tasks.filter((t) => t.status !== 'resolved').length} unresolved ·{' '}
        {tasks.filter((t) => t.status === 'resolved').length} resolved. Up to 20
        questions and four compact photos.
      </p>
      <svg
        aria-label="Installer wall and item plan"
        viewBox={`-15 -15 ${design.room.width + 30} ${design.room.depth + 30}`}
        style={{ width: '100%' }}
      >
        <polygon
          points={roomOutline(design.room)
            .map((p) => `${p.x},${p.y}`)
            .join(' ')}
          fill="#f1f4ef"
          stroke="#486653"
        />
        {design.items.map((i, n) => (
          <g key={i.id}>
            <polygon
              points={itemPolygon(i)
                .map((p) => `${p.x},${p.y}`)
                .join(' ')}
              fill="#c9ad83"
              fillOpacity=".7"
              stroke="#486653"
              strokeWidth=".5"
            />
            <text x={i.x + 2} y={i.y + 6} fontSize="5">
              {n + 1}
            </text>
          </g>
        ))}
        {edges.map((e) => (
          <text
            key={e.index}
            x={(e.a.x + e.b.x) / 2}
            y={(e.a.y + e.b.y) / 2}
            fontSize="6"
            textAnchor="middle"
            fill="#153d2c"
            stroke="white"
            strokeWidth="2"
            paintOrder="stroke"
          >
            Wall {e.index + 1}
          </text>
        ))}
      </svg>
      <div className="business-grid">
        <label>
          Question
          <input
            aria-label="Site question"
            value={title}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Wall
          <select
            aria-label="Site wall"
            value={wall}
            onChange={(e) => setWall(Number(e.target.value))}
          >
            {edges.map((e) => (
              <option key={e.index} value={e.index}>
                Wall {e.index + 1} · {Math.round(e.length)} in
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        disabled={!title.trim() || tasks.length >= 20}
        onClick={() => {
          save([
            ...tasks,
            {
              id: crypto.randomUUID(),
              title: title.trim(),
              wall,
              notes: '',
              assignee: '',
              status: 'open',
              updatedAt: new Date().toISOString(),
            },
          ]);
          setTitle('');
        }}
      >
        Add site question
      </button>
      {tasks.map((task) => (
        <article className="decision-card" key={task.id}>
          <h4>
            Wall {task.wall + 1} · {task.title}
          </h4>
          {!edges.some((e) => e.index === task.wall) && (
            <p role="alert">
              This wall no longer exists. Reconcile this site note.
            </p>
          )}
          <label>
            Status
            <select
              aria-label={`Status: ${task.title}`}
              value={task.status}
              onChange={(e) =>
                patch(task.id, { status: e.target.value as SiteTask['status'] })
              }
            >
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
          <label>
            Assigned to
            <input
              maxLength={120}
              value={task.assignee}
              onChange={(e) => patch(task.id, { assignee: e.target.value })}
            />
          </label>
          <label>
            Site notes
            <textarea
              maxLength={2000}
              value={task.notes}
              onChange={(e) => patch(task.id, { notes: e.target.value })}
            />
          </label>
          {task.photo && (
            <img
              src={task.photo}
              alt={`Site photo: ${task.title}`}
              width={320}
              height={240}
              style={{ objectFit: 'contain', maxWidth: '100%' }}
            />
          )}
          <label>
            Attach site photo
            <input
              aria-label={`Photo: ${task.title}`}
              type="file"
              accept="image/jpeg,image/png"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  if (
                    file.size > 10000000 ||
                    !['image/jpeg', 'image/png'].includes(file.type)
                  )
                    throw Error('Choose a JPEG or PNG under 10 MB.');
                  const bitmap = await createImageBitmap(file);
                  const canvas = document.createElement('canvas'),
                    scale = Math.min(
                      1,
                      360 / Math.max(bitmap.width, bitmap.height),
                    );
                  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
                  canvas.height = Math.max(
                    1,
                    Math.round(bitmap.height * scale),
                  );
                  const ctx = canvas.getContext('2d');
                  if (!ctx) {
                    bitmap.close();
                    throw Error('Image conversion unavailable.');
                  }
                  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                  bitmap.close();
                  let photo = canvas.toDataURL('image/jpeg', 0.6);
                  if (photo.length > 12000)
                    photo = canvas.toDataURL('image/jpeg', 0.25);
                  if (photo.length > 12000)
                    throw Error(
                      'Photo is too detailed for a compact handoff. Crop it and try again.',
                    );
                  if (JSON.stringify(latest.current) !== JSON.stringify(design))
                    throw Error(
                      'Site notes changed while processing the photo. Attach it again.',
                    );
                  patch(task.id, { photo });
                } catch (error) {
                  setMessage((error as Error).message);
                }
              }}
            />
          </label>
          {task.photo && (
            <button
              onClick={() =>
                save(
                  tasks.map((t) => {
                    if (t.id !== task.id) return t;
                    const { photo, ...rest } = t;
                    void photo;
                    return rest;
                  }),
                )
              }
            >
              Remove photo
            </button>
          )}
          <button onClick={() => save(tasks.filter((t) => t.id !== task.id))}>
            Delete question
          </button>
        </article>
      ))}
      <p role="status">{message}</p>
    </section>
  );
}
export function InstallerTools({
  design,
  onChange,
}: {
  design: Design;
  onChange: (d: Design) => void;
}) {
  const [message, setMessage] = useState('');
  const [reportText, setReportText] = useState<string | null>(null);
  return (
    <>
      <p>
        Send the handoff file to your installer. They can open it in the mobile
        handoff workspace, record findings and return a site report. Import
        compares the original, current and returned findings so you can resolve
        changes individually.
      </p>
      <div className="designer-row">
        <button
          onClick={() =>
            downloadJson(
              handoffPackage(design),
              'kitchen-installer-handoff.json',
            )
          }
        >
          Export installer handoff
        </button>
        <a href="/installer" target="_blank" rel="noreferrer">
          Open installer workspace
        </a>
        <label>
          Import returned site report
          <input
            aria-label="Import returned site report"
            type="file"
            accept=".json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                if (file.size > 600000)
                  throw Error('Report must be smaller than 600 KB.');
                const text = await file.text();
                inspectSiteReport(design, text);
                setReportText(text);
                setMessage(
                  'Report loaded. Review each finding before merging.',
                );
              } catch (error) {
                setMessage((error as Error).message);
              }
            }}
          />
        </label>
      </div>
      <p role="status">{message}</p>
      {reportText && (
        <SiteReportMerge
          key={reportText}
          design={design}
          text={reportText}
          onChange={(next) => {
            onChange(next);
            setMessage('Selected findings merged. Geometry preserved.');
          }}
          onClose={() => setReportText(null)}
        />
      )}
      <SiteTasks design={design} onChange={onChange} />
    </>
  );
}
