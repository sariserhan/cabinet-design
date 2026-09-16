'use client';
import { download } from './designer-widgets';
import {
  DesignerInspector,
  type InspectorPanelState,
} from './designer-inspector';
import { DesignerMoreTools } from './designer-tools';
import type { History, WorkspaceStage } from './designer-state';
import { sourceLink } from '@/designer/design-decisions';
import { SampleGallery } from './studio-panels';
import { DesignerKeyboardSupport } from './keyboard-support';
import { EverydayEditing } from './everyday-editing';
import { ProfessionalOutput } from './professional-output';
import { openProjectTool } from './project-hub';
import { MeasurementWizard } from './measurement-wizard';
import { SupplierQuotes } from './business-tools';
import { ElevationView } from './elevation-view';
import { lockViolation } from '@/designer/studio-tools';
import { KitchenActions } from './kitchen-actions';
import { QuickInspector } from './refinement-tools';
import { placementBlock } from '@/designer/refinements';
import { Showroom } from './experience-tools';
import { LightingComparison } from './demo-readiness';
import { PresentationTour } from './presentation-tour';
import type { CameraView } from './render-view';
import { PlacementAssist } from './placement-assist';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useQuery } from 'convex/react';
import {
  Save,
  Printer,
  Hand,
  MousePointer2,
  FolderOpen,
  Download,
  Undo2,
  Redo2,
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
  turnCabinet,
  csvBill,
  designSchema,
  MAX_DESIGN_TEXT,
  findSpace,
  footprint,
  fromProduct,
  newDesign,
  parseDesign,
  snapPosition,
  warnings,
  MAX_DESIGN_ITEMS,
} from '@/designer/model';
import type { Cabinet, Design, Product, ObjectKind } from '@/designer/model';
import { PlanCanvas } from './plan-canvas';
import { Preview } from './preview';
import { Library } from './library';
import { ObjectsLibrary } from './objects';
import { PrintPackage } from './print-package';
import { QuotePanel } from './demo-options';
import { SelectionTools, CompareOptions } from './workflow-tools';
import { snapPlacement, duplicateOption } from '@/designer/editing';
import { DemoWalkthrough, StartGuide, ClientPresentation } from './demo-tools';
import { placementAt } from '@/designer/editing';
import { polishedSample } from '@/designer/sample';
import { normalizeOpenings, worldToLocal } from '@/designer/model';
import {
  MAX_SAVED_DESIGNS,
  browserRecordStore,
  loadSavedDesigns,
  persistSavedDesigns,
} from '@/designer/design-store';
import { InstallationSheets } from './advanced-options';
import { roomEdges, rectangleInside } from '@/designer/room';

