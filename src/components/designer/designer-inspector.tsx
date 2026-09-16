'use client';

import type { Dispatch, SetStateAction } from 'react';
import Link from 'next/link';
import {
  Copy,
  FlipHorizontal2,
  Lock,
  LockOpen,
  RotateCw,
  Trash2,
} from 'lucide-react';
import type { Cabinet, Design } from '@/designer/model';
import {
  attachToWall,
  findSpace,
  footprint,
  isOpening,
  mirrorCabinet,
  objectOptionPatch,
  objectOptions,
  MAX_DESIGN_ITEMS,
} from '@/designer/model';
import { roomEdges } from '@/designer/room';
import { sourceLink } from '@/designer/design-decisions';
import { assemblyMembers, finishAssembly } from '@/designer/editing';
import {
  ArchitectureOptions,
  DrawingTools,
  InstallationOptions,
  PartitionOptions,
} from './advanced-options';
import { AssemblyEditor } from './assembly-editor';
import { DesignOptions, ItemOptions } from './demo-options';
import { MaterialPresets } from './demo-tools';
import { MachiningTools } from './machining-tools';
import { FitAndOverhang } from './refinement-tools';
import { RoomEditor } from './room-editor';
import { RoomPhoto, SurfaceEditor } from './studio-panels';
import { Numeric } from './designer-widgets';
import type { ViewMode } from './designer-state';
import { defaultSpacing, spacingFindings } from '@/designer/spacing';

/** The inspector's own disclosure state, held by Editor. */
export type InspectorPanelState = {
  inspectorTab: string;
  moveTogether: boolean;
  showClearance: boolean;
};

/** Editor actions the inspector fires but does not own. */
export type EditorCommands = {
  setFitRevision: Dispatch<SetStateAction<number>>;
  setMode: Dispatch<SetStateAction<ViewMode>>;
  setStatus: Dispatch<SetStateAction<string>>;
};

type Commit = (
  change: (current: Design) => Design,
  protectPlacement?: boolean,
) => void;

/**
 * The right-hand inspector: the current selection's properties plus the panels
 * that act on it. Presentational — the state it reads still lives in Editor,
 * which is why the prop surface is wide.
 */
