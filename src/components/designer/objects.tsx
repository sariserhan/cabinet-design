'use client';
import { setActiveDrop } from '@/designer/drop';
import { useState } from 'react';
import {
  DoorOpen,
  AppWindow,
  Refrigerator,
  WashingMachine,
  CookingPot,
  LayoutPanelTop,
  Droplets,
  Plus,
} from 'lucide-react';
import { objectPresets, sinkHoles, objectTransform } from '@/designer/model';
import type { Cabinet, ObjectKind } from '@/designer/model';
const icons = {
  door: DoorOpen,
  window: AppWindow,
  sink: Droplets,
  refrigerator: Refrigerator,
  dishwasher: WashingMachine,
  washing_machine: WashingMachine,
  range: CookingPot,
  island: LayoutPanelTop,
  countertop: LayoutPanelTop,
  corner: LayoutPanelTop,
  custom_cabinet: LayoutPanelTop,
  hood: CookingPot,
  filler: LayoutPanelTop,
  trim: LayoutPanelTop,
  molding: LayoutPanelTop,
  toe_kick: LayoutPanelTop,
  column: LayoutPanelTop,
  beam: LayoutPanelTop,
  partition: LayoutPanelTop,
};
export function ObjectsLibrary({
  onAdd,
}: {
  onAdd: (kind: ObjectKind) => void;
}) {
  const [query, setQuery] = useState('');
  const matches = objectPresets.filter((p) =>
    (p.name + ' ' + p.kind.replaceAll('_', ' '))
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <section className="designer-library">
      <h2>Objects library</h2>
      <p className="designer-muted">
        Drag into the 2D plan or use Add · editable demo dimensions
      </p>
      <input
        type="search"
        aria-label="Search objects"
        placeholder="Search sinks, islands, doors…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p role="status">{matches.length} objects found</p>
      {!matches.length && (
        <p>
          No matching objects. Try a shorter name or{' '}
          <button onClick={() => setQuery('')}>Clear search</button>.
        </p>
      )}
      <div className="library-results">
        {matches.map((p) => {
          const Icon = icons[p.kind];
          return (
            <article
              className="library-product"
              key={p.kind}
              draggable
              onDragEnd={() => setActiveDrop(null)}
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  'application/x-kitchen-item',
                  JSON.stringify({ kind: 'object', object: p.kind }),
                );
                setActiveDrop(
                  e.dataTransfer.getData('application/x-kitchen-item'),
                );
                e.dataTransfer.effectAllowed = 'copy';
              }}
            >
              <Icon size={28} />
              <div>
                <strong>{p.name}</strong>
                <small>
                  {p.width} W × {p.depth} D × {p.height} H (in)
                </small>
                <button
                  aria-label={`Add ${p.name}`}
                  onClick={() => onAdd(p.kind)}
                >
                  <Plus size={13} /> Add
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <p className="designer-muted">
        Select a countertop or island before adding a sink to center it there.
        Select a base cabinet before adding a countertop to size it to that
        cabinet.
      </p>
    </section>
  );
}
export function ObjectPlan({
  item,
  active,
  items,
}: {
  item: Cabinet;
  active: boolean;
  items: Cabinet[];
}) {
  const w = item.width,
    d = item.depth;
  const opening = item.kind === 'door' || item.kind === 'window';
  return (
    <g transform={objectTransform(item)} pointerEvents="none">
      {opening && (
        <rect x={-0.2} y={-2} width={w + 0.4} height={d + 4} fill="#f2f7fa" />
      )}
      {item.kind === 'countertop' ? (
        <path
          className="countertop-cutout"
          d={
            `M0 0 H${w} V${d} H0 Z ` +
            sinkHoles(item, items)
              .map(
                (h) => `M${h.x} ${h.y} h${h.width} v${h.height} h${-h.width} Z`,
              )
              .join(' ')
          }
          fillRule="evenodd"
          fill="#f8f3e8"
          stroke={active ? '#087984' : '#687d87'}
          strokeWidth=".5"
        />
      ) : (
        <rect
          width={w}
          height={d}
          rx={item.kind === 'sink' ? 2 : 0}
          fill={
            item.kind === 'window'
              ? '#b9dfe9'
              : item.kind === 'sink'
                ? '#b5c6cc'
                : item.kind === 'island'
                  ? '#e6d2b0'
                  : '#e5eaed'
          }
          stroke={active ? '#087984' : '#687d87'}
          strokeWidth={active ? 0.8 : 0.5}
        />
      )}
      {item.kind === 'corner' && (
        <path
          d={
            (item.details?.corner ?? 'diagonal') === 'diagonal'
              ? `M${w - Math.min(w, d) * 0.45} ${d} L${w} ${d - Math.min(w, d) * 0.45}`
              : `M${w / 2} 0 V${d}`
          }
          stroke="#566b76"
          strokeWidth="1"
          fill="none"
        />
      )}
      {item.kind === 'door' && (
        <g
          transform={
            item.mirrored ? `translate(${w} 0) scale(-1 1)` : undefined
          }
        >
          <path
            d={`M0 ${d} V${d + w} M${w} ${d} A${w} ${w} 0 0 1 0 ${d + w}`}
            fill="none"
            stroke="#647c86"
            strokeWidth=".5"
            strokeDasharray="1 .7"
          />
        </g>
      )}
      {item.kind === 'window' && (
        <path
          d={`M0 ${d / 2} H${w} M${w / 2} 0 V${d}`}
          stroke="#5193a6"
          strokeWidth=".5"
        />
      )}
      {item.kind === 'sink' && (
        <>
          <rect
            x="2"
            y="2"
            width={Math.max(1, w - 4)}
            height={Math.max(1, d - 4)}
            rx="2"
            fill="#e5f1f3"
            stroke="#758e99"
            strokeWidth=".5"
          />
          <circle cx={w / 2} cy={d / 2} r="1" fill="#718a96" />
        </>
      )}
      {item.kind === 'range' &&
        [0.28, 0.72].flatMap((x) =>
          [0.28, 0.72].map((y) => (
            <circle
              key={`${x}:${y}`}
              cx={w * x}
              cy={d * y}
              r={Math.min(w, d) * 0.14}
              fill="none"
              stroke="#61727b"
              strokeWidth=".6"
            />
          )),
        )}
      {item.kind === 'washing_machine' && (
        <circle
          cx={w / 2}
          cy={d / 2}
          r={Math.min(w, d) * 0.28}
          fill="#c0d9e1"
          stroke="#738b97"
        />
      )}
      {item.kind === 'refrigerator' && (
        <path d={`M${w / 2} 0 V${d}`} stroke="#81949c" strokeWidth=".5" />
      )}
      {!opening && (
        <text
          x={w / 2}
          y={d / 2}
          fontSize={Math.min(3.2, w / (item.sku.length * 0.6))}
          fill="#243f4c"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {item.sku}
        </text>
      )}
      {opening && (
        <text x={w / 2} y={-3} fontSize="3" fill="#44606e" textAnchor="middle">
          {item.sku} {w}″
        </text>
      )}
    </g>
  );
}