const RenderView = dynamic(() => import('./render-view'), {
  ssr: false,
  loading: () => <p>Loading renderer…</p>,
});

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
    [canvasExpanded, setCanvasExpanded] = useState(false),
    [inspectorCollapsed, setInspectorCollapsed] = useState(false),
    [walkStep, setWalkStep] = useState<number | null>(null);
  const [before, setBefore] = useState<Design | null>(null);
  const [presentationCamera, setPresentationCamera] = useState<
    CameraView | undefined
  >();
  const [workspaceStage, setWorkspaceStage] =
    useState<WorkspaceStage>('Design');
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
  useEffect(() => {
    const navigate = (event: Event) => {
      const stage = (event as CustomEvent).detail;
      if (['Room', 'Cabinets', 'Design', 'Quote', 'Present'].includes(stage)) {
        setWorkspaceStage(stage);
        setMode(
          stage === 'Quote' ? 'quote' : stage === 'Present' ? 'client' : '2d',
        );
      }
    };
    window.addEventListener('kitchen-workflow-stage', navigate);
    return () => window.removeEventListener('kitchen-workflow-stage', navigate);
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
    // The 3D view starts locked so orbiting a design cannot move it. Hydrated
    // from the browser below, because the choice is remembered per account.
    [renderLocked, setRenderLocked] = useState(true),
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
  const pendingDraft = useRef<(() => void) | null>(null);
  const importRequest = useRef(0);
  const currentDesign = useRef<Design | undefined>(undefined);
  // Opened lazily so server rendering and blocked site data both stay safe.
  const recordStore = useRef<ReturnType<typeof browserRecordStore>>(null);
  const storageKey = `kitchen-studio:${ownerId}`;
  useEffect(() => {
    if (window.matchMedia('(max-width: 700px)').matches) {
      setLibraryCollapsed(true);
      setInspectorCollapsed(true);
    }
    recordStore.current ??= browserRecordStore();
    try {
      const remembered = localStorage.getItem(storageKey + ':render-lock');
      if (remembered !== null) setRenderLocked(remembered === '1');
    } catch {
      // Blocked site data just means the safe default stands.
    }
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
        setWorkspaceStage('Room');
      }
      // Saved designs live in IndexedDB; this migrates any localStorage list.
      void loadSavedDesigns({
        store: recordStore.current,
        local: localStorage,
        ownerId,
        storageKey,
      })
        .then(({ designs, dropped }) => {
          setSaved(designs);
          if (dropped)
            setStorageError(
              `${dropped} saved design(s) could not be read and were left out. The rest are available.`,
            );
        })
        .catch(() =>
          setStorageError(
            'Saved designs could not be loaded. You can still work and export a copy.',
          ),
        );
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
  const [recordsEpoch, setRecordsEpoch] = useState(0);
  const design = history?.current;
  // Recomputed only when the design itself changes, not on every panel toggle
  // or keystroke elsewhere in the editor.
  const issues = useMemo(() => (design ? warnings(design) : []), [design]);
  const setInspectorPanel = useCallback(
    (patch: Partial<InspectorPanelState>) => {
      if ('inspectorTab' in patch && patch.inspectorTab !== undefined)
        setInspectorTab(patch.inspectorTab);
      if ('moveTogether' in patch && patch.moveTogether !== undefined)
        setMoveTogether(patch.moveTogether);
      if ('showClearance' in patch && patch.showClearance !== undefined)
        setShowClearance(patch.showClearance);
    },
    [],
  );
  const editorCommands = useMemo(
    () => ({ setFitRevision, setMode, setStatus }),
    [],
  );
  currentDesign.current = design;
  useEffect(
    () => () => {
      pendingDraft.current?.();
      pendingDraft.current = null;
      importRequest.current++;
    },
    [],
  );
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
        pendingDraft.current = null;
        setSaveState('saved');
        setSavedAt(new Date().toLocaleTimeString());
      } catch {
        setSaveState('error');
        setStorageError(
          'Browser storage is unavailable. Export your design to keep it.',
        );
      }
    };
    pendingDraft.current = persist;
    const onHidden = () => {
      if (document.visibilityState === 'hidden') pendingDraft.current?.();
    };
    const timer = setTimeout(persist, 350);
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', persist);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [design, storageKey]);
  // The Quote stage hides the grid and presentation mode replaces it, so an
  // enlarged canvas there would cover the window with nothing.
  useEffect(() => {
    if (workspaceStage === 'Quote' || presenting) setCanvasExpanded(false);
  }, [workspaceStage, presenting]);
  useEffect(() => {
    if (!canvasExpanded) return;
    const exit = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCanvasExpanded(false);
    };
    window.addEventListener('keydown', exit);
    return () => window.removeEventListener('keydown', exit);
  }, [canvasExpanded]);
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
  /**
   * Whole-design shortcuts for the selected item: move, rotate and delete.
   *
   * The 2D plan already moves a focused item with the arrow keys, so events
   * coming from inside it are left alone rather than applying the move twice.
   * Everywhere else - most usefully the 3D view - the arrows work here.
   *
   * Locks are not checked here on purpose: commit() refuses a locked change
   * centrally and reports it, so every route in gets the same answer.
   */
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return;
      // Only on the surfaces where an item is actually being edited. Elsewhere
      // the arrow keys belong to the page, and a selection left over from
      // earlier should not quietly turn scrolling into nudging.
      if (mode !== '2d' && mode !== 'render') return;
      // The 3D view can be locked so a stray key while orbiting changes nothing.
      if (mode === 'render' && renderLocked) return;
      const current = design?.items.find((i) => i.id === selected);
      if (!design || !current) return;
      const steps: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const step = steps[e.key];
      if (step) {
        // The plan canvas handles its own focused item; do not move it twice.
        if (target?.closest('.plan-scroll')) return;
        e.preventDefault();
        const distance = e.shiftKey ? 6 : 1;
        const moved = snapPosition(
          current,
          design.room,
          current.x + step[0] * distance,
          current.y + step[1] * distance,
          false,
        );
        updateItem(current.id, { x: moved.x, y: moved.y });
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        commit((d) => ({
          ...d,
          items: d.items.filter((i) => i.id !== current.id),
        }));
        setSelected(null);
        setStatus(`${current.sku || 'Item'} deleted. Undo restores it.`);
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        const degrees = e.shiftKey ? 180 : 90;
        const turned = turnCabinet(current, degrees);
        updateItem(current.id, {
          rotation: turned.rotation,
          ...snapPosition(turned, design.room, current.x, current.y, snap),
        });
        setStatus(`Rotated ${degrees}°.`);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [design, selected, snap, moveTogether, mode, renderLocked]);
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
    if (design.items.length >= MAX_DESIGN_ITEMS) {
      setStatus(`A design holds up to ${MAX_DESIGN_ITEMS} items.`);
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
    if (design.items.length >= MAX_DESIGN_ITEMS) {
      setStatus(`A design holds up to ${MAX_DESIGN_ITEMS} items.`);
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
    if (next.length > MAX_SAVED_DESIGNS) {
      setStatus(
        `You have ${MAX_SAVED_DESIGNS} saved designs. Export this design or replace an existing one.`,
      );
      return;
    }
    try {
      void persistSavedDesigns({
        store: recordStore.current,
        local: localStorage,
        ownerId,
        storageKey,
        designs: next,
      }).then(({ durable }) => {
        if (!durable)
          setStorageError(
            'Saved to this browser without a database, so the space available is much smaller. Export a JSON copy.',
          );
      });
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
    const request = ++importRequest.current;
    const startedFrom = currentDesign.current;
    try {
      if (imported.size > MAX_DESIGN_TEXT) throw Error('large');
      const parsed = parseDesign(await imported.text());
      if (request !== importRequest.current) return;
      if (currentDesign.current !== startedFrom) {
        setStatus(
          'The design changed while the file was loading. Import again when you are ready.',
        );
        return;
      }
      commit(() => ({ ...parsed, id: crypto.randomUUID() }));
      setSelected(null);
      setStatus('Design imported. Save to keep a named copy.');
    } catch {
      setStatus(
        'Could not import: choose a valid Kitchen Studio JSON file (up to 500 KB and 100 cabinets).',
      );
    } finally {
      if (file.current && request === importRequest.current)
        file.current.value = '';
    }
  }
  if (!design || !history)
    return <div className="page-body">Loading saved designs…</div>;
  const item = design.items.find((i) => i.id === selected),
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
    setWorkspaceStage('Design');
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
    setWorkspaceStage(next.items.length ? 'Design' : 'Room');
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
      className={`designer-app ${libraryCollapsed ? 'library-collapsed' : ''} ${inspectorCollapsed ? 'inspector-collapsed' : ''} ${canvasExpanded ? 'canvas-expanded' : ''} ${mode === 'client' ? 'has-client-presentation' : ''} ${presenting ? 'is-presenting' : ''} ${showroom ? 'has-showroom' : ''}`}
    >
      <DesignerKeyboardSupport />
      {showroom && (
        <Showroom
          key={`showroom:${design.id}`}
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
        <details className="studio-extras">
          <summary>Examples & presentation tools</summary>
          <div className="designer-row">
            {' '}
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
                setWorkspaceStage('Design');
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
                setWorkspaceStage('Design');
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
                setWorkspaceStage('Design');
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
                setWorkspaceStage('Design');
                setMode('render');
                setPresenting(true);
              }}
            >
              Present
            </button>
          </div>
        </details>
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
          <button
            onClick={() => {
              setWorkspaceStage('Present');
              setMode('client');
            }}
          >
            <Printer size={16} /> Drawings & item list
          </button>
          <button className="designer-primary" onClick={save}>
            <Save size={16} /> Save design
          </button>
          <button
            onClick={() => {
              const files =
                document.querySelector<HTMLDetailsElement>('.project-controls');
              openProjectTool('Project files & examples');
              if (files) files.open = true;
              document.getElementById('saved-designs')?.focus();
            }}
          >
            <FolderOpen size={16} /> Open design
          </button>
        </div>
      </header>
      <section className="studio-workflow" aria-label="Kitchen design workflow">
        <nav className="studio-stages" aria-label="Main workflow">
          {(['Room', 'Cabinets', 'Design', 'Quote', 'Present'] as const).map(
            (stage, n) => (
              <button
                key={stage}
                aria-pressed={workspaceStage === stage}
                onClick={() => {
                  setWorkspaceStage(stage);
                  setPresenting(false);
                  setShowroom(false);
                  if (stage === 'Cabinets') {
                    setLibraryCollapsed(false);
                    setLibraryTab('cabinets');
                    setMode('2d');
                    if (window.matchMedia('(max-width: 700px)').matches)
                      requestAnimationFrame(() =>
                        document
                          .querySelector('.designer-library-column')
                          ?.scrollIntoView({ behavior: 'smooth' }),
                      );
                  }
                  if (stage === 'Design' || stage === 'Room') {
                    setMode('2d');
                    setInspectorCollapsed(stage !== 'Room');
                  }
                  if (stage === 'Quote') setMode('quote');
                  if (stage === 'Present') {
                    setMode('client');
                    setLibraryCollapsed(true);
                    setInspectorCollapsed(true);
                  }
                }}
              >
                <span>{n + 1}</span>
                {stage}
              </button>
            ),
          )}
        </nav>
        <p>
          {
            {
              Room: 'Measure the room and place its doors, windows and services.',
              Cabinets:
                'Choose a manufacturer catalog, then find and place the cabinets you need.',
              Design:
                'Arrange the kitchen. Select an item to move, repeat or edit it.',
              Quote:
                'Select a current supplier list and review exact configurations and quantities.',
              Present:
                'Prepare the client presentation and a matching drawing issue.',
            }[workspaceStage]
          }
        </p>
      </section>
      <section
        className="studio-stage-tools"
        hidden={workspaceStage !== 'Room'}
        aria-label="Room stage"
        data-workflow-stage="Room"
      >
        <MeasurementWizard
          expanded
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
      </section>
      <section
        className="studio-stage-tools"
        hidden={workspaceStage !== 'Quote'}
        aria-label="Quote stage"
        data-workflow-stage="Quote"
      >
        <SupplierQuotes
          expanded
          design={design}
          onChange={(next) => commit(() => next)}
        />
      </section>
      <section
        className="studio-stage-tools"
        hidden={workspaceStage !== 'Present'}
        aria-label="Present stage"
        data-workflow-stage="Present"
      >
        <ProfessionalOutput
          key={`output:${design.id}`}
          design={design}
          ownerId={ownerId}
        />
      </section>
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
      <nav className="designer-skip-links" aria-label="Designer shortcuts">
        <a
          href="#project-dashboard"
          onClick={(event) => {
            event.preventDefault();
            openProjectTool('overview');
          }}
        >
          Skip to project overview
        </a>
        <a
          href="#design-workspace"
          onClick={(event) => {
            event.preventDefault();
            openProjectTool('canvas');
          }}
        >
          Skip to design canvas
        </a>
        <a
          href="#designer-inspector"
          onClick={(event) => {
            event.preventDefault();
            setInspectorCollapsed(false);
            setWorkspaceStage('Design');
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
      <DesignerMoreTools
        design={design}
        ownerId={ownerId}
        version={version}
        templateRaw={templateRaw}
        selected={selected}
        setSelected={setSelected}
        openId={openId}
        setOpenId={setOpenId}
        saved={saved}
        past={history?.past ?? []}
        setHistory={setHistory}
        selection={selection}
        setSelection={setSelection}
        setInspectorCollapsed={setInspectorCollapsed}
        setMode={setMode}
        setBefore={setBefore}
        setWorkspaceStage={setWorkspaceStage}
        recordsEpoch={recordsEpoch}
        setRecordsEpoch={setRecordsEpoch}
        setStatus={setStatus}
        commit={commit}
        example={example}
        open={open}
        importFile={importFile}
        walkthroughStep={walkthroughStep}
        file={file}
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
      <div className="designer-grid" hidden={workspaceStage === 'Quote'}>
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
              onClick={() => {
                setLibraryCollapsed((v) => !v);
                if (
                  libraryCollapsed &&
                  window.matchMedia('(max-width: 700px)').matches
                )
                  requestAnimationFrame(() =>
                    document
                      .querySelector('.designer-library-column')
                      ?.scrollIntoView({ behavior: 'smooth' }),
                  );
              }}
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
            <button
              aria-pressed={canvasExpanded}
              onClick={() => setCanvasExpanded((v) => !v)}
              title="Fill the window with the canvas. Press Escape to exit."
            >
              {canvasExpanded ? 'Exit full canvas' : 'Enlarge canvas'}
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
                onClick={() => {
                  setWorkspaceStage('Quote');
                  setMode('quote');
                }}
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
            <details className="canvas-edit-tools">
              <summary>
                Editing tools <span>Arrange, repeat &amp; place items</span>
              </summary>
              {mode === '2d' && (
                <EverydayEditing
                  key={`quick:${design.id}`}
                  design={design}
                  selectedIds={
                    selection.length ? selection : selected ? [selected] : []
                  }
                  onApply={(next) => commit(() => next, true)}
                  onLocate={(id) => {
                    setWorkspaceStage('Design');
                    setSelected(id);
                    setSelection([]);
                  }}
                />
              )}
              {mode === '2d' && (
                <KitchenActions
                  key={design.id}
                  design={design}
                  ids={
                    selection.length ? selection : selected ? [selected] : []
                  }
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
            </details>
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
                if (next.length > MAX_SAVED_DESIGNS) {
                  setStatus('Saved design limit reached. Export a copy first.');
                  return;
                }
                try {
                  void persistSavedDesigns({
                    store: recordStore.current,
                    local: localStorage,
                    ownerId,
                    storageKey,
                    designs: next,
                  });
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
                ownerId={ownerId}
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
                onMoveItem={(id, x, y) => updateItem(id, { x, y })}
                editLocked={renderLocked}
                onEditLockChange={(locked) => {
                  setRenderLocked(locked);
                  try {
                    localStorage.setItem(
                      storageKey + ':render-lock',
                      locked ? '1' : '0',
                    );
                  } catch {
                    // Not remembering the choice is not worth failing over.
                  }
                  setStatus(
                    locked
                      ? 'Items locked in the 3D view. Clicking still selects.'
                      : 'Items editable in the 3D view. Drag, or use arrows, R and Delete.',
                  );
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
                          <Link href={sourceLink(i)}>PDF {i.pageNumber}</Link>
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
        <DesignerInspector
          design={design}
          ownerId={ownerId}
          item={item}
          issues={issues}
          selected={selected}
          setSelected={setSelected}
          selection={selection}
          setSelection={setSelection}
          panel={{ inspectorTab, moveTogether, showClearance }}
          setPanel={setInspectorPanel}
          editor={editorCommands}
          commit={commit}
          updateItem={updateItem}
          rotate={rotate}
        />
      </div>
    </div>
  );
}
