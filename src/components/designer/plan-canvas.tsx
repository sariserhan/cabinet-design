'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent, KeyboardEvent } from 'react';
import {
  footprint,
  objectTransform,
  snapPosition,
  updateAssembly,
  resolvedFront,
  localToWorld,
} from '@/designer/model';
import { roomOutline, roomEdges } from '@/designer/room';
import { resizeFromPoint } from '@/designer/studio-tools';
import {
  snapPlacement,
  clearanceZones,
  marqueeSelection,
} from '@/designer/editing';
import type { DropItem } from '@/designer/editing';
import { fromObject, fromProduct, itemPolygon } from '@/designer/model';
import { placementAt } from '@/designer/editing';
import { activeDrop, parseDrop } from '@/designer/drop';
import { placementFeedback } from '@/designer/demo-readiness';
import { annotationLabel } from '@/designer/annotations';
import { lengthLabel, unitsOf } from '@/designer/units';
import { itemDimensionText } from '@/designer/dimension-overlay';
import type { DimensionAxes } from '@/designer/dimension-overlay';
import { ObjectPlan } from './objects';
import type { Cabinet, Design } from '@/designer/model';

type Props = {
  onResize: (
    id: string | null,
    width: number,
    depth: number,
    position?: { x: number; y: number },
  ) => void;
  design: Design;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  snap: boolean;
  zoom: number;
  warningIds: Set<string>;
  issueIds: Set<string>;
  panMode: boolean;
  moveTogether: boolean;
  selectedIds: string[];
  onToggle: (id: string) => void;
  /** Result of a band sweep; an empty list clears the selection. */
  onMarquee: (ids: string[], additive: boolean) => void;
  onMoveMany: (ids: string[], dx: number, dy: number) => void;
  /** Sizes drawn on every item, and which of them to draw. */
  dimensions: { on: boolean; axes: DimensionAxes };
  /** Placing a note or a dimension instead of selecting and panning. */
  annotate: 'note' | 'dimension' | null;
  selectedAnnotation: string | null;
  onSelectAnnotation: (id: string | null) => void;
  onMoveAnnotation: (id: string, dx: number, dy: number) => void;
  onAnnotate: (
    from: { x: number; y: number },
    to?: { x: number; y: number },
  ) => void;
  showClearance: boolean;
  onDropItem: (item: DropItem, point: { x: number; y: number }) => void;
};
export function PlanCanvas({
  design,
  selected,
  onSelect,
  onMove,
  snap,
  zoom,
  warningIds,
  issueIds,
  panMode,
  moveTogether,
  selectedIds,
  onToggle,
  onMarquee,
  onMoveMany,
  dimensions,
  annotate,
  onAnnotate,
  selectedAnnotation,
  onSelectAnnotation,
  onMoveAnnotation,
  showClearance,
  onDropItem,
  onResize,
}: Props) {
  const [resize, setResize] = useState<{
    item: Cabinet;
    patch: ReturnType<typeof resizeFromPoint>;
  } | null>(null);
  const [dimension, setDimension] = useState<{
    id: string | null;
    width: number;
    depth: number;
  } | null>(null);
  function editDimension(id: string | null) {
    const item = design.items.find((i) => i.id === id);
    if (item?.locked) {
      setDropError('Unlock this object before resizing it.');
      return;
    }
    if (item?.kind === 'cabinet') {
      setDropError(
        'Catalog dimensions are fixed. Choose a custom cabinet to resize it.',
      );
      return;
    }
    setDimension({
      id,
      width: item?.width ?? design.room.width,
      depth: item?.depth ?? design.room.depth,
    });
  }
  const [ghost, setGhost] = useState<Cabinet | null>(null);
  const [dropError, setDropError] = useState('');
  const svg = useRef<SVGSVGElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [space, setSpace] = useState(false);
  const panning = useRef<{
    clientX: number;
    clientY: number;
    x: number;
    y: number;
    matrix: DOMMatrix;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  useEffect(() => {
    const down = (e: globalThis.KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        !(
          e.target instanceof HTMLElement &&
          e.target.closest('input,textarea,select,[contenteditable=true]')
        )
      ) {
        if (!(e.target instanceof HTMLElement && e.target.closest('button')))
          e.preventDefault();
        setSpace(true);
      }
    };
    const up = (e: globalThis.KeyboardEvent) => {
      if (e.code === 'Space') setSpace(false);
    };
    const blur = () => {
      setSpace(false);
      panning.current = null;
      setIsPanning(false);
      setResize(null);
      setDrag(null);
      setGhost(null);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    const dragEnd = () => {
      setGhost(null);
      setDropError('');
    };
    window.addEventListener('dragend', dragEnd);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('dragend', dragEnd);
    };
  }, []);
  const [drag, setDrag] = useState<{
    id: string;
    dx: number;
    dy: number;
    x: number;
    y: number;
    // Where the grabbed item started, so a group drag can apply the same
    // shift to everything else in the selection.
    ox: number;
    oy: number;
    group: string[];
  } | null>(null);
  // A placed annotation being moved, and where it started.
  const [noteDrag, setNoteDrag] = useState<{
    id: string;
    dx: number;
    dy: number;
    x: number;
    y: number;
  } | null>(null);
  // A dimension being dragged out, in plan inches.
  const [measure, setMeasure] = useState<{
    x0: number;
    y0: number;
    x: number;
    y: number;
  } | null>(null);
  // A rubber-band selection in progress, in plan inches.
  const [band, setBand] = useState<{
    x0: number;
    y0: number;
    x: number;
    y: number;
    additive: boolean;
  } | null>(null);
  const { room } = design,
    padding = 28,
    units = unitsOf(design),
    size = (value: number) => lengthLabel(value, units);
  // Items stack: a cabinet, the countertop over it, a wall cabinet above.
  // All three labels land on one point unless they are moved apart, so
  // each one that would collide drops below the last.
  const labelOffsets = useMemo(() => {
    const taken: { x: number; y: number }[] = [];
    const offsets = new Map<string, number>();
    for (const item of design.items) {
      if (item.hidden) continue;
      const f = footprint(item),
        x = item.x + f.width / 2,
        y = item.y + f.depth / 2;
      // A wall cabinet and the base below it are only six inches apart in
      // plan, which is closer than two lines of text, so the spacing is
      // set by the text rather than by the geometry.
      let offset = 0;
      while (
        offset < 36 &&
        taken.some(
          (t) => Math.abs(t.x - x) < 16 && Math.abs(t.y - (y + offset)) < 7,
        )
      )
        offset += 7;
      taken.push({ x, y: y + offset });
      offsets.set(item.id, offset);
    }
    return offsets;
  }, [design.items]);
  function coordinates(event: { clientX: number; clientY: number }) {
    const root = svg.current,
      matrix = root?.getScreenCTM();
    if (!root || !matrix) return { x: 0, y: 0 };
    const point = root.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(matrix.inverse());
  }
  function start(event: PointerEvent<SVGGElement>, item: Cabinet) {
    if (event.button !== 0 || panMode || space) return;
    event.stopPropagation();
    if (event.shiftKey) {
      event.preventDefault();
      onToggle(item.id);
      return;
    }
    // Grabbing an item that is part of a multi-selection drags the whole
    // selection, so a run of cabinets can be moved without regrouping it.
    // Grabbing anything else selects it, which drops the old selection.
    const group =
      selectedIds.length > 1 && selectedIds.includes(item.id)
        ? selectedIds
        : [];
    if (!group.length) onSelect(item.id);
    if (item.locked) return;
    event.currentTarget.focus();
    const p = coordinates(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id: item.id,
      dx: p.x - item.x,
      dy: p.y - item.y,
      x: item.x,
      y: item.y,
      ox: item.x,
      oy: item.y,
      group,
    });
  }
  function startPan(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    // While a note or dimension tool is chosen, the canvas places one
    // instead of panning: a note where it is clicked, a dimension between
    // where the pointer goes down and where it comes up.
    if (annotate && event.button === 0) {
      const p = coordinates(event);
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      if (annotate === 'note') onAnnotate(p);
      else setMeasure({ x0: p.x, y0: p.y, x: p.x, y: p.y });
      return;
    }
    // Shift and drag across empty floor sweeps up everything the band
    // touches. Plain dragging still pans, which is what the canvas has
    // always done and what the footer tells people.
    if (event.shiftKey && !panMode && !space && event.button === 0) {
      const p = coordinates(event);
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setBand({ x0: p.x, y0: p.y, x: p.x, y: p.y, additive: true });
      return;
    }
    const matrix = svg.current?.getScreenCTM()?.inverse();
    if (!matrix) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panning.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      x: pan.x,
      y: pan.y,
      matrix,
    };
    setIsPanning(true);
  }
  function move(event: PointerEvent) {
    if (noteDrag) {
      const p = coordinates(event);
      setNoteDrag({ ...noteDrag, x: p.x - noteDrag.dx, y: p.y - noteDrag.dy });
      return;
    }
    if (measure) {
      const p = coordinates(event);
      setMeasure({ ...measure, x: p.x, y: p.y });
      return;
    }
    if (band) {
      const p = coordinates(event);
      setBand({ ...band, x: p.x, y: p.y });
      return;
    }
    const camera = panning.current;
    if (camera) {
      const dx = event.clientX - camera.clientX,
        dy = event.clientY - camera.clientY;
      setPan({
        x: camera.x - dx * camera.matrix.a - dy * camera.matrix.c,
        y: camera.y - dx * camera.matrix.b - dy * camera.matrix.d,
      });
      return;
    }

    if (resize) {
      const point = coordinates(event);
      setResize({
        ...resize,
        patch: resizeFromPoint(resize.item, point.x, point.y),
      });
      return;
    }
    if (!drag) return;
    const item = design.items.find((i) => i.id === drag.id);
    if (!item) return;
    // Items travelling with the grab keep their distance from it, so they are
    // not snapping targets - only the ones staying put are.
    const against = drag.group.length
      ? {
          ...design,
          items: design.items.filter((i) => !drag.group.includes(i.id)),
        }
      : design;
    const p = coordinates(event),
      position = snapPlacement(
        item,
        against,
        p.x - drag.dx,
        p.y - drag.dy,
        snap,
      );
    setDrag({ ...drag, ...position });
  }
  function end(event?: PointerEvent) {
    if (noteDrag) {
      const moved = noteDrag;
      setNoteDrag(null);
      const origin = (design.annotations ?? []).find((a) => a.id === moved.id);
      if (origin && (origin.x !== moved.x || origin.y !== moved.y))
        onMoveAnnotation(moved.id, moved.x - origin.x, moved.y - origin.y);
      return;
    }
    if (measure) {
      const from = { x: measure.x0, y: measure.y0 },
        to = { x: measure.x, y: measure.y };
      setMeasure(null);
      // A click rather than a drag leaves nothing to measure.
      if (Math.hypot(to.x - from.x, to.y - from.y) > 1) onAnnotate(from, to);
      return;
    }
    // A press on empty floor that never became a pan is a click on nothing,
    // which clears the selection. Without this there is no way to leave a
    // multi-selection except by picking another item.
    const camera = panning.current;
    if (
      camera &&
      event &&
      Math.hypot(
        event.clientX - camera.clientX,
        event.clientY - camera.clientY,
      ) <= 3
    ) {
      onSelect(null);
      onMarquee([], false);
    }
    if (band) {
      const rect = {
        x: Math.min(band.x0, band.x),
        y: Math.min(band.y0, band.y),
        width: Math.abs(band.x - band.x0),
        depth: Math.abs(band.y - band.y0),
      };
      setBand(null);
      // A shift-click that never moved is a toggle, not an empty band; it is
      // handled on the item itself, so nothing to do when the band is a dot.
      if (rect.width > 0.5 || rect.depth > 0.5)
        onMarquee(marqueeSelection(design, rect), band.additive);
      return;
    }
    if (resize) {
      onResize(resize.item.id, resize.patch.width, resize.patch.depth, {
        x: resize.patch.x,
        y: resize.patch.y,
      });
      setResize(null);
    }
    panning.current = null;
    setIsPanning(false);
    if (drag) {
      const moved = drag.x !== drag.ox || drag.y !== drag.oy;
      if (drag.group.length && moved)
        onMoveMany(drag.group, drag.x - drag.ox, drag.y - drag.oy);
      else if (drag.group.length) {
        // Pressing a member of a group without dragging it is a plain click:
        // it picks that one item, the only way back to a single selection
        // without first clicking empty floor.
        onMarquee([], false);
        onSelect(drag.id);
      } else onMove(drag.id, drag.x, drag.y);
      setDrag(null);
    }
  }
  function key(event: KeyboardEvent, item: Cabinet) {
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const dir = directions[event.key];
    if (dir && !item.locked) {
      event.preventDefault();
      const step = event.shiftKey ? 6 : 1;
      // Arrow keys reach the focused item before the whole-design shortcut
      // does, so the group case has to be handled here too - otherwise
      // nudging a multi-selection from the plan would move one item out of
      // the run it belongs to.
      if (selectedIds.length > 1 && selectedIds.includes(item.id)) {
        onMoveMany(selectedIds, dir[0] * step, dir[1] * step);
        return;
      }
      const p = snapPosition(
        item,
        room,
        item.x + dir[0] * step,
        item.y + dir[1] * step,
        false,
      );
      onMove(item.id, p.x, p.y);
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(item.id);
    }
  }
  const moving =
    ghost ?? (drag ? design.items.find((i) => i.id === drag.id) : undefined);
  const liveFeedback = moving
    ? placementFeedback(
        design,
        ghost ?? { ...moving, x: drag?.x ?? moving.x, y: drag?.y ?? moving.y },
        !!ghost,
        moveTogether,
      )
    : null;
  return (
    <div
      className={`plan-scroll ${panMode || space ? 'pan-tool' : ''} ${isPanning ? 'is-panning' : ''}`}
    >
      <svg
        ref={svg}
        className="plan-svg"
        role="img"
        aria-label="Interactive kitchen floor plan"
        viewBox={`${room.width / 2 - (room.width + padding * 2) / zoom / 2 + pan.x} ${room.depth / 2 - (room.depth + padding * 2) / zoom / 2 + pan.y} ${(room.width + padding * 2) / zoom} ${(room.depth + padding * 2) / zoom}`}
        style={{ width: '100%', minHeight: 0, touchAction: 'none' }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-kitchen-item')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            const payload =
              activeDrop() ??
              parseDrop(e.dataTransfer.getData('application/x-kitchen-item'));
            if (payload) {
              const candidate =
                payload.kind === 'object'
                  ? fromObject(payload.object, payload.option)
                  : fromProduct(payload.product, payload.versionId);
              const placed = placementAt(
                candidate,
                design,
                coordinates(e),
                snap,
              );
              setGhost(placed);
              setDropError(
                placed ? '' : 'A straight wall is required for this opening.',
              );
            }
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setGhost(null);
            setDropError('');
          }
        }}
        onDrop={(e) => {
          setGhost(null);
          setDropError('');
          e.preventDefault();
          const item = parseDrop(
            e.dataTransfer.getData('application/x-kitchen-item'),
          );
          if (item) onDropItem(item, coordinates(e));
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={() => {
          setDrag(null);
          setResize(null);
          setBand(null);
          setMeasure(null);
          setNoteDrag(null);
          panning.current = null;
          setIsPanning(false);
        }}
        onPointerDown={startPan}
      >
        <defs>
          <pattern
            id="room-grid"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 6 0 L 0 0 0 6"
              fill="none"
              stroke="#dce6e9"
              strokeWidth=".25"
            />
          </pattern>
        </defs>
        <rect
          x={-padding}
          y={-padding}
          width={room.width + padding * 2}
          height={room.depth + padding * 2}
          fill="#f2f7fa"
        />
        <polygon
          points={roomOutline(room)
            .map((p) => `${p.x},${p.y}`)
            .join(' ')}
          fill="url(#room-grid)"
          stroke="#c6d0d4"
          strokeWidth=".4"
        />
        {showClearance &&
          design.items
            .filter((i) => !selected || i.id === selected)
            .flatMap((item) =>
              clearanceZones(item).map((zone) => (
                <polygon
                  key={`${item.id}:${zone.name}`}
                  className="clearance-zone"
                  data-item-id={item.id}
                  points={zone.points.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill={
                    issueIds.has(`clearance-${item.id}-${zone.name}`)
                      ? '#ed987c'
                      : '#60b4c6'
                  }
                  fillOpacity=".25"
                  stroke={
                    issueIds.has(`clearance-${item.id}-${zone.name}`)
                      ? '#c45132'
                      : '#308396'
                  }
                  strokeDasharray="2 1"
                  strokeWidth=".5"
                  pointerEvents="none"
                >
                  <title>
                    {item.sku}: {zone.name} clearance
                  </title>
                </polygon>
              )),
            )}
        {roomEdges(room)
          .filter((edge) => room.walls[edge.side])
          .map((edge) => (
            <g key={edge.index}>
              <polyline
                points={edge.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="#667780"
                strokeWidth="3"
              />
              <text
                x={(edge.a.x + edge.b.x) / 2 + 3}
                y={(edge.a.y + edge.b.y) / 2 - 4}
                fontSize="3"
                fill="#586e7b"
              >
                {edge.index + 1}
              </text>
            </g>
          ))}
        <g stroke="#63757d" strokeWidth=".35">
          <path d={`M0 -8 V-17 M${room.width} -8 V-17 M0 -13 H${room.width}`} />
          <path d={`M-8 0 H-17 M-8 ${room.depth} H-17 M-13 0 V${room.depth}`} />
        </g>
        <text
          role="button"
          tabIndex={0}
          aria-label="Edit room width"
          className="editable-dimension"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => editDimension(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              editDimension(null);
            }
          }}
          x={room.width / 2}
          y={-17}
          textAnchor="middle"
          fontSize="4"
          fill="#243e49"
        >
          {units === 'mm'
            ? size(room.width)
            : `${room.width}″ · ${(room.width / 12).toFixed(1)} ft`}
        </text>
        <text
          role="button"
          tabIndex={0}
          aria-label="Edit room depth"
          className="editable-dimension"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => editDimension(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              editDimension(null);
            }
          }}
          transform={`translate(-18 ${room.depth / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="4"
          fill="#243e49"
        >
          {units === 'mm'
            ? size(room.depth)
            : `${room.depth}″ · ${(room.depth / 12).toFixed(1)} ft`}
        </text>
        {[
          ...(drag && moveTogether
            ? updateAssembly(design, drag.id, { x: drag.x, y: drag.y }).items
            : design.items),
        ]
          .filter((i) => !i.hidden)
          .sort(
            (a, b) =>
              Number(a.id === selected) - Number(b.id === selected) ||
              a.elevation - b.elevation,
          )
          .map((original) => {
            const item =
              resize?.item.id === original.id
                ? { ...original, ...resize.patch }
                : drag?.id === original.id
                  ? { ...original, x: drag.x, y: drag.y }
                  : drag?.group.includes(original.id)
                    ? {
                        ...original,
                        x: original.x + drag.x - drag.ox,
                        y: original.y + drag.y - drag.oy,
                      }
                    : original;
            const b = footprint(item),
              active = selected === item.id || selectedIds.includes(item.id),
              warning = warningIds.has(item.id);
            return (
              <g
                key={item.id}
                transform={`translate(${item.x} ${item.y})`}
                role="button"
                tabIndex={0}
                aria-label={`${item.sku} placed ${item.kind === 'cabinet' ? 'cabinet' : 'object'}`}
                aria-pressed={active}
                className="plan-cabinet"
                onPointerDown={(e) => start(e, item)}
                onKeyDown={(e) => key(e, item)}
                onFocus={() => onSelect(item.id)}
              >
                {item.kind !== 'cabinet' && (
                  <rect
                    x={-4}
                    y={-4}
                    width={b.width + 8}
                    height={b.depth + 8}
                    fill="transparent"
                  />
                )}
                {item.kind !== 'cabinet' ? (
                  <ObjectPlan
                    item={item}
                    active={active}
                    items={design.items}
                  />
                ) : (
                  <g transform={objectTransform(item)}>
                    <rect
                      width={item.width}
                      height={item.depth}
                      fill={active ? '#c7e6e7' : '#e9dbc3'}
                      fillOpacity={item.elevation > 0 ? 0.82 : 1}
                      stroke={warning ? '#c4553e' : '#8d7b60'}
                      strokeWidth={active ? 0.9 : 0.4}
                    />
                    <rect
                      x={1.5}
                      y={1.5}
                      width={Math.max(0, item.width - 3)}
                      height={Math.max(0, item.depth - 3)}
                      fill="none"
                      stroke="#b6a991"
                      strokeWidth=".3"
                    />
                    <line
                      x1={0}
                      y1={item.depth}
                      x2={item.width}
                      y2={item.depth}
                      stroke="#75674f"
                      strokeWidth="1"
                    />
                    {resolvedFront(item) === 'double' && (
                      <line
                        x1={item.width / 2}
                        y1={1.5}
                        x2={item.width / 2}
                        y2={item.depth - 1.5}
                        stroke="#a99b85"
                        strokeWidth=".3"
                      />
                    )}
                    <circle
                      className="cabinet-front-handle"
                      cx={item.width * (item.mirrored ? 0.2 : 0.8)}
                      cy={item.depth}
                      r="1"
                      fill="#4d5c64"
                    />
                  </g>
                )}
                {item.note && (
                  <g aria-label={`Note: ${item.note}`}>
                    <circle cx={3} cy={3} r={2.3} fill="#dc963f" />
                    <text
                      x={3}
                      y={4}
                      textAnchor="middle"
                      fontSize="3"
                      fill="white"
                    >
                      !
                    </text>
                    <title>{item.note}</title>
                  </g>
                )}
                {active &&
                  !item.locked &&
                  ['custom_cabinet', 'countertop', 'island'].includes(
                    item.kind,
                  ) &&
                  (() => {
                    const point = localToWorld(item, item.width, item.depth);
                    return (
                      <rect
                        role="button"
                        tabIndex={0}
                        aria-label="Resize selected object"
                        x={point.x - item.x - 2.5}
                        y={point.y - item.y - 2.5}
                        width={5}
                        height={5}
                        fill="#087984"
                        stroke="white"
                        strokeWidth=".8"
                        style={{ cursor: 'nwse-resize' }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.currentTarget.setPointerCapture(e.pointerId);
                          setResize({
                            item,
                            patch: {
                              width: item.width,
                              depth: item.depth,
                              x: item.x,
                              y: item.y,
                            },
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.stopPropagation();
                            editDimension(item.id);
                          }
                        }}
                      />
                    );
                  })()}
                {dimensions.on && !active && (
                  <text
                    data-testid="item-dimensions"
                    pointerEvents="none"
                    x={b.width / 2}
                    y={b.depth / 2 + 1.2 + (labelOffsets.get(item.id) ?? 0)}
                    textAnchor="middle"
                    fontSize="3"
                    fill="#41545e"
                    stroke="white"
                    strokeWidth="0.8"
                    paintOrder="stroke"
                  >
                    {itemDimensionText(item, dimensions.axes, units)}
                  </text>
                )}
                {active && (
                  <text
                    role="button"
                    tabIndex={0}
                    aria-label="Edit selected object dimensions"
                    className="editable-dimension"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      editDimension(item.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        editDimension(item.id);
                      }
                    }}
                    x={b.width / 2}
                    y={b.depth + 5}
                    textAnchor="middle"
                    fontSize="3"
                    fill="#087984"
                  >
                    W {item.width}″ · D {item.depth}″
                  </text>
                )}
              </g>
            );
          })}
        {!design.items.length && (
          <text
            x={room.width / 2}
            y={room.depth / 2}
            textAnchor="middle"
            fill="#71828c"
            fontSize="4"
          >
            Add a cabinet from the library to begin
          </text>
        )}
        {(design.annotations ?? []).map((original) => {
          // While one is being dragged it follows the pointer; the design
          // only hears about it when the drag ends.
          const a =
            noteDrag?.id === original.id
              ? {
                  ...original,
                  x: noteDrag.x,
                  y: noteDrag.y,
                  ...(original.x2 !== undefined && original.y2 !== undefined
                    ? {
                        x2: original.x2 + noteDrag.x - original.x,
                        y2: original.y2 + noteDrag.y - original.y,
                      }
                    : {}),
                }
              : original;
          const label = annotationLabel(a, units),
            chosen = selectedAnnotation === a.id;
          // Grabbing one both selects it and starts moving it, the same as
          // an item: nobody should have to find a list to delete a note.
          // Arrow keys reach whatever is focused inside the plan before the
          // whole-design shortcut sees them, so a focused annotation has to
          // handle its own nudge exactly as a focused item does.
          const key = (event: KeyboardEvent<SVGGElement>) => {
            const directions: Record<string, [number, number]> = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            };
            const direction = directions[event.key];
            if (direction) {
              event.preventDefault();
              const distance = event.shiftKey ? 6 : 1;
              onSelectAnnotation(a.id);
              onMoveAnnotation(
                a.id,
                direction[0] * distance,
                direction[1] * distance,
              );
            }
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelectAnnotation(a.id);
            }
          };
          const grab = (event: PointerEvent<SVGGElement>) => {
            if (event.button !== 0 || panMode || space || annotate) return;
            event.stopPropagation();
            const p = coordinates(event);
            event.currentTarget.setPointerCapture(event.pointerId);
            onSelectAnnotation(a.id);
            setNoteDrag({
              id: a.id,
              dx: p.x - a.x,
              dy: p.y - a.y,
              x: a.x,
              y: a.y,
            });
          };
          if (a.kind === 'note')
            return (
              <g
                key={a.id}
                className="plan-annotation"
                data-testid="plan-note"
                role="button"
                tabIndex={0}
                aria-label={`Note: ${label || 'empty'}`}
                aria-pressed={chosen}
                onPointerDown={grab}
                onKeyDown={key}
              >
                <circle
                  cx={a.x}
                  cy={a.y}
                  r={chosen ? 2.6 : 1.8}
                  fill="#a8621b"
                  stroke={chosen ? '#087984' : 'none'}
                  strokeWidth={chosen ? 0.8 : 0}
                />
                <text
                  x={a.x + 3}
                  y={a.y + 1.2}
                  fontSize="3.4"
                  fill="#7a4713"
                  stroke="white"
                  strokeWidth="0.9"
                  paintOrder="stroke"
                >
                  {label || 'Note'}
                </text>
              </g>
            );
          const x2 = a.x2 ?? a.x,
            y2 = a.y2 ?? a.y,
            midX = (a.x + x2) / 2,
            midY = (a.y + y2) / 2;
          // Ticks square to the run, so the ends read as ends.
          const length = Math.hypot(x2 - a.x, y2 - a.y) || 1,
            tickX = ((y2 - a.y) / length) * 2,
            tickY = (-(x2 - a.x) / length) * 2;
          return (
            <g
              key={a.id}
              className="plan-annotation"
              data-testid="plan-dimension"
              role="button"
              tabIndex={0}
              aria-label={`Dimension: ${label}`}
              aria-pressed={chosen}
              onPointerDown={grab}
              onKeyDown={key}
            >
              {/* A hair line is hard to hit, so there is a wider invisible
                  one over it to grab and click. */}
              <path
                d={`M${a.x} ${a.y} L${x2} ${y2}`}
                fill="none"
                stroke="transparent"
                strokeWidth="4"
              />
              <path
                d={`M${a.x} ${a.y} L${x2} ${y2} M${a.x - tickX} ${a.y - tickY} L${a.x + tickX} ${a.y + tickY} M${x2 - tickX} ${y2 - tickY} L${x2 + tickX} ${y2 + tickY}`}
                fill="none"
                stroke={chosen ? '#087984' : '#7a4713'}
                strokeWidth={chosen ? 0.9 : 0.5}
              />
              <text
                x={midX}
                y={midY - 2}
                textAnchor="middle"
                fontSize="3.4"
                fill="#7a4713"
                stroke="white"
                strokeWidth="0.9"
                paintOrder="stroke"
              >
                {label}
              </text>
            </g>
          );
        })}
        {measure && (
          <g pointerEvents="none">
            <path
              d={`M${measure.x0} ${measure.y0} L${measure.x} ${measure.y}`}
              fill="none"
              stroke="#a8621b"
              strokeWidth=".5"
              strokeDasharray="2 1.5"
            />
            <text
              x={(measure.x0 + measure.x) / 2}
              y={(measure.y0 + measure.y) / 2 - 2}
              textAnchor="middle"
              fontSize="3.4"
              fill="#7a4713"
              stroke="white"
              strokeWidth="0.9"
              paintOrder="stroke"
            >
              {size(Math.hypot(measure.x - measure.x0, measure.y - measure.y0))}
            </text>
          </g>
        )}
        {band && (
          <rect
            data-testid="selection-band"
            pointerEvents="none"
            x={Math.min(band.x0, band.x)}
            y={Math.min(band.y0, band.y)}
            width={Math.abs(band.x - band.x0)}
            height={Math.abs(band.y - band.y0)}
            fill="#087984"
            fillOpacity=".08"
            stroke="#087984"
            strokeWidth=".5"
            strokeDasharray="2 1.5"
          />
        )}
        {drag &&
          (() => {
            const item = design.items.find((i) => i.id === drag.id);
            if (!item) return null;
            const f = footprint(item);
            return (
              <g pointerEvents="none">
                <path
                  d={`M${drag.x} ${drag.y - 5} h${f.width} M${drag.x + f.width + 5} ${drag.y} v${f.depth}`}
                  fill="none"
                  stroke="#087984"
                  strokeWidth=".6"
                />
                <text
                  data-testid="live-dimensions"
                  x={drag.x}
                  y={drag.y - 8}
                  fontSize="4"
                  fill="#075f68"
                  stroke="white"
                  strokeWidth="1"
                  paintOrder="stroke"
                >
                  {item.width} W × {item.depth} D · X {drag.x.toFixed(1)} / Y{' '}
                  {drag.y.toFixed(1)}″
                </text>
              </g>
            );
          })()}
        {(ghost || drag) &&
          (() => {
            const base = ghost ?? design.items.find((i) => i.id === drag?.id);
            if (!base) return null;
            const candidate = ghost ?? {
              ...base,
              x: drag?.x ?? base.x,
              y: drag?.y ?? base.y,
            };
            const f = footprint(candidate),
              color =
                liveFeedback?.state === 'blocked'
                  ? '#bf413b'
                  : liveFeedback?.state === 'review'
                    ? '#a76b12'
                    : '#087984';
            return (
              <g
                pointerEvents="none"
                data-testid="placement-preview"
                data-state={liveFeedback?.state}
              >
                <path
                  d={`M0 ${candidate.y} H${room.width} M${candidate.x} 0 V${room.depth} M0 ${candidate.y + f.depth} H${room.width} M${candidate.x + f.width} 0 V${room.depth}`}
                  stroke="#168b95"
                  strokeWidth=".4"
                  strokeDasharray="2 2"
                  fill="none"
                />
                <polygon
                  points={itemPolygon(candidate)
                    .map((p) => p.x + ',' + p.y)
                    .join(' ')}
                  fill={ghost ? color : 'none'}
                  fillOpacity=".25"
                  stroke={color}
                  strokeWidth="1"
                />
                {(ghost || drag) && (
                  <text
                    x={candidate.x}
                    y={candidate.y - 5}
                    fontSize="4"
                    fill={color}
                    stroke="white"
                    strokeWidth="1"
                    paintOrder="stroke"
                  >
                    {candidate.sku} · {liveFeedback?.message.slice(0, 90)}
                  </text>
                )}
              </g>
            );
          })()}
      </svg>
      {liveFeedback && (
        <p
          className={`placement-feedback ${liveFeedback.state}`}
          role="status"
          aria-label="Placement feedback"
        >
          {liveFeedback.message}
        </p>
      )}
      {dimension && (
        <div
          className="dimension-editor"
          role="dialog"
          aria-label="Edit plan dimensions"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onResize(dimension.id, dimension.width, dimension.depth);
              setDimension(null);
            }}
          >
            <strong>
              {dimension.id ? 'Object dimensions' : 'Room dimensions'} (in)
            </strong>
            <p>
              {dimension.id
                ? 'Edits this object; linked parts keep their existing sizes.'
                : 'Existing objects keep their positions. Review layout checks after resizing.'}
            </p>
            {(['width', 'depth'] as const).map((axis) => (
              <label key={axis}>
                {axis}
                <input
                  autoFocus={axis === 'width'}
                  aria-label={`Plan ${axis}`}
                  type="number"
                  required
                  min={dimension.id ? 0.25 : 48}
                  max={dimension.id ? 600 : 600}
                  step="0.25"
                  value={dimension[axis]}
                  onChange={(e) =>
                    setDimension({
                      ...dimension,
                      [axis]: Number(e.target.value),
                    })
                  }
                />
              </label>
            ))}
            <button type="submit">Apply dimensions</button>
            <button type="button" onClick={() => setDimension(null)}>
              Cancel dimensions
            </button>
          </form>
        </div>
      )}
      {dropError && <p role="status">{dropError}</p>}
    </div>
  );
}
