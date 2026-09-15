'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useQuery } from 'convex/react';
import {
  Save,
  Printer,
  Hand,
  MousePointer2,
  FlipHorizontal2,
  FolderOpen,
  Download,
  Upload,
  Undo2,
  Redo2,
  RotateCw,
  Trash2,
  Copy,
  LayoutGrid,
  Box,
  Maximize,
  Plus,
  Minus,
} from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Overview } from '@/lib/workspace-types';
import { defaultCatalog } from '@/lib/workspace-types';
import {
  canPlace,
  updateAssembly,
  fromObject,
  isOpening,
  attachToWall,
  billKey,
  placementCollision,
  mirrorCabinet,
  turnCabinet,
  csvBill,
  designSchema,
  findSpace,
  footprint,
  fromProduct,
  newDesign,
  parseDesign,
  snapPosition,
  warnings,
} from '@/designer/model';
import type {
  Cabinet,
  Design,
  Product,
  ObjectKind,
  Wall,
} from '@/designer/model';
import { PlanCanvas } from './plan-canvas';
import { Preview } from './preview';
import { Library } from './library';
import { ObjectsLibrary } from './objects';
import { PrintPackage } from './print-package';
import { AssemblyEditor } from './assembly-editor';
import { DesignOptions, ItemOptions, QuotePanel } from './demo-options';
import { SelectionTools, CompareOptions } from './workflow-tools';
import { snapPlacement, duplicateOption } from '@/designer/editing';
import { MachiningTools } from './machining-tools';
import {
  StartGuide,
  MaterialPresets,
  ShortcutHelp,
  ClientPresentation,
} from './demo-tools';
import { polishedSample } from '@/designer/sample';
import { normalizeOpenings, worldToLocal } from '@/designer/model';
import {
  ArchitectureOptions,
  InstallationOptions,
  PartitionOptions,
  DrawingTools,
  InstallationSheets,
} from './advanced-options';
import { RoomEditor } from './room-editor';
import { roomEdges, rectangleInside } from '@/designer/room';

const RenderView = dynamic(() => import('./render-view'), {
  ssr: false,
  loading: () => <p>Loading renderer…</p>,
});

