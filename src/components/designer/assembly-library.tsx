'use client';
import { useEffect, useRef, useState } from 'react';
import { type Design } from '@/designer/model';
import { canonical } from '@/designer/installer-handoff';
import { assemblyPlacementBlock as placementBlock } from '@/designer/assembly-library';
import {
  captureAssembly,
  placeAssembly,
  parseAssemblyLibrary,
  assemblyPlacementIssues,
  type AssemblyTemplate,
} from '@/designer/assembly-library';
import { MiniPlan } from './workflow-tools';
import { downloadJson } from './business-tools';
export function AssemblyLibrary({
  design,
  ownerId,
  selectedIds,
  attached,
  onAttach,
  onApply,
}: {
  design: Design;
  ownerId: string;
  selectedIds: string[];
  attached: AssemblyTemplate[];
  onAttach: (templates: AssemblyTemplate[]) => void;
  onApply: (d: Design) => void;
}) {
  const key = `kitchen-assembly-library:${ownerId}`;
  const [library, setLibrary] = useState<AssemblyTemplate[]>([]),
    [loaded, setLoaded] = useState(false),
    [name, setName] = useState(''),
    [notes, setNotes] = useState(''),
    [selected, setSelected] = useState(''),
    [x, setX] = useState(0),
    [y, setY] = useState(0),
    [message, setMessage] = useState(''),
    [pending, setPending] = useState<{
      source: string;
      design: Design;
      template: AssemblyTemplate;
    } | null>(null);
  const rawRef = useRef<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      rawRef.current = raw;
      if (raw) setLibrary(parseAssemblyLibrary(raw).templates);
      setLoaded(true);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }, [key]);
  const templates = [
    ...new Map([...library, ...attached].map((t) => [t.id, t])).values(),
  ];
  const chosen = templates.find((t) => t.id === selected) ?? templates[0];
  function save(next: AssemblyTemplate[]) {
    const parsed = parseAssemblyLibrary(
      JSON.stringify({
        format: 'kitchen-assembly-library-v1',
        templates: next,
      }),
    );
    if (localStorage.getItem(key) !== rawRef.current)
      throw Error(
        'Assembly library changed in another tab. Reload before editing.',
      );
    const raw = JSON.stringify(parsed);
    localStorage.setItem(key, raw);
    rawRef.current = raw;
    setLibrary(parsed.templates);
    setPending(null);
  }
  function act(fn: () => void) {
    try {
      fn();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <details className="business-panel support-panel">
      <summary>Reusable assembly library</summary>
      <p>
        Capture selected items and their linked assembly members. Templates
        preserve finishes, accessories and notes, clear site service
        coordinates, and receive fresh item IDs when placed. Preview and check a
        new placement before applying it; Undo restores the design.
      </p>
      <div className="business-grid">
        <label>
          Assembly template name
          <input
            aria-label="Assembly template name"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Assembly installation notes
          <textarea
            aria-label="Assembly template notes"
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      </div>
      <p>
        {selectedIds.length} items selected in the designer. Linked hosts and
        assembly members are included automatically.
      </p>
      <button
        disabled={
          !loaded || !selectedIds.length || !name.trim() || library.length >= 20
        }
        onClick={() =>
          act(() => {
            const t = captureAssembly(design, selectedIds, name, notes);
            save([...library, t]);
            onAttach([...attached, t]);
            setSelected(t.id);
            setMessage('Assembly captured for reuse across projects.');
          })
        }
      >
        Save selected assembly template
      </button>
      <label>
        Saved assembly
        <select
          aria-label="Saved assembly template"
          value={chosen?.id ?? ''}
          onChange={(e) => {
            setSelected(e.target.value);
            setPending(null);
          }}
        >
          <option value="" disabled>
            Select a template
          </option>
          {templates.map((t) => (
            <option value={t.id} key={t.id}>
              {t.name} · {t.items.length} items
            </option>
          ))}
        </select>
      </label>
      {chosen && (
        <>
          <p>{chosen.notes}</p>
          <div className="business-grid">
            <label>
              Placement X (in)
              <input
                aria-label="Assembly placement X"
                type="number"
                step="any"
                value={x}
                onChange={(e) => {
                  setX(Number(e.target.value));
                  setPending(null);
                }}
              />
            </label>
            <label>
              Placement Y (in)
              <input
                aria-label="Assembly placement Y"
                type="number"
                step="any"
                value={y}
                onChange={(e) => {
                  setY(Number(e.target.value));
                  setPending(null);
                }}
              />
            </label>
          </div>
          <button
            onClick={() =>
              act(() =>
                setPending({
                  source: canonical(design),
                  design: placeAssembly(design, chosen, x, y),
                  template: chosen,
                }),
              )
            }
          >
            Preview assembly placement
          </button>
        </>
      )}
      {pending && (
        <section className="purchase-card">
          <h3>Review assembly placement</h3>
          <MiniPlan
            design={pending.design}
            highlightedIds={pending.design.items
              .filter((i) => !design.items.some((old) => old.id === i.id))
              .map((i) => i.id)}
          />
          <ul>
            {assemblyPlacementIssues(design, pending.design).map((w) => (
              <li key={w.id + w.message}>{w.message}</li>
            ))}
          </ul>
          {placementBlock(design, pending.design) && (
            <p>{placementBlock(design, pending.design)}</p>
          )}
          {pending.source !== canonical(design) && (
            <p>Design changed since preview. Preview again before applying.</p>
          )}
          <button
            disabled={
              pending.source !== canonical(design) ||
              !!placementBlock(design, pending.design)
            }
            onClick={() =>
              act(() => {
                if (pending.source !== canonical(design))
                  throw Error('Preview is stale.');
                const block = placementBlock(design, pending.design);
                if (block) throw Error(block);
                onAttach([
                  ...new Map(
                    [...attached, pending.template].map((t) => [t.id, t]),
                  ).values(),
                ]);
                onApply(pending.design);
                setPending(null);
                setMessage(
                  'Assembly placed. Use Undo to restore the previous design.',
                );
              })
            }
          >
            Apply assembly placement
          </button>
        </section>
      )}
      <div className="designer-row">
        <button
          onClick={() =>
            downloadJson(
              { format: 'kitchen-assembly-library-v1', templates },
              'assembly-library.json',
            )
          }
        >
          Export assembly library
        </button>
        <label>
          Import assembly library
          <input
            aria-label="Import assembly library"
            type="file"
            accept=".json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                if (f.size > 1500000) throw Error('Library exceeds 1.5 MB.');
                const imported = parseAssemblyLibrary(await f.text());
                const merged = [
                  ...new Map(
                    [...library, ...imported.templates].map((t) => [t.id, t]),
                  ).values(),
                ];
                save(merged);
                setMessage('Assembly templates imported.');
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          />
        </label>
      </div>
      <p>
        Up to 20 shared templates. Complete project backups include templates
        captured or used in this project; export the library to preserve all
        shared templates.
      </p>
      <p role="status">{message}</p>
    </details>
  );
}
