'use client';
import {
  SampleGallery,
  SampleStory,
  ObjectManager,
  RoomPhoto,
  SurfaceEditor,
  ReadinessCheck,
} from './studio-panels';
import { DesignerKeyboardSupport } from './keyboard-support';
import { ProjectHub } from './project-hub';
import { PurchasingWorkspace } from './purchasing-workspace';
import { FirstUseGuide } from './first-use-guide';
import { ProjectWorkflow } from './project-workflow';
import { DesignDecisions } from './design-decisions';
import { MeasurementWizard } from './measurement-wizard';
import { CloudProjects } from './cloud-projects';
import { AlternativeLayouts, SupplierQuotes } from './business-tools';
import { ElevationView } from './elevation-view';
import { lockViolation } from '@/designer/studio-tools';
import { KitchenActions } from './kitchen-actions';
import { QuickInspector, FitAndOverhang } from './refinement-tools';
import { placementBlock } from '@/designer/refinements';
import { SmartPlacement, DesignRecovery, Showroom } from './experience-tools';
import { LightingComparison } from './demo-readiness';
import { PresentationTour } from './presentation-tour';
import type { CameraView } from './render-view';
import { PlacementAssist } from './placement-assist';
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
  objectOptions,
  objectOptionPatch,
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
import type { Cabinet, Design, Product, ObjectKind } from '@/designer/model';
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
  DemoWalkthrough,
  StartGuide,
  MaterialPresets,
  ShortcutHelp,
  ClientPresentation,
} from './demo-tools';
import {
  assemblyMembers,
  finishAssembly,
  placementAt,
} from '@/designer/editing';
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
  const [libraryCollapsed, setLibraryCollapsed] = useState(false),
    [inspectorCollapsed, setInspectorCollapsed] = useState(false),
    [walkStep, setWalkStep] = useState<number | null>(null);
  const [before, setBefore] = useState<Design | null>(null);
  const [presentationCamera, setPresentationCamera] = useState<
    CameraView | undefined
  >();
  const [showStart, setShowStart] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
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
  const [showroom, setShowroom] = useState(false);
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
      '2d' | '3d' | 'render' | 'quote' | 'compare' | 'client' | 'elevation'
    >('2d'),
    [snap, setSnap] = useState(true),
    [zoom, setZoom] = useState(1),
    [panMode, setPanMode] = useState(false),
    [fitRevision, setFitRevision] = useState(0),
    [status, setStatus] = useState(''),
    [storageError, setStorageError] = useState('');
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>(
    'saving',
  );
  const [lastSession, setLastSession] = useState<Design | null>(null);
  const [savedAt, setSavedAt] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const storageKey = `kitchen-studio:${ownerId}`;
  useEffect(() => {
    let initial = newDesign();
    try {
      const draft = localStorage.getItem(storageKey + ':draft');
      if (draft) {
        try {
          initial = parseDesign(draft);
        } catch {
          const backup = localStorage.getItem(storageKey + ':recovery');
          if (!backup) throw Error('No recovery copy');
          initial = parseDesign(backup);
          setStorageError(
            'Recovered the previous valid draft because the latest draft could not be read.',
          );
        }
        setLastSession(initial);
      } else {
        setWalkStep(0);
        setShowGallery(true);
      }
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
    try {
      const raw = localStorage.getItem(storageKey + ':before');
      const baseline = raw ? parseDesign(raw) : null;
      setBefore(baseline?.id === initial.id ? baseline : initial);
    } catch {
      setBefore(initial);
    }
    try {
      const pending = sessionStorage.getItem(`kitchen-open:${ownerId}`);
      if (pending) {
        const request = JSON.parse(pending);
        const opened = designSchema.parse(request.design);
        if (
          typeof request.projectId !== 'string' ||
          !Number.isInteger(request.revision)
        )
          throw Error('Invalid cloud open request');
        localStorage.setItem(
          `kitchen-cloud:${ownerId}:${opened.id}`,
          JSON.stringify({
            projectId: request.projectId,
            revision: request.revision,
          }),
        );
        sessionStorage.removeItem(`kitchen-open:${ownerId}`);
        setHistory({ past: [initial], current: opened, future: [] });
        setBefore(opened);
        setShowGallery(false);
        setWalkStep(null);
        return;
      }
    } catch {
      setStorageError(
        'Could not open the cloud project. Your local draft was retained.',
      );
    }
    setHistory({ past: [], current: initial, future: [] });
  }, [storageKey]);
  useEffect(() => {
    if (before)
      try {
        localStorage.setItem(storageKey + ':before', JSON.stringify(before));
      } catch {
        setStorageError(
          'Could not save the comparison snapshot in this browser.',
        );
      }
  }, [before, storageKey]);
  const design = history?.current;
  useEffect(() => setSelection([]), [design?.id]);
  useEffect(() => {
    if (!design) return;
    setSaveState('saving');
    const persist = () => {
      try {
        const previous = localStorage.getItem(storageKey + ':draft');
        if (previous) {
          try {
            parseDesign(previous);
            localStorage.setItem(storageKey + ':recovery', previous);
          } catch {
            /* Keep the last valid recovery copy. */
          }
        }
        localStorage.setItem(storageKey + ':draft', JSON.stringify(design));
        setSaveState('saved');
        setSavedAt(new Date().toLocaleTimeString());
      } catch {
        setSaveState('error');
        setStorageError(
          'Browser storage is unavailable. Export your design to keep it.',
        );
      }
    };
    const timer = setTimeout(persist, 350);
    window.addEventListener('pagehide', persist);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pagehide', persist);
    };
  }, [design, storageKey]);
  function commit(
    change: (current: Design) => Design,
    protectPlacement = false,
  ) {
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
      const placementError = protectPlacement
        ? placementBlock(h.current, next)
        : null;
      if (placementError) return { ...h, error: placementError };
      const locked = lockViolation(h.current, next);
      if (locked)
        return {
          ...h,
          error: `Unlock ${locked} before changing its geometry or deleting it.`,
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
    commit(
      (d) => {
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
              items: d.items.map((i) =>
                i.id === id ? { ...i, ...applied } : i,
              ),
            };
      },
      patch.x !== undefined ||
        patch.y !== undefined ||
        patch.rotation !== undefined,
    );
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
    commit((d) => ({ ...d, items: [...d.items, { ...item, ...space }] }), true);
    setSelected(item.id);
    setStatus(`${item.sku} added. Drag it in the plan or edit its position.`);
  }
  function addObject(
    kind: ObjectKind,
    drop?: { x: number; y: number },
    option?: string,
  ) {
    if (!design) return;
    if (design.items.length >= 100) {
      setStatus('This demo supports 100 items per design.');
      return;
    }
    let next = fromObject(kind, option);
    if (drop) {
      const placed = placementAt(next, design, drop, snap);
      if (!placed) {
        setStatus('Add a straight wall for this opening.');
        return;
      }
      commit((d) => ({ ...d, items: [...d.items, placed] }), true);
      setSelected(placed.id);
      setStatus(placed.sku + ' placed. Layout checks explain any conflicts.');
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
      const edges = roomEdges(design.room).filter(
        (edge) =>
          !edge.curved &&
          design.room.walls[edge.side] &&
          edge.length >= next.width,
      );
      let placed = false;
      for (const edge of edges) {
        for (
          let offset = next.width / 2;
          offset <= edge.length - next.width / 2;
          offset += 3
        ) {
          const candidate = {
            ...next,
            ...attachToWall(
              { ...next, wallSegment: edge.index },
              design.room,
              edge.side,
              edge.a.x +
                ((edge.b.x - edge.a.x) * offset) / edge.length -
                next.width / 2,
              edge.a.y +
                ((edge.b.y - edge.a.y) * offset) / edge.length -
                next.depth / 2,
            ),
          };
          if (!design.items.some((i) => placementCollision(candidate, i))) {
            next = candidate;
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      if (!placed) {
        setStatus(
          'No free space on an enabled straight wall for this opening. Move existing items or choose a smaller size.',
        );
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
  function walkthroughStep(step: number) {
    setWalkStep(step);
    setShowStart(false);
    setInspectorCollapsed(step === 0 || step === 3 || step === 4);
    setLibraryCollapsed(true);
    if (step === 0) {
      setShowGallery(true);
      setMode('2d');
    }
    if (step === 1) {
      setShowGallery(false);
      setMode('render');
      setInspectorTab('materials');
    }
    if (step === 2) {
      setLibraryCollapsed(false);
      setLibraryTab('objects');
      setMode('2d');
      setInspectorTab('design');
      setSelected(
        design?.items.find((i) => i.kind === 'custom_cabinet')?.id ?? null,
      );
    }
    if (step === 3) setMode('compare');
    if (step === 4) setMode('client');
  }
  function startDesign(next: Design) {
    setBefore(structuredClone(next));
    setPresentationCamera(undefined);
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
      className={`designer-app ${libraryCollapsed ? 'library-collapsed' : ''} ${inspectorCollapsed ? 'inspector-collapsed' : ''} ${mode === 'client' ? 'has-client-presentation' : ''} ${presenting ? 'is-presenting' : ''} ${showroom ? 'has-showroom' : ''}`}
    >
      <DesignerKeyboardSupport />
      {showroom && (
        <Showroom
          key={design.id}
          design={design}
          before={before?.id === design.id ? before : null}
          onChange={(next) => commit(() => next)}
          onExit={() => setShowroom(false)}
        />
      )}
      {presenting && (
        <PresentationTour
          design={design}
          onCamera={setPresentationCamera}
          onExit={() => setPresenting(false)}
        />
      )}
      {showGallery && (
        <SampleGallery
          onLoad={(next) => {
            startDesign(next);
            setShowGallery(false);
            setMode('render');
          }}
          onClose={() => setShowGallery(false)}
        />
      )}
      {showStart && (
        <StartGuide
          onStart={(next, mode) => {
            startDesign(next);
            setMode(mode ?? '2d');
          }}
          onClose={() => setShowStart(false)}
        />
      )}
      {walkStep !== null && (
        <DemoWalkthrough
          step={walkStep}
          onStep={walkthroughStep}
          onClose={() => setWalkStep(null)}
        />
      )}
      <PrintPackage design={design} />
      <InstallationSheets design={design} />
      <header className="designer-header">
        <h1>Kitchen designer</h1>
        <button
          onClick={() => {
            setShowroom(true);
            setPresenting(false);
          }}
        >
          Open showroom
        </button>
        <button
          className="designer-primary"
          title="Present the current kitchen"
          onClick={() => {
            setMode('render');
            setPresentationCamera(design.views?.[0]);
            setPresenting(true);
          }}
        >
          Show this kitchen
        </button>
        <button onClick={() => walkthroughStep(0)}>Demo walkthrough</button>
        <button
          onClick={() => {
            setMode('compare');
            setLibraryCollapsed(true);
            setInspectorCollapsed(true);
          }}
        >
          Compare options
        </button>
        <button onClick={() => setShowStart((v) => !v)}>Start here</button>
        <button onClick={() => setShowGallery((v) => !v)}>
          Choose a sample kitchen
        </button>
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
              const files =
                document.querySelector<HTMLDetailsElement>('.project-controls');
              if (files) files.open = true;
              document.getElementById('saved-designs')?.focus();
            }}
          >
            <FolderOpen size={16} /> Open design
          </button>
        </div>
      </header>
      <nav className="designer-skip-links" aria-label="Designer shortcuts">
        <a href="#project-dashboard">Skip to project overview</a>
        <a href="#design-workspace">Skip to design canvas</a>
        <a
          href="#designer-inspector"
          onClick={(event) => {
            event.preventDefault();
            setInspectorCollapsed(false);
            setPresenting(false);
            setMode('2d');
            requestAnimationFrame(() => {
              const target = document.getElementById('designer-inspector');
              target?.scrollIntoView({ behavior: 'smooth' });
              target?.focus({ preventScroll: true });
            });
          }}
        >
          Skip to item controls
        </a>
      </nav>
      <ProjectHub
        key={`hub:${design.id}`}
        design={design}
        ownerId={ownerId}
        onRestore={(next) => {
          setHistory({ past: [], current: next, future: [] });
          setSelected(null);
          setSelection([]);
          setBefore(next);
          setStatus('Complete project restored as a separate local copy.');
        }}
      />
      <FirstUseGuide
        ownerId={ownerId}
        design={design}
        onDemo={() => walkthroughStep(0)}
      />
      <PurchasingWorkspace
        key={`purchasing:${design.id}`}
        ownerId={ownerId}
        design={design}
        onLocate={(id) => {
          setSelected(id);
          setMode('2d');
          document
            .querySelector('.canvas-panel-controls')
            ?.scrollIntoView({ behavior: 'smooth' });
        }}
      />
      <ProjectWorkflow
        key={`workflow:${design.id}`}
        design={design}
        ownerId={ownerId}
        onLocate={(id) => {
          setSelected(id);
          setMode('2d');
          document
            .querySelector('.canvas-panel-controls')
            ?.scrollIntoView({ behavior: 'smooth' });
        }}
        onNavigate={(stage, target) => {
          if (stage === 'Design') {
            setMode('2d');
            document
              .querySelector('.canvas-panel-controls')
              ?.scrollIntoView({ behavior: 'smooth' });
            return;
          }
          const label =
            target === 'selections'
              ? 'Design decisions · budget, checks & site handoff'
              : stage === 'Measure'
                ? 'Guided room measurements'
                : stage === 'Price'
                  ? 'Supplier quotes'
                  : stage === 'Present'
                    ? 'Cloud projects & client reviews'
                    : 'Design decisions · budget, checks & site handoff';
          const section = Array.from(document.querySelectorAll('details')).find(
            (d) => d.querySelector(':scope > summary')?.textContent === label,
          );
          if (section) {
            section.open = true;
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          if (
            target === 'selections' ||
            stage === 'Install' ||
            stage === 'Check'
          )
            setTimeout(() => {
              const name =
                target === 'selections'
                  ? 'Client selections'
                  : stage === 'Install'
                    ? 'Installer handoff'
                    : 'Explain checks';
              Array.from(
                section?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ??
                  [],
              )
                .find((b) => b.textContent === name)
                ?.click();
            }, 100);
        }}
      />
      <CloudProjects
        onLocate={(id) => {
          setSelected(id);
          setMode('2d');
        }}
        key={design.id}
        design={design}
        ownerId={ownerId}
        onOpen={(next) => {
          setHistory((h) =>
            h
              ? {
                  past: [...h.past, h.current].slice(-60),
                  current: next,
                  future: [],
                }
              : { past: [], current: next, future: [] },
          );
          setSelected(null);
          setBefore(next);
        }}
      />
      <MeasurementWizard
        key={`measure:${design.id}`}
        design={design}
        onApply={(next) => {
          setHistory((h) =>
            h
              ? {
                  past: [...h.past, h.current].slice(-60),
                  current: next,
                  future: [],
                }
              : { past: [], current: next, future: [] },
          );
          setSelected(null);
          setMode('2d');
          setBefore(next);
        }}
      />
      <AlternativeLayouts
        design={design}
        onChange={(next) => commit(() => next, true)}
      />
      <SupplierQuotes design={design} onChange={(next) => commit(() => next)} />
      <DesignDecisions
        design={design}
        versionId={version?._id}
        onChange={(next) => commit(() => next)}
        onLocate={(id) => {
          setSelected(id);
          setMode('2d');
        }}
      />
      <ShortcutHelp />
      <details className="project-controls">
        <summary>Project files & examples</summary>
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
                setStatus(
                  'New room created. Undo restores the previous design.',
                );
              }}
            >
              New room
            </button>

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
      </details>
      <div className="save-status" role="status">
        <span>
          {saveState === 'saving'
            ? 'Saving changes…'
            : saveState === 'error'
              ? 'Changes not saved'
              : `Saved in this browser · ${savedAt}`}
        </span>
        {lastSession && (
          <button
            onClick={() => {
              commit(() => structuredClone(lastSession));
              setStatus(
                'Restored the design from the start of this session. Undo is available.',
              );
            }}
          >
            Restore last session
          </button>
        )}
      </div>
      <DesignRecovery
        key={`recovery-${design.id}`}
        design={design}
        ownerId={ownerId}
        past={history.past}
        onRestore={(next) => {
          setHistory((h) =>
            h
              ? {
                  past: [...h.past, h.current].slice(-60),
                  current: next,
                  future: [],
                }
              : h,
          );
          setSelected(null);
          setSelection([]);
          setStatus('Design restored. Undo returns to the previous version.');
        }}
      />
      <SmartPlacement
        design={design}
        selected={selected}
        onChange={(next) => commit(() => next, true)}
      />
      <SampleStory design={design} onChange={(next) => commit(() => next)} />
      <ObjectManager
        design={design}
        onChange={(next) => commit(() => next)}
        onSelect={(id) => {
          setSelected(id);
          setInspectorCollapsed(false);
        }}
      />
      <ReadinessCheck
        design={design}
        onSelect={(id) => {
          setSelected(id);
          setMode('2d');
        }}
      />
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
            <ObjectsLibrary
              key={design.id}
              onAdd={(kind, option) => addObject(kind, undefined, option)}
            />
          )}
        </div>
        <section
          className="designer-center"
          aria-label="Design workspace"
          id="design-workspace"
          tabIndex={-1}
        >
          <div className="canvas-panel-controls designer-row">
            <button
              aria-pressed={!libraryCollapsed}
              onClick={() => setLibraryCollapsed((v) => !v)}
            >
              {libraryCollapsed ? 'Show library' : 'Hide library'}
            </button>
            <button
              aria-pressed={!inspectorCollapsed}
              onClick={() => setInspectorCollapsed((v) => !v)}
            >
              {inspectorCollapsed ? 'Show properties' : 'Hide properties'}
            </button>
            <button
              onClick={() => {
                const collapse = !(libraryCollapsed && inspectorCollapsed);
                setLibraryCollapsed(collapse);
                setInspectorCollapsed(collapse);
              }}
            >
              {libraryCollapsed && inspectorCollapsed
                ? 'Restore panels'
                : 'Focus canvas'}
            </button>
          </div>
          <QuickInspector
            design={design}
            item={item}
            ids={selection}
            onPatch={(patch) => {
              if (item) updateItem(item.id, patch);
            }}
            onChange={(next) => commit(() => next)}
          />
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
                aria-pressed={mode === 'elevation'}
                onClick={() => setMode('elevation')}
              >
                Wall elevations
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
          {mode === '2d' && (
            <KitchenActions
              key={design.id}
              design={design}
              ids={selection.length ? selection : selected ? [selected] : []}
              onChange={(next) => commit(() => next)}
            />
          )}
          {mode === '2d' && (
            <PlacementAssist
              design={design}
              selected={selected}
              onChange={(next) => commit(() => next)}
            />
          )}
          {mode === 'compare' ? (
            <CompareOptions
              before={before?.id === design.id ? before : null}
              onSnapshot={() => setBefore(structuredClone(design))}
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
          ) : mode === 'elevation' ? (
            <ElevationView design={design} onSelect={setSelected} />
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
              onResize={(id, width, depth, position) =>
                commit((d) =>
                  id
                    ? {
                        ...d,
                        items: d.items.map((i) =>
                          i.id === id && i.kind !== 'cabinet'
                            ? { ...i, width, depth, ...position }
                            : i,
                        ),
                      }
                    : { ...d, room: { ...d.room, width, depth } },
                )
              }
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
                if (payload.kind === 'object')
                  addObject(payload.object, point, payload.option);
                else add(payload.product, payload.versionId, point);
              }}
            />
          ) : mode === 'client' ? (
            <ClientPresentation
              key={JSON.stringify(design)}
              design={design}
              ownerId={ownerId}
            />
          ) : mode === 'render' ? (
            <>
              <LightingComparison
                key={`lighting-${design.id}`}
                design={design}
              />
              <RenderView
                cameraView={presenting ? presentationCamera : undefined}
                key={design.id}
                design={design}
                selected={selected}
                selectedIds={selection}
                onSelect={(id) => {
                  setSelected(id);
                  if (id) {
                    setInspectorCollapsed(false);
                    setInspectorTab('design');
                  }
                }}
                onChange={(next) => commit(() => next)}
              />
            </>
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
                {item.assemblyId && (
                  <button
                    onClick={() => {
                      setSelection(assemblyMembers(design, item.id));
                      setMoveTogether(true);
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
                  Footprint: {footprint(item).width} × {footprint(item).depth}{' '}
                  in · {item.rotation}°
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
                {['cabinet', 'custom_cabinet', 'island'].includes(
                  item.kind,
                ) && (
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
