'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { designSchema, type Design } from '@/designer/model';
import {
  bestCamera,
  smartPlace,
  type SmartAction,
} from '@/designer/experience';
const RenderView = dynamic(() => import('./render-view'), {
  ssr: false,
  loading: () => <p role="status">Loading kitchen view…</p>,
});
export function SmartPlacement({
  design,
  selected,
  onChange,
}: {
  design: Design;
  selected: string | null;
  onChange: (d: Design) => void;
}) {
  const [message, setMessage] = useState('');
  return (
    <details className="experience-panel">
      <summary>Smart placement</summary>
      <p>
        Select an object, then align it. Linked parts move together; new
        overlaps are rejected.
      </p>
      <div className="designer-row">
        {(
          [
            ['upper', 'Align upper above base'],
            ['sink', 'Center sink beneath window'],
            ['appliance', 'Align appliance with cabinet fronts'],
          ] as const
        ).map(([action, label]) => (
          <button
            key={action}
            disabled={!selected}
            onClick={() => {
              try {
                onChange(
                  smartPlace(design, selected ?? '', action as SmartAction),
                );
                setMessage(
                  'Alignment applied. Undo restores the previous position.',
                );
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p role="status">{message}</p>
    </details>
  );
}
type Checkpoint = { id: string; name: string; date: string; design: Design };
export function DesignRecovery({
  design,
  ownerId,
  past,
  onRestore,
}: {
  design: Design;
  ownerId: string;
  past: Design[];
  onRestore: (d: Design) => void;
}) {
  const key = `kitchen-checkpoints:${ownerId}:${design.id}`;
  const [rows, setRows] = useState<Checkpoint[]>([]),
    [name, setName] = useState('Before changes'),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    try {
      const data: unknown = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(data)) throw Error();
      setRows(
        data.slice(-12).map((r: Checkpoint) => {
          if (
            typeof r.id !== 'string' ||
            typeof r.name !== 'string' ||
            typeof r.date !== 'string'
          )
            throw Error();
          return { ...r, design: designSchema.parse(r.design) };
        }),
      );
    } catch {
      setMessage(
        'Saved checkpoints could not be read. Export your current design to keep a copy.',
      );
    }
    setReady(true);
  }, [key]);
  function save(next: Checkpoint[]) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setRows(next);
      setMessage('Checkpoint saved in this browser.');
    } catch {
      setMessage('Browser storage is full. Export your design to keep a copy.');
    }
  }
  return (
    <details className="experience-panel">
      <summary>Design recovery & history</summary>
      <p>
        Keep up to 12 named checkpoints in this browser. Restoring keeps the
        current design in Undo history, including any locked objects.
      </p>
      <label>
        Checkpoint name
        <input
          aria-label="Checkpoint name"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        disabled={!ready || !name.trim()}
        onClick={() =>
          save(
            [
              ...rows,
              {
                id: crypto.randomUUID(),
                name: name.trim(),
                date: new Date().toISOString(),
                design: structuredClone(design),
              },
            ].slice(-12),
          )
        }
      >
        Save checkpoint
      </button>
      <p role="status">{message}</p>
      <ol>
        {[...rows].reverse().map((r) => (
          <li key={r.id}>
            <strong>{r.name}</strong> · {new Date(r.date).toLocaleString()}{' '}
            <button
              onClick={() => {
                onRestore(structuredClone(r.design));
                setMessage(
                  `Restored ${r.name}. Undo returns to your previous design.`,
                );
              }}
            >
              Restore {r.name}
            </button>
            <button
              aria-label={`Delete checkpoint ${r.name}`}
              onClick={() => save(rows.filter((x) => x.id !== r.id))}
            >
              Delete
            </button>
          </li>
        ))}
      </ol>
      <h4>Recent editing history · this session</h4>
      {!past.length && <p>No earlier edits in this session.</p>}
      <ol>
        {past
          .slice(-10)
          .reverse()
          .map((d, i) => (
            <li key={i}>
              {d.name} · {d.items.length} objects · {d.finish}
              <button onClick={() => onRestore(structuredClone(d))}>
                Restore {i + 1} {i === 0 ? 'step' : 'steps'} ago
              </button>
            </li>
          ))}
      </ol>
    </details>
  );
}
export type SurfaceTarget = 'floor' | 'backsplash' | 'countertop' | 'cabinet';
export function SurfaceEditor({
  design,
  target,
  itemId,
  onChange,
  onClose,
}: {
  design: Design;
  target: SurfaceTarget;
  itemId?: string;
  onChange: (d: Design) => void;
  onClose: () => void;
}) {
  const item = design.items.find((i) => i.id === itemId);
  const choices =
    target === 'floor'
      ? ['oak', 'walnut', 'tile', 'slate']
      : target === 'backsplash'
        ? ['none', 'subway', 'slab', 'mosaic', 'stacked']
        : target === 'countertop'
          ? ['quartz', 'granite', 'marble']
          : ['linen', 'oak', 'slate'];
  const value =
    target === 'floor'
      ? design.appearance?.flooring
      : target === 'backsplash'
        ? design.appearance?.backsplash
        : target === 'countertop'
          ? (item?.countertop ?? design.appearance?.countertop)
          : (item?.finish ?? design.finish);
  return (
    <section className="surface-editor" aria-label="Surface editor">
      <strong>
        Edit {target}
        {item ? ` · ${item.sku}` : ''}
      </strong>
      <div className="designer-row">
        {choices.map((v) => (
          <button
            aria-pressed={value === v}
            key={v}
            onClick={() => {
              let next: unknown;
              if (item && (target === 'cabinet' || target === 'countertop'))
                next = {
                  ...design,
                  items: design.items.map((i) =>
                    i.id === item.id
                      ? {
                          ...i,
                          [target === 'cabinet' ? 'finish' : 'countertop']: v,
                        }
                      : i,
                  ),
                };
              else
                next = {
                  ...design,
                  appearance: {
                    ...design.appearance,
                    countertop: design.appearance?.countertop ?? 'quartz',
                    [target === 'floor' ? 'flooring' : target]: v,
                  },
                };
              onChange(designSchema.parse(next));
            }}
          >
            {v}
          </button>
        ))}
        <button onClick={onClose}>Close surface editor</button>
      </div>
    </section>
  );
}
export function Showroom({
  design,
  before,
  onChange,
  onExit,
}: {
  design: Design;
  before: Design | null;
  onChange: (d: Design) => void;
  onExit: () => void;
}) {
  const [original, setOriginal] = useState(false),
    [camera, setCamera] = useState(() => bestCamera(design));
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onExit]);
  return (
    <section className="showroom" aria-label="Kitchen showroom">
      <header>
        <div>
          <p>KITCHEN SHOWROOM</p>
          <h2>{design.name}</h2>
        </div>
        <div className="designer-row">
          <button
            disabled={!before}
            aria-pressed={original}
            onClick={() => setOriginal(!original)}
          >
            {original ? 'Show current design' : 'Show before design'}
          </button>
          <button onClick={() => setCamera(bestCamera(design))}>
            Best kitchen view
          </button>
          <button onClick={onExit}>Exit showroom · Esc</button>
        </div>
      </header>
      <p role="status">
        {original
          ? 'Before changes — finish controls apply to the current design.'
          : 'Current design — choose a finish below.'}
      </p>
      <div className="showroom-finishes">
        {(['linen', 'oak', 'slate'] as const).map((f) => (
          <button
            key={f}
            disabled={original}
            aria-pressed={design.finish === f}
            onClick={() =>
              onChange({
                ...design,
                finish: f,
                items: design.items.map((i) =>
                  [
                    'cabinet',
                    'custom_cabinet',
                    'island',
                    'corner',
                    'trim',
                  ].includes(i.kind)
                    ? { ...i, finish: f }
                    : i,
                ),
              })
            }
          >
            <span
              style={{
                background: {
                  linen: '#e6ded0',
                  oak: '#b88c58',
                  slate: '#354650',
                }[f],
              }}
            />
            {f}
          </button>
        ))}
      </div>
      <RenderView
        design={original && before ? before : design}
        cameraView={camera}
        onCamera={setCamera}
        onChange={onChange}
      />
    </section>
  );
}