export function DesignerInspector({
  design,
  ownerId,
  item,
  issues,
  selected,
  setSelected,
  selection,
  setSelection,
  panel,
  setPanel,
  editor,
  commit,
  updateItem,
  rotate,
}: {
  design: Design;
  ownerId: string;
  item: Cabinet | undefined;
  issues: ReturnType<typeof import('@/designer/model').warnings>;
  selected: string | null;
  setSelected: Dispatch<SetStateAction<string | null>>;
  selection: string[];
  setSelection: Dispatch<SetStateAction<string[]>>;
  panel: InspectorPanelState;
  setPanel: (patch: Partial<InspectorPanelState>) => void;
  editor: EditorCommands;
  commit: Commit;
  updateItem: (id: string, patch: Partial<Cabinet>) => void;
  rotate: (degrees?: 90 | 180) => void;
}) {
  const { inspectorTab, moveTogether, showClearance } = panel;
  // Absent on a design that has never set them, which is most of them.
  const spacing = design.spacing ?? defaultSpacing;
  const spacingIssues = spacingFindings(design, spacing);
  const setSpacing = (patch: Partial<typeof spacing>) =>
    commit((d) => ({ ...d, spacing: { ...spacing, ...patch } }));
  return (
    <aside className="designer-inspector">
      <h2>Properties</h2>
      <RoomPhoto
        key={design.id}
        storageKey={`kitchen-photo:${ownerId}:${design.id}`}
      />
      <FitAndOverhang
        key={selected}
        design={design}
        selected={selected}
        onChange={(next) => commit(() => next)}
      />
      <SurfaceEditor
        design={design}
        selected={selected}
        ids={selection}
        onChange={(next) => commit(() => next)}
      />
      <div
        id="designer-inspector"
        tabIndex={-1}
        role="tablist"
        aria-label="Inspector sections"
        className="inspector-tabs"
      >
        {['design', 'materials', 'installation', 'documents'].map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={inspectorTab === tab}
            onClick={() => setPanel({ inspectorTab: tab })}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>
      <section hidden={inspectorTab !== 'design'}>
        <h3>Room</h3>
        <Numeric
          label="Room width (in)"
          min={36}
          value={design.room.width}
          onChange={(n) =>
            commit((d) => ({ ...d, room: { ...d.room, width: n } }))
          }
        />
        <Numeric
          label="Room depth (in)"
          min={36}
          value={design.room.depth}
          onChange={(n) =>
            commit((d) => ({ ...d, room: { ...d.room, depth: n } }))
          }
        />
        <Numeric
          label="Ceiling height (in)"
          min={36}
          value={design.room.height}
          onChange={(n) =>
            commit((d) => ({ ...d, room: { ...d.room, height: n } }))
          }
        />
        <ArchitectureOptions
          design={design}
          onChange={(next) => commit(() => next)}
        />

        <RoomEditor
          room={design.room}
          onChange={(outline) =>
            commit((d) => ({
              ...d,
              room: { ...d.room, outline, curves: [] },
            }))
          }
        />
        <div className="designer-walls">
          {(['north', 'east', 'south', 'west'] as const).map((wall) => (
            <label key={wall}>
              <input
                type="checkbox"
                checked={design.room.walls[wall]}
                onChange={(e) =>
                  commit((d) => ({
                    ...d,
                    room: {
                      ...d.room,
                      walls: { ...d.room.walls, [wall]: e.target.checked },
                    },
                  }))
                }
              />
              {wall.charAt(0).toUpperCase() + wall.slice(1)} wall
            </label>
          ))}
        </div>
      </section>
      <section hidden={inspectorTab !== 'design'}>
        <h3>Selected item</h3>
        {item ? (
          <>
            <strong className="selected-sku">{item.sku}</strong>
            {item.assemblyId && (
              <button
                onClick={() => {
                  setSelection(assemblyMembers(design, item.id));
                  setPanel({ moveTogether: true });
                }}
              >
                Select whole assembly / island
              </button>
            )}
            {item.assemblyId && selection.includes(item.id) && (
              <p>
                {assemblyMembers(design, item.id).length} assembly parts
                selected. Drag any member to move them together.
              </p>
            )}
            <p className="designer-muted">
              {item.width} W × {item.depth} D × {item.height} H (in)
            </p>
            <p className="designer-muted">
              Footprint: {footprint(item).width} × {footprint(item).depth} in ·{' '}
              {item.rotation}°
            </p>
            {objectOptions.some((o) => o.kind === item.kind) && (
              <label className="designer-numeric">
                <span>Size / style preset</span>
                <select
                  aria-label="Selected object preset"
                  value=""
                  onChange={(e) => {
                    const option = objectOptions.find(
                      (o) => o.id === e.target.value,
                    );
                    if (option)
                      commit((d) => ({
                        ...d,
                        items: d.items.map((i) =>
                          i.id === item.id
                            ? { ...i, ...objectOptionPatch(i, option.id) }
                            : i,
                        ),
                      }));
                  }}
                >
                  <option value="">Choose a preset…</option>
                  {objectOptions
                    .filter((o) => o.kind === item.kind)
                    .map((o) => (
                      <option value={o.id} key={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {item.kind !== 'cabinet' && (
              <>
                <Numeric
                  label="Object width (in)"
                  min={1}
                  value={item.width}
                  onChange={(width) => updateItem(item.id, { width })}
                />
                <Numeric
                  label="Object depth (in)"
                  min={0.5}
                  value={item.depth}
                  onChange={(depth) => updateItem(item.id, { depth })}
                />
                <Numeric
                  label="Object height (in)"
                  min={0.5}
                  value={item.height}
                  onChange={(height) => updateItem(item.id, { height })}
                />
                {isOpening(item) && !item.opening && (
                  <label className="designer-numeric">
                    <span>Attach to wall</span>
                    <select
                      aria-label="Attach to wall"
                      value={
                        item.wallSegment ??
                        roomEdges(design.room).find(
                          (e) => e.side === (item.wall ?? 'north'),
                        )?.index ??
                        0
                      }
                      onChange={(e) => {
                        const edge = roomEdges(design.room).find(
                          (edge) => edge.index === Number(e.target.value),
                        );
                        if (edge)
                          updateItem(
                            item.id,
                            attachToWall(
                              { ...item, wallSegment: edge.index },
                              design.room,
                              edge.side,
                            ),
                          );
                      }}
                    >
                      {roomEdges(design.room).map((edge) => (
                        <option
                          key={edge.index}
                          value={edge.index}
                          disabled={
                            !design.room.walls[edge.side] || edge.curved
                          }
                        >
                          Wall {edge.index + 1} · {edge.side} ·{' '}
                          {Number(edge.length.toFixed(1))}″
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <p className="designer-muted">
                  {isOpening(item)
                    ? 'Position stays on the chosen wall. Elevation sets the window sill height. Flip left/right changes the door swing.'
                    : 'Generic demo dimensions. Resize to match your chosen product.'}
                </p>
              </>
            )}
            <Numeric
              label="X position (in)"
              max={1200}
              value={item.x}
              onChange={(x) => updateItem(item.id, { x })}
            />
            <Numeric
              label="Y position (in)"
              max={1200}
              value={item.y}
              onChange={(y) => updateItem(item.id, { y })}
            />
            <Numeric
              label="Elevation (in)"
              value={item.elevation}
              onChange={(elevation) => updateItem(item.id, { elevation })}
            />
            {item.category === 'wall_cabinet' && (
              <p className="designer-muted">
                54″ is a starting mounting height; adjust for your room.
              </p>
            )}
            {['cabinet', 'custom_cabinet', 'island'].includes(item.kind) && (
              <label className="designer-numeric">
                <span>Illustrative front</span>
                <select
                  aria-label="Cabinet front style"
                  value={item.frontStyle}
                  onChange={(e) =>
                    updateItem(item.id, {
                      frontStyle: e.target.value as Cabinet['frontStyle'],
                    })
                  }
                >
                  {['auto', 'single', 'double', 'drawers', 'glass'].map(
                    (style) => (
                      <option key={style}>{style}</option>
                    ),
                  )}
                </select>
              </label>
            )}
            <PartitionOptions
              design={design}
              item={item}
              onChange={(patch) => updateItem(item.id, patch)}
            />

            <ItemOptions
              item={item}
              onChange={(patch) => updateItem(item.id, patch)}
            />
            {!isOpening(item) && (
              <AssemblyEditor
                design={design}
                item={item}
                moveTogether={moveTogether}
                onMoveTogether={(next) => setPanel({ moveTogether: next })}
                onChange={(next) => commit(() => next)}
              />
            )}
            <div className="designer-row">
              <button disabled={isOpening(item)} onClick={() => rotate(90)}>
                <RotateCw size={14} /> Rotate 90°
              </button>
              <button disabled={isOpening(item)} onClick={() => rotate(180)}>
                <RotateCw size={14} /> Turn 180°
              </button>
              <button
                aria-pressed={item.mirrored}
                onClick={() => updateItem(item.id, mirrorCabinet(item))}
              >
                <FlipHorizontal2 size={14} /> Flip left/right
              </button>
              <button
                aria-pressed={!!item.locked}
                onClick={() => updateItem(item.id, { locked: !item.locked })}
              >
                {item.locked ? <Lock size={14} /> : <LockOpen size={14} />}{' '}
                {item.locked ? 'Locked' : 'Lock'}
              </button>
              <button
                aria-label="Duplicate cabinet"
                disabled={design.items.length >= MAX_DESIGN_ITEMS}
                onClick={() => {
                  const copy = { ...item, id: crypto.randomUUID() },
                    space = findSpace(copy, design);
                  if (!space) {
                    editor.setStatus('No free space for a duplicate.');
                    return;
                  }
                  commit((d) => ({
                    ...d,
                    items: [...d.items, { ...copy, ...space }],
                  }));
                  setSelected(copy.id);
                }}
              >
                <Copy size={14} />
              </button>
              <button
                className="designer-danger"
                onClick={() => {
                  commit((d) => ({
                    ...d,
                    items: d.items.filter((i) => i.id !== item.id),
                  }));
                  setSelected(null);
                }}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
            {item.kind === 'cabinet' && (
              <p className="designer-muted">
                {item.mirrored ? 'Mirrored' : 'Standard'} illustrative front.
                The dot marks the handle side; confirm manufacturer handing
                separately.
              </p>
            )}
            {item.kind === 'cabinet' && (
              <Link className="designer-source" href={sourceLink(item)}>
                Inspect source · PDF {item.pageNumber}
              </Link>
            )}
          </>
        ) : (
          <p className="designer-muted">
            Select a cabinet in the plan or product list to edit its position.
          </p>
        )}
      </section>
      <section hidden={inspectorTab !== 'documents'}>
        {' '}
        <DrawingTools design={design} onChange={(next) => commit(() => next)} />
        <MachiningTools
          design={design}
          onChange={(next) => commit(() => next)}
        />
      </section>
      <section hidden={inspectorTab !== 'materials'}>
        {' '}
        <DesignOptions
          design={design}
          onChange={(next) => commit(() => next)}
        />
      </section>
      <section hidden={inspectorTab !== 'installation'}>
        <h3>{item?.sku ?? 'Select an appliance'}</h3>
        {item && (
          <InstallationOptions
            item={item}
            onChange={(patch) => updateItem(item.id, patch)}
          />
        )}
      </section>
      <section hidden={inspectorTab !== 'materials'}>
        {item?.assemblyId && (
          <label>
            Whole assembly finish
            <select
              aria-label="Whole assembly finish"
              value=""
              onChange={(e) => {
                commit((d) =>
                  finishAssembly(
                    d,
                    item.id,
                    e.target.value as Design['finish'],
                  ),
                );
                setSelection(assemblyMembers(design, item.id));
              }}
            >
              <option value="" disabled>
                Choose for all cabinet parts
              </option>
              <option value="linen">Linen</option>
              <option value="oak">Oak</option>
              <option value="slate">Slate</option>
            </select>
          </label>
        )}
        <MaterialPresets
          design={design}
          onChange={(next) => commit(() => next)}
        />
        {item &&
          [
            'cabinet',
            'custom_cabinet',
            'corner',
            'island',
            'countertop',
            'door',
            'window',
            'filler',
            'trim',
            'molding',
            'toe_kick',
          ].includes(item.kind) && (
            <section>
              <h3>{item.sku} · individual materials</h3>
              {item.kind !== 'countertop' && (
                <label>
                  Cabinet / island finish
                  <select
                    aria-label="Selected object finish"
                    value={item.finish ?? ''}
                    onChange={(e) =>
                      updateItem(item.id, {
                        finish: (e.target.value ||
                          undefined) as Cabinet['finish'],
                      })
                    }
                  >
                    <option value="">Use kitchen finish</option>
                    {(['linen', 'oak', 'slate'] as const).map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {['countertop', 'island'].includes(item.kind) && (
                <label>
                  Countertop pattern
                  <select
                    aria-label="Selected countertop pattern"
                    value={item.countertop ?? ''}
                    onChange={(e) =>
                      updateItem(item.id, {
                        countertop: (e.target.value ||
                          undefined) as Cabinet['countertop'],
                      })
                    }
                  >
                    <option value="">Use kitchen pattern</option>
                    {(['quartz', 'marble', 'granite'] as const).map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p>
                Overrides apply to this object only. Select Use kitchen to
                follow the global style again.
              </p>
            </section>
          )}
        <h3>Preview finish</h3>
        <div className="designer-finishes">
          {(['linen', 'oak', 'slate'] as const).map((finish) => (
            <button
              key={finish}
              aria-label={`${finish} finish`}
              aria-pressed={design.finish === finish}
              onClick={() => commit((d) => ({ ...d, finish }))}
            >
              <i className={`swatch-${finish}`} />
              {finish}
            </button>
          ))}
        </div>
        <p className="designer-muted">
          Illustrative finishes, not manufacturer availability.
        </p>
      </section>
      <section
        className="designer-checks"
        hidden={inspectorTab !== 'design' && inspectorTab !== 'installation'}
      >
        <h3>Layout checks</h3>
        <label>
          <input
            type="checkbox"
            checked={showClearance}
            onChange={(e) => {
              setPanel({ showClearance: e.target.checked });
              editor.setMode('2d');
            }}
          />{' '}
          Show clearance zones
        </label>
        {issues.length ? (
          <ul>
            {issues.map((issue) => (
              <li key={issue.id}>
                <button
                  onClick={() => {
                    setSelected(issue.itemIds[0] ?? null);
                    editor.setMode('2d');
                    setPanel({ showClearance: true });
                    editor.setFitRevision((n) => n + 1);
                  }}
                >
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="layout-clear">
            {design.items.length
              ? 'No overlaps or boundary issues.'
              : 'Add cabinets to check the layout.'}
          </p>
        )}
        <h4>Clear floor and work centres</h4>
        <div className="designer-row spacing-settings">
          <label>
            Aisle
            <input
              type="number"
              min={12}
              max={120}
              step={1}
              value={spacing.aisle}
              onChange={(e) =>
                setSpacing({ aisle: Number(e.target.value) || spacing.aisle })
              }
            />
          </label>
          <label>
            Work centres total
            <input
              type="number"
              min={24}
              max={600}
              step={1}
              value={spacing.triangleMax}
              onChange={(e) =>
                setSpacing({
                  triangleMax: Number(e.target.value) || spacing.triangleMax,
                })
              }
            />
          </label>
        </div>
        {spacingIssues.length ? (
          <ul>
            {spacingIssues.map((finding) => (
              <li key={finding.id}>
                <button
                  onClick={() => {
                    setSelected(finding.itemIds[0] ?? null);
                    editor.setMode('2d');
                    editor.setFitRevision((n) => n + 1);
                  }}
                >
                  {finding.message}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="layout-clear">
            Nothing measures under the distances set above.
          </p>
        )}
        <p className="designer-muted">{spacing.source}</p>
        <p className="designer-muted">
          Checks use design geometry and recorded service data. Field and
          manufacturer review remain required.
        </p>
      </section>
    </aside>
  );
}