type History = {
  past: Design[];
  current: Design;
  future: Design[];
  error?: string;
};
function Numeric({
  label,
  value,
  min = 0,
  max = 600,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  function submit() {
    const next = Number(text);
    if (text.trim() && Number.isFinite(next) && next >= min && next <= max)
      onChange(next);
    else setText(String(value));
  }
  return (
    <label className="designer-numeric">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step="0.5"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Designer() {
  const viewer = useQuery(api.workspace.viewer, {});
  if (!viewer) return <div className="page-body">Loading designer…</div>;
  return <Editor key={viewer.id} ownerId={viewer.id} />;
}
function Editor({ ownerId }: { ownerId: string }) {
  const overviewRaw = useQuery(api.workspace.overview, {});
  const overview = overviewRaw
    ? (JSON.parse(overviewRaw) as Overview)
    : undefined;
  const [showStart, setShowStart] = useState(false);
  const [inspectorTab, setInspectorTab] = useState('design'),
    [presenting, setPresenting] = useState(false),
    [selection, setSelection] = useState<string[]>([]),
    [showClearance, setShowClearance] = useState(false);
  useEffect(() => {
    const escape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setPresenting(false);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const [moveTogether, setMoveTogether] = useState(true);
  const [versionChoice, setVersionChoice] = useState('');
  const [libraryTab, setLibraryTab] = useState<'cabinets' | 'objects'>(
    'cabinets',
  );
  const version =
    overview?.versions.find((v) => v._id === versionChoice) ??
    defaultCatalog(overview?.versions);
  const templateRaw = useQuery(
    api.workspace.browseCatalog,
    version
      ? {
          versionId: version._id,
          query: 'B',
          category: 'base_cabinet',
          offset: 0,
        }
      : 'skip',
  );
  const templateProducts = templateRaw
    ? (JSON.parse(templateRaw) as { records: Product[] }).records
    : [];
  const [history, setHistory] = useState<History | null>(null),
    [saved, setSaved] = useState<Design[]>([]),
    [openId, setOpenId] = useState('');
  const [selected, setSelected] = useState<string | null>(null),
    [mode, setMode] = useState<
      '2d' | '3d' | 'render' | 'quote' | 'compare' | 'client'
    >('2d'),
    [snap, setSnap] = useState(true),
    [zoom, setZoom] = useState(1),
    [panMode, setPanMode] = useState(false),
    [fitRevision, setFitRevision] = useState(0),
    [status, setStatus] = useState(''),
    [storageError, setStorageError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const storageKey = `kitchen-studio:${ownerId}`;
  useEffect(() => {
    let initial = newDesign();
    try {
      const draft = localStorage.getItem(storageKey + ':draft');
      if (draft) initial = parseDesign(draft);
      else setShowStart(true);
      const raw = localStorage.getItem(storageKey + ':saved');
      if (raw) {
        const list: unknown = JSON.parse(raw);
        if (!Array.isArray(list) || list.length > 20)
          throw Error('Invalid saved designs');
        setSaved(list.map((d) => designSchema.parse(d)));
      }
    } catch {
      setStorageError(
        'A saved design could not be loaded. You can still work and export a copy.',
      );
    }
    setHistory({ past: [], current: initial, future: [] });
  }, [storageKey]);
  const design = history?.current;
  useEffect(() => setSelection([]), [design?.id]);
  useEffect(() => {
    if (!design) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey + ':draft', JSON.stringify(design));
      } catch {
        setStorageError(
          'Browser storage is unavailable. Export your design to keep it.',
        );
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [design, storageKey]);
  function commit(change: (current: Design) => Design) {
    setHistory((h) => {
      if (!h) return h;
      let next = change(h.current);
      if (
        next.room.outline === h.current.room.outline &&
        (next.room.width !== h.current.room.width ||
          next.room.depth !== h.current.room.depth)
      )
        next = {
          ...next,
          room: {
            ...next.room,
            outline: next.room.outline.map((p) => ({
              x: (p.x * next.room.width) / h.current.room.width,
              y: (p.y * next.room.depth) / h.current.room.depth,
            })),
          },
        };
      next = normalizeOpenings(next);
      const validation = designSchema.safeParse(next);
      if (!validation.success)
        return {
          ...h,
          error: validation.error.issues.some(
            (issue) => issue.path.at(-1) === 'elevation',
          )
            ? 'Change not applied: an assembly item would be below the floor. Turn off Move entire assembly to adjust one item.'
            : `Change not applied: ${validation.error.issues[0]?.message ?? 'invalid design'}`,
        };
      if (JSON.stringify(next) === JSON.stringify(h.current))
        return { ...h, error: undefined };
      return {
        past: [...h.past, h.current].slice(-60),
        current: next,
        future: [],
      };
    });
    setStatus('');
  }
  function updateItem(id: string, patch: Partial<Cabinet>) {
    commit((d) => {
      const current = d.items.find((i) => i.id === id);
      let applied = patch;
      if (
        current?.opening &&
        (patch.x !== undefined || patch.y !== undefined)
      ) {
        const host = d.items.find((h) => h.id === current.opening?.hostId);
        if (host) {
          const f = footprint(current),
            point = worldToLocal(
              host,
              (patch.x ?? current.x) + f.width / 2,
              (patch.y ?? current.y) + f.depth / 2,
            );
          applied = {
            ...patch,
            opening: {
              ...current.opening,
              offset: Math.max(0, point.x - current.width / 2),
            },
          };
        }
      }
      return moveTogether
        ? updateAssembly(d, id, applied)
        : {
            ...d,
            items: d.items.map((i) => (i.id === id ? { ...i, ...applied } : i)),
          };
    });
  }
  function add(
    product: Product,
    versionId: string,
    drop?: { x: number; y: number },
  ) {
    if (!design) return;
    if (!canPlace(product)) {
      setStatus(
        'This catalog item lacks usable dimensions. Choose another item or add a custom cabinet.',
      );
      return;
    }
    if (design.items.length >= 100) {
      setStatus('This demo supports up to 100 cabinets per design.');
      return;
    }
    const item = fromProduct(product, versionId),
      space = drop
        ? snapPlacement(
            item,
            design,
            drop.x - item.width / 2,
            drop.y - item.depth / 2,
            snap,
          )
        : findSpace(item, design);
    if (!space) {
      setStatus(
        'No free space for this cabinet. Move cabinets or increase the room size.',
      );
      return;
    }
    commit((d) => ({ ...d, items: [...d.items, { ...item, ...space }] }));
    setSelected(item.id);
    setStatus(`${item.sku} added. Drag it in the plan or edit its position.`);
  }
  function addObject(kind: ObjectKind, drop?: { x: number; y: number }) {
    if (!design) return;
    if (design.items.length >= 100) {
      setStatus('This demo supports 100 items per design.');
      return;
    }
    let next = fromObject(kind);
    if (drop && !isOpening(next)) {
      const position = snapPlacement(
        next,
        design,
        drop.x - next.width / 2,
        drop.y - next.depth / 2,
        snap,
      );
      commit((d) => ({ ...d, items: [...d.items, { ...next, ...position }] }));
      setSelected(next.id);
      setStatus(
        next.sku +
          ' placed. Check red outlines and Layout checks for conflicts.',
      );
      return;
    }
    if (drop && isOpening(next)) {
      const edges = roomEdges(design.room).filter(
        (e) => !e.curved && design.room.walls[e.side],
      );
      const edge = edges.sort(
        (a, b) =>
          Math.hypot(
            drop.x - (a.a.x + a.b.x) / 2,
            drop.y - (a.a.y + a.b.y) / 2,
          ) -
          Math.hypot(
            drop.x - (b.a.x + b.b.x) / 2,
            drop.y - (b.a.y + b.b.y) / 2,
          ),
      )[0];
      if (!edge) {
        setStatus('Add a straight wall for this opening.');
        return;
      }
      next = {
        ...next,
        ...attachToWall(
          { ...next, wallSegment: edge.index },
          design.room,
          edge.side,
          drop.x,
          drop.y,
        ),
      };
      commit((d) => ({ ...d, items: [...d.items, next] }));
      setSelected(next.id);
      return;
    }
    let assemblyHost: Cabinet | undefined;
    const host = design.items.find((i) => i.id === selected);
    if (
      kind === 'sink' &&
      host &&
      (host.kind === 'countertop' || host.kind === 'island')
    ) {
      assemblyHost = host;
      const box = footprint(host);
      if (box.width < next.width + 2 || box.depth < next.depth + 2) {
        setStatus(
          'This surface is too small for the default sink. Add and resize a sink first.',
        );
        return;
      }
      next = {
        ...next,
        x: host.x + (box.width - next.width) / 2,
        y: host.y + (box.depth - next.depth) / 2,
        elevation: Math.max(0, host.elevation + host.height - next.height),
      };
    } else if (
      kind === 'countertop' &&
      host &&
      (host.category === 'base_cabinet' || host.kind === 'island')
    ) {
      assemblyHost = host;
      next = {
        ...next,
        x: host.x,
        y: host.y,
        width: host.width,
        depth: host.depth,
        rotation: host.rotation,
        elevation: host.elevation + host.height,
      };
    } else if (isOpening(next)) {
      const wall = Object.entries(design.room.walls).find(
        ([, active]) => active,
      )?.[0] as Wall | undefined;
      if (!wall) {
        setStatus('Enable a room wall before adding a door or window.');
        return;
      }
      let placed = false;
      for (
        let offset = 0;
        offset <= Math.max(design.room.width, design.room.depth);
        offset += 6
      ) {
        const candidate = {
          ...next,
          ...attachToWall(next, design.room, wall, offset, offset),
        };
        if (!design.items.some((i) => placementCollision(candidate, i))) {
          next = candidate;
          placed = true;
          break;
        }
      }
      if (!placed) {
        setStatus('No free space on this wall. Move existing items first.');
        return;
      }
    } else {
      const center = {
        ...next,
        x: Math.max(0, (design.room.width - next.width) / 2),
        y: Math.max(0, (design.room.depth - next.depth) / 2),
      };
      const position =
        kind === 'island' &&
        rectangleInside(
          design.room,
          center.x,
          center.y,
          next.width,
          next.depth,
        ) &&
        !design.items.some((i) => placementCollision(center, i))
          ? center
          : findSpace(next, design);
      if (!position) {
        setStatus(
          'No free space for this object. Increase the room size or move other items.',
        );
        return;
      }
      next = { ...next, x: position.x, y: position.y };
    }
    const box = footprint(next);
    if (box.width > design.room.width || box.depth > design.room.depth) {
      setStatus(
        'This object is larger than the room. Increase the room size first.',
      );
      return;
    }
    if (assemblyHost) {
      const assemblyId = assemblyHost.assemblyId ?? crypto.randomUUID();
      next = { ...next, assemblyId };
      commit((d) => ({
        ...d,
        items: [
          ...d.items.map((i) =>
            i.id === assemblyHost?.id ? { ...i, assemblyId } : i,
          ),
          next,
        ],
      }));
    } else commit((d) => ({ ...d, items: [...d.items, next] }));
    setSelected(next.id);
    setStatus(`${next.sku} added. Edit its dimensions in Properties.`);
  }
  function save() {
    if (!design) return;
    const next = [design, ...saved.filter((d) => d.id !== design.id)];
    if (next.length > 20) {
      setStatus(
        'You have 20 saved designs. Export this design or replace an existing one.',
      );
      return;
    }
    try {
      localStorage.setItem(storageKey + ':saved', JSON.stringify(next));
      setSaved(next);
      setOpenId(design.id);
      setStatus('Design saved in this browser.');
    } catch {
      setStorageError(
        'Could not save in this browser. Export a JSON copy instead.',
      );
    }
  }
  function open() {
    const next = saved.find((d) => d.id === openId);
    if (next) {
      commit(() => next);
      setSelected(null);
      setStatus(`Opened ${next.name}. Undo restores the previous design.`);
    }
  }
  async function importFile(imported: File) {
    try {
      if (imported.size > 500_000) throw Error('large');
      const parsed = parseDesign(await imported.text());
      commit(() => ({ ...parsed, id: crypto.randomUUID() }));
      setSelected(null);
      setStatus('Design imported. Save to keep a named copy.');
    } catch {
      setStatus(
        'Could not import: choose a valid Kitchen Studio JSON file (up to 500 KB and 100 cabinets).',
      );
    } finally {
      if (file.current) file.current.value = '';
    }
  }
  if (!design || !history)
    return <div className="page-body">Loading saved designs…</div>;
  const item = design.items.find((i) => i.id === selected),
    issues = warnings(design),
    warningIds = new Set(issues.flatMap((i) => i.itemIds));
  const bill = Array.from(
    design.items
      .reduce((map, i) => {
        const key = billKey(i);
        const entry = map.get(key);
        if (entry) entry.quantity++;
        else map.set(key, { item: i, quantity: 1 });
        return map;
      }, new Map<string, { item: Cabinet; quantity: number }>())
      .values(),
  );
  function example() {
    if (!version) return;
    const base = templateProducts.find((p) => p.sku === 'B24'),
      small = templateProducts.find((p) => p.sku === 'B18');
    if (!base || !small) {
      setStatus(
        'The example needs B24 and B18 in this catalog. You can add other cabinets from the library.',
      );
      return;
    }
    const next = newDesign();
    next.name = 'Allure demo kitchen';
    next.items = [
      { p: base, x: 24, y: 0, r: 0 },
      { p: base, x: 48, y: 0, r: 0 },
      { p: base, x: 72, y: 0, r: 0 },
      { p: small, x: 96, y: 0, r: 0 },
      { p: base, x: 0, y: 24, r: 270 },
      { p: base, x: 0, y: 48, r: 270 },
      { p: small, x: 0, y: 72, r: 270 },
    ].map(({ p, x, y, r }) => ({
      ...fromProduct(p, version._id),
      x,
      y,
      rotation: r as Cabinet['rotation'],
    }));
    commit(() => next);
    setSelected(next.items[0]?.id ?? null);
    setStatus(
      'Example kitchen loaded from your catalog. Drag any cabinet to change it. Undo restores the previous design.',
    );
  }
  function rotate(degrees: 90 | 180 = 90) {
    if (!item || !design) return;
    const rotated = turnCabinet(item, degrees);
    updateItem(item.id, {
      rotation: rotated.rotation,
      ...snapPosition(rotated, design.room, item.x, item.y, snap),
    });
  }
  function startDesign(next: Design) {
    commit(() => next);
    setShowStart(false);
    setSelected(null);
    setSelection([]);
    setMode(next.items.length ? 'render' : '2d');
    setLibraryTab('objects');
    setInspectorTab('design');
    setZoom(1);
    setPanMode(false);
    setShowClearance(false);
    setMoveTogether(true);
    setSnap(true);
    setFitRevision((r) => r + 1);
    setPresenting(false);
    setStatus(
      next.items.length
        ? 'Demo kitchen restored. Undo restores your previous design; named saves are retained.'
        : 'Room ready. Search Objects and add cabinets, doors or appliances. Undo restores your previous design.',
    );
  }
  return (
    <div
      className={`designer-app ${mode === 'client' ? 'has-client-presentation' : ''} ${presenting ? 'is-presenting' : ''}`}
    >
      {presenting && (
        <div className="presentation-bar">
          <strong>{design.name}</strong>
          <button onClick={() => setPresenting(false)}>
            Exit presentation · Esc
          </button>
        </div>
      )}
      {showStart && (
        <StartGuide onStart={startDesign} onClose={() => setShowStart(false)} />
      )}
      <PrintPackage design={design} />
      <InstallationSheets design={design} />
      <header className="designer-header">
        <h1>Kitchen designer</h1>
        <button onClick={() => setShowStart((v) => !v)}>Start here</button>
        <button
          onClick={() => {
            setShowStart(false);
            setMode('client');
          }}
        >
          Client presentation / PDF
        </button>
        <button onClick={() => startDesign(polishedSample())}>
          Reset demo
        </button>
        <button
          onClick={() => {
            setMode('render');
            setPresenting(true);
          }}
        >
          Present
        </button>
        <label className="project-name">
          Project name
          <input
            aria-label="Project name"
            value={design.name}
            maxLength={100}
            onChange={(e) =>
              commit((d) => ({ ...d, name: e.target.value || 'My kitchen' }))
            }
          />
        </label>
        <div className="designer-row">
          <button onClick={() => window.print()}>
            <Printer size={16} /> Print / PDF
          </button>
          <button className="designer-primary" onClick={save}>
            <Save size={16} /> Save design
          </button>
          <button
            onClick={() => {
              document.getElementById('saved-designs')?.focus();
            }}
          >
            <FolderOpen size={16} /> Open design
          </button>
        </div>
      </header>
      <ShortcutHelp />
      <div className="designer-projectbar">
        <span>Draft saves automatically in this browser</span>
        <div className="designer-row">
          <select
            id="saved-designs"
            aria-label="Saved designs"
            value={openId}
            onChange={(e) => setOpenId(e.target.value)}
          >
            <option value="">Choose a saved design</option>
            {saved.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.items.length} cabinets
              </option>
            ))}
          </select>
          <button disabled={!openId} onClick={open}>
            Open
          </button>
          <button
            onClick={() => {
              commit(() => newDesign());
              setSelected(null);
              setStatus('New room created. Undo restores the previous design.');
            }}
          >
            New room
          </button>
          <button onClick={() => setMode('compare')}>Compare options</button>
          <button
            onClick={() => {
              commit(() => polishedSample());
              setSelected(null);
              setMode('render');
              setStatus(
                'Presentation kitchen loaded. Undo restores your previous design.',
              );
            }}
          >
            Load presentation kitchen
          </button>
          <button disabled={!templateRaw} onClick={example}>
            Load example kitchen
          </button>
          <button
            onClick={() =>
              download(
                JSON.stringify(design, null, 2),
                `${design.name.replace(/[^a-z0-9-]/gi, '_')}.json`,
                'application/json',
              )
            }
          >
            <Download size={14} /> Export
          </button>
          <button onClick={() => file.current?.click()}>
            <Upload size={14} /> Import
          </button>
          <input
            hidden
            ref={file}
            type="file"
            accept=".json,application/json"
            aria-label="Import design file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
            }}
          />
        </div>
      </div>
      {(status || storageError || history.error) && (
        <div
          role="status"
          className={
            storageError ? 'designer-message warning' : 'designer-message'
          }
        >
          {storageError || history.error || status}
        </div>
      )}
      <div className="designer-grid">
        <div className="designer-library-column">
          {overview && version && (
            <select
              className="designer-version"
              aria-label="Designer catalog"
              value={version._id}
              onChange={(e) => setVersionChoice(e.target.value)}
            >
              {overview.versions.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.label}
                </option>
              ))}
            </select>
          )}
          <div className="designer-row library-tabs">
            <button
              aria-pressed={libraryTab === 'cabinets'}
              onClick={() => setLibraryTab('cabinets')}
            >
              Cabinets
            </button>
            <button
              aria-pressed={libraryTab === 'objects'}
              onClick={() => setLibraryTab('objects')}
            >
              Objects
            </button>
          </div>
          {libraryTab === 'cabinets' ? (
            <Library version={version} onAdd={add} />
          ) : (
            <ObjectsLibrary key={design.id} onAdd={addObject} />
          )}
        </div>
        <section className="designer-center" aria-label="Design workspace">
          <div className="designer-tools">
            <div className="designer-row">
              <button
                aria-pressed={mode === '2d'}
                onClick={() => setMode('2d')}
              >
                <LayoutGrid size={16} /> 2D plan
              </button>
              <button
                aria-pressed={mode === '3d'}
                onClick={() => setMode('3d')}
              >
                <Box size={16} /> 3D preview
              </button>
              <button
                aria-pressed={mode === 'render'}
                onClick={() => setMode('render')}
              >
                Render
              </button>
              <button
                aria-pressed={mode === 'quote'}
                onClick={() => setMode('quote')}
              >
                Quote / order
              </button>
            </div>
            <div className="designer-row">
              <button
                aria-label="Undo"
                disabled={!history.past.length}
                onClick={() => {
                  setHistory((h) =>
                    h && h.past.length
                      ? {
                          past: h.past.slice(0, -1),
                          current: h.past.at(-1) ?? h.current,
                          future: [h.current, ...h.future],
                        }
                      : h,
                  );
                  setStatus('');
                }}
              >
                <Undo2 size={16} />
              </button>
              <button
                aria-label="Redo"
                disabled={!history.future.length}
                onClick={() => {
                  setHistory((h) =>
                    h && h.future.length
                      ? {
                          past: [...h.past, h.current],
                          current: h.future[0] ?? h.current,
                          future: h.future.slice(1),
                        }
                      : h,
                  );
                  setStatus('');
                }}
              >
                <Redo2 size={16} />
              </button>
              {mode === '2d' && (
                <>
                  <button
                    aria-pressed={!panMode}
                    onClick={() => setPanMode(false)}
                  >
                    <MousePointer2 size={15} /> Select
                  </button>
                  <button
                    aria-pressed={panMode}
                    onClick={() => setPanMode(true)}
                  >
                    <Hand size={15} /> Pan
                  </button>
                  <button
                    aria-label="Zoom out"
                    disabled={zoom <= 0.5}
                    onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
                  >
                    <Minus size={15} />
                  </button>
                  <button
                    aria-label="Zoom in"
                    disabled={zoom >= 4}
                    onClick={() => setZoom(Math.min(4, zoom + 0.25))}
                  >
                    <Plus size={15} />
                  </button>
                  <span className="designer-zoom">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    onClick={() => {
                      setZoom(1);
                      setFitRevision((n) => n + 1);
                    }}
                  >
                    <Maximize size={15} /> Fit
                  </button>
                </>
              )}
            </div>
          </div>
          {mode === 'compare' ? (
            <CompareOptions
              design={design}
              saved={saved}
              onOpen={(next) => {
                commit(() => next);
                setSelected(null);
              }}
              onDuplicate={(name) => {
                const copy = duplicateOption(design, name),
                  next = [
                    copy,
                    design,
                    ...saved.filter((d) => d.id !== design.id),
                  ];
                if (next.length > 20) {
                  setStatus('Saved design limit reached. Export a copy first.');
                  return;
                }
                try {
                  localStorage.setItem(
                    storageKey + ':saved',
                    JSON.stringify(next),
                  );
                  setSaved(next);
                  commit(() => copy);
                  setSelected(null);
                } catch {
                  setStorageError(
                    'Could not save alternatives. Export a copy first.',
                  );
                }
              }}
            />
          ) : mode === 'quote' ? (
            <QuotePanel
              design={design}
              onChange={(next) => commit(() => next)}
            />
          ) : mode === '2d' ? (
            <PlanCanvas
              key={`${design.id}:${fitRevision}`}
              panMode={panMode}
              moveTogether={moveTogether}
              design={design}
              selected={selected}
              onSelect={setSelected}
              onMove={(id, x, y) => updateItem(id, { x, y })}
              snap={snap}
              zoom={zoom}
              warningIds={warningIds}
              issueIds={new Set(issues.map((i) => i.id))}
              selectedIds={selection}
              onToggle={(id) =>
                setSelection((ids) =>
                  ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
                )
              }
              showClearance={showClearance}
              onDropItem={(payload, point) => {
                if (payload.kind === 'object') addObject(payload.object, point);
                else add(payload.product, payload.versionId, point);
              }}
            />
          ) : mode === 'client' ? (
            <ClientPresentation key={JSON.stringify(design)} design={design} />
          ) : mode === 'render' ? (
            <RenderView
              key={design.id}
              design={design}
              onChange={(next) => commit(() => next)}
            />
          ) : (
            <Preview
              design={design}
              selected={selected}
              onSelect={setSelected}
            />
          )}
          {mode === '2d' && (
            <SelectionTools
              design={design}
              ids={selection}
              onIds={setSelection}
              onChange={(next) => commit(() => next)}
            />
          )}
          <div className="designer-canvas-footer">
            <span>
              {mode === '2d'
                ? 'Drag empty space to pan · Space + drag anywhere · arrow keys: 1″ / Shift: 6″'
                : 'Rotate the view to inspect your layout'}
            </span>
            <label>
              <input
                type="checkbox"
                checked={snap}
                onChange={(e) => setSnap(e.target.checked)}
              />{' '}
              Snap to walls & items
            </label>
          </div>
          <section className="designer-bill">
            <div className="designer-row bill-title">
              <h2>Items in design ({design.items.length})</h2>
              <button
                disabled={!design.items.length}
                onClick={() =>
                  download(csvBill(design), 'cabinet-list.csv', 'text/csv')
                }
              >
                <Download size={14} /> Export list
              </button>
            </div>
            <div className="designer-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>W × D × H (in)</th>
                    <th>Quantity</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.map(({ item: i, quantity }) => (
                    <tr key={billKey(i)}>
                      <td>
                        <button
                          className="designer-text-button"
                          onClick={() => setSelected(i.id)}
                        >
                          {i.sku}
                        </button>
                      </td>
                      <td>
                        {i.width} × {i.depth} × {i.height}
                      </td>
                      <td>{quantity}</td>
                      <td>
                        {i.kind === 'cabinet' ? (
                          <Link
                            href={`/review?version=${encodeURIComponent(i.versionId)}&record=${encodeURIComponent(i.recordId)}`}
                          >
                            PDF {i.pageNumber}
                          </Link>
                        ) : (
                          <span>Demo object</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!bill.length && <p>Add cabinets to build your product list.</p>}
            </div>
          </section>
        </section>
        <aside className="designer-inspector">
          <h2>Properties</h2>
          <div
            role="tablist"
            aria-label="Inspector sections"
            className="inspector-tabs"
          >
            {['design', 'materials', 'installation', 'documents'].map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={inspectorTab === tab}
                onClick={() => setInspectorTab(tab)}
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
                <p className="designer-muted">
                  {item.width} W × {item.depth} D × {item.height} H (in)
                </p>
                <p className="designer-muted">
                  Footprint: {footprint(item).width} × {footprint(item).depth}{' '}
                  in · {item.rotation}°
                </p>
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
                {item.kind === 'cabinet' && (
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
                    onMoveTogether={setMoveTogether}
                    onChange={(next) => commit(() => next)}
                  />
                )}
                <div className="designer-row">
                  <button disabled={isOpening(item)} onClick={() => rotate(90)}>
                    <RotateCw size={14} /> Rotate 90°
                  </button>
                  <button
                    disabled={isOpening(item)}
                    onClick={() => rotate(180)}
                  >
                    <RotateCw size={14} /> Turn 180°
                  </button>
                  <button
                    aria-pressed={item.mirrored}
                    onClick={() => updateItem(item.id, mirrorCabinet(item))}
                  >
                    <FlipHorizontal2 size={14} /> Flip left/right
                  </button>
                  <button
                    aria-label="Duplicate cabinet"
                    disabled={design.items.length >= 100}
                    onClick={() => {
                      const copy = { ...item, id: crypto.randomUUID() },
                        space = findSpace(copy, design);
                      if (!space) {
                        setStatus('No free space for a duplicate.');
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
                    {item.mirrored ? 'Mirrored' : 'Standard'} illustrative
                    front. The dot marks the handle side; confirm manufacturer
                    handing separately.
                  </p>
                )}
                {item.kind === 'cabinet' && (
                  <Link
                    className="designer-source"
                    href={`/review?version=${encodeURIComponent(item.versionId)}&record=${encodeURIComponent(item.recordId)}`}
                  >
                    Inspect source · PDF {item.pageNumber}
                  </Link>
                )}
              </>
            ) : (
              <p className="designer-muted">
                Select a cabinet in the plan or product list to edit its
                position.
              </p>
            )}
          </section>
          <section hidden={inspectorTab !== 'documents'}>
            {' '}
            <DrawingTools
              design={design}
              onChange={(next) => commit(() => next)}
            />
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
            <MaterialPresets
              design={design}
              onChange={(next) => commit(() => next)}
            />
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
            hidden={
              inspectorTab !== 'design' && inspectorTab !== 'installation'
            }
          >
            <h3>Layout checks</h3>
            <label>
              <input
                type="checkbox"
                checked={showClearance}
                onChange={(e) => {
                  setShowClearance(e.target.checked);
                  setMode('2d');
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
                        setMode('2d');
                        setShowClearance(true);
                        setFitRevision((n) => n + 1);
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
            <p className="designer-muted">
              Checks use design geometry and recorded service data. Field and
              manufacturer review remain required.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
