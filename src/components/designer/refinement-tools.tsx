'use client';
import { useState } from 'react';
import { type Cabinet, type Design } from '@/designer/model';
import { fitSink } from '@/designer/refinements';
import { overhang, connectCountertops } from '@/designer/studio-tools';
import { completeRuns } from '@/designer/kitchen-actions';
export function QuickInspector({
  design,
  item,
  ids,
  onPatch,
  onChange,
}: {
  design: Design;
  item: Cabinet | undefined;
  ids: string[];
  onPatch: (patch: Partial<Cabinet>) => void;
  onChange: (d: Design) => void;
}) {
  const [error, setError] = useState('');
  function action(fn: () => Design) {
    try {
      onChange(fn());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!item)
    return (
      <div className="quick-inspector">
        <span>
          Select an object to edit dimensions, finish and rotation here.
        </span>
      </div>
    );
  return (
    <section className="quick-inspector" aria-label="Selected object controls">
      <strong>{item.sku}</strong>
      <span>
        {item.locked
          ? 'Locked'
          : `${item.width} × ${item.depth} × ${item.height} in`}
      </span>
      {(['width', 'depth', 'height'] as const).map((field) => (
        <label key={field}>
          {field}
          <input
            key={`${item.id}-${field}-${item[field]}`}
            aria-label={`Quick ${field}`}
            type="number"
            min="0.5"
            max="600"
            step="0.25"
            defaultValue={item[field]}
            disabled={item.locked || item.kind === 'cabinet'}
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (n >= 0.5 && n <= 600) onPatch({ [field]: n });
              else e.target.value = String(item[field]);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </label>
      ))}
      <button
        disabled={item.locked}
        onClick={() => onPatch({ rotation: (item.rotation + 90) % 360 })}
      >
        Rotate 90°
      </button>
      <button
        disabled={item.locked}
        onClick={() => onPatch({ mirrored: !item.mirrored })}
      >
        Flip hinge
      </button>
      {[
        'cabinet',
        'custom_cabinet',
        'corner',
        'island',
        'trim',
        'filler',
        'molding',
        'toe_kick',
      ].includes(item.kind) && (
        <>
          {' '}
          <label>
            Finish
            <select
              aria-label="Quick cabinet finish"
              value={item.finish ?? design.finish}
              onChange={(e) =>
                onPatch({ finish: e.target.value as Cabinet['finish'] })
              }
            >
              <option value="linen">Linen</option>
              <option value="oak">Oak</option>
              <option value="slate">Slate</option>
            </select>
          </label>
        </>
      )}
      {item.kind === 'countertop' && (
        <label>
          Stone
          <select
            aria-label="Quick countertop material"
            value={item.countertop ?? design.appearance?.countertop ?? 'quartz'}
            onChange={(e) =>
              onPatch({ countertop: e.target.value as Cabinet['countertop'] })
            }
          >
            <option value="quartz">Quartz</option>
            <option value="marble">Marble</option>
            <option value="granite">Granite</option>
          </select>
        </label>
      )}
      <button onClick={() => onPatch({ locked: !item.locked })}>
        {item.locked ? 'Unlock object' : 'Lock object'}
      </button>
      {['cabinet', 'custom_cabinet'].includes(item.kind) &&
        item.elevation === 0 && (
          <button
            disabled={item.locked}
            onClick={() =>
              action(() => completeRuns(design, ids.length ? ids : [item.id]))
            }
          >
            Finish selected run
          </button>
        )}
      {item.kind === 'countertop' && (
        <button
          disabled={item.locked}
          onClick={() => action(() => connectCountertops(design, ids))}
        >
          Join selected seams
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function FitAndOverhang({
  design,
  selected,
  onChange,
}: {
  design: Design;
  selected: string | null;
  onChange: (d: Design) => void;
}) {
  const item = design.items.find((i) => i.id === selected),
    hosts = design.items.filter((i) =>
      ['countertop', 'island'].includes(i.kind),
    );
  const [hostId, setHostId] = useState(''),
    [mount, setMount] = useState<'undermount' | 'drop_in' | 'apron'>(
      item?.sinkMount?.mount ??
        (item?.sinkStyle === 'farmhouse' ? 'apron' : 'drop_in'),
    ),
    [offset, setOffset] = useState(item?.sinkMount?.offset ?? 0),
    [edges, setEdges] = useState(
      item?.surface?.overhangs ?? { front: 1, back: 1, left: 1, right: 1 },
    ),
    [error, setError] = useState('');
  if (!item || !['sink', 'island', 'countertop'].includes(item.kind))
    return null;
  const action = (fn: () => Design) => {
    try {
      onChange(fn());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <details className="fit-controls" open>
      <summary>
        {item.kind === 'sink'
          ? 'Fit sink to surface'
          : 'Individual overhangs & seating'}
      </summary>
      {item.kind === 'sink' ? (
        <>
          <label>
            Surface
            <select
              aria-label="Sink host surface"
              value={hostId || item.sinkMount?.hostId || hosts[0]?.id || ''}
              onChange={(e) => setHostId(e.target.value)}
            >
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.sku} · {h.width} × {h.depth} · ({h.x}, {h.y})
                </option>
              ))}
            </select>
          </label>
          <label>
            Mount
            <select
              aria-label="Sink mounting style"
              value={mount}
              onChange={(e) => setMount(e.target.value as typeof mount)}
            >
              <option value="drop_in">Drop-in rim</option>
              <option value="undermount">Undermount</option>
              <option value="apron">Farmhouse apron</option>
            </select>
          </label>
          <label>
            Offset from center (in)
            <input
              aria-label="Sink center offset"
              type="number"
              value={offset}
              onChange={(e) => setOffset(Number(e.target.value))}
            />
          </label>
          <button
            disabled={item.locked || !hosts.length}
            onClick={() =>
              action(() =>
                fitSink(
                  design,
                  item.id,
                  hostId || item.sinkMount?.hostId || hosts[0]?.id || '',
                  mount,
                  offset,
                ),
              )
            }
          >
            Fit sink
          </button>
          <p>
            Offsets follow the surface’s local left/right direction. Apron
            fitting opens the front edge and lowers the cabinet doors below the
            basin.
          </p>
        </>
      ) : (
        <>
          <div className="edge-controls">
            {(['front', 'back', 'left', 'right'] as const).map((side) => (
              <label key={side}>
                {side} (in)
                <input
                  aria-label={`${side} overhang`}
                  type="number"
                  min="0"
                  max="18"
                  value={edges[side]}
                  onChange={(e) =>
                    setEdges({ ...edges, [side]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          <button
            disabled={item.locked}
            onClick={() => action(() => overhang(design, item.id, edges))}
          >
            Apply individual overhangs
          </button>
          <p>
            Edges follow the object’s rotation. Dashed plan guides show 24-inch
            seating bays. Allow about 12 inches of knee space; these are demo
            guides, not installation approval.
          </p>
          {item.surface?.seating && item.surface.seating !== 'none' && (
            <p>
              Selected seating side: {item.surface.seating}. Check its overhang
              before presenting.
            </p>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
const palettes = {
  finish: [
    ['linen', 'Linen', '#e9e5d9'],
    ['oak', 'Oak', '#b99a66'],
    ['slate', 'Slate', '#34434a'],
  ],
  flooring: [
    ['oak', 'Oak floor', '#c5b08f'],
    ['walnut', 'Walnut', '#72503a'],
    ['tile', 'Porcelain', '#ddd9cd'],
    ['slate', 'Slate tile', '#586064'],
  ],
  countertop: [
    ['quartz', 'Quartz', '#f2f0ea'],
    ['marble', 'Marble', '#e6e7e5'],
    ['granite', 'Granite', '#55585a'],
  ],
  backsplash: [
    ['none', 'No tile', '#fff'],
    ['subway', 'Subway', '#eeeae1'],
    ['slab', 'Stone slab', '#deded8'],
    ['mosaic', 'Mosaic', '#739c99'],
    ['stacked', 'Stacked', '#d1c5ad'],
  ],
} as const;
export function MaterialSwatches({
  design,
  onChange,
}: {
  design: Design;
  onChange: (d: Design) => void;
}) {
  return (
    <section className="material-swatches">
      <h3>Material palette</h3>
      {Object.entries(palettes).map(([field, choices]) => (
        <fieldset key={field}>
          <legend>{field === 'finish' ? 'Cabinets' : field}</legend>
          {choices.map(([value, label, color]) => (
            <button
              key={value}
              title={label}
              aria-label={`Swatch ${label}`}
              aria-pressed={
                (field === 'finish'
                  ? design.finish
                  : (design.appearance?.[
                      field as 'flooring' | 'countertop' | 'backsplash'
                    ] ??
                    (field === 'flooring'
                      ? 'oak'
                      : field === 'countertop'
                        ? 'quartz'
                        : 'none'))) === value
              }
              onClick={() =>
                onChange({
                  ...design,
                  ...(field === 'finish'
                    ? {
                        finish: value as Design['finish'],
                        items: design.items.map((i) =>
                          [
                            'cabinet',
                            'custom_cabinet',
                            'island',
                            'corner',
                            'trim',
                          ].includes(i.kind)
                            ? { ...i, finish: value as Cabinet['finish'] }
                            : i,
                        ),
                      }
                    : {
                        appearance: {
                          countertop: 'quartz',
                          lighting: 'daylight',
                          ...design.appearance,
                          [field]: value,
                        },
                        ...(field === 'countertop'
                          ? {
                              items: design.items.map((i) =>
                                ['countertop', 'island'].includes(i.kind)
                                  ? {
                                      ...i,
                                      countertop:
                                        value as Cabinet['countertop'],
                                    }
                                  : i,
                              ),
                            }
                          : {}),
                      }),
                })
              }
            >
              <span style={{ background: color }} />
              {label}
            </button>
          ))}
        </fieldset>
      ))}
    </section>
  );
}
