'use client';
import { useEffect, useRef, useState } from 'react';
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
import { snapPlacement, clearanceZones } from '@/designer/editing';
import type { DropItem } from '@/designer/editing';
import {
  fromObject,
  fromProduct,
  itemPolygon,
  warnings,
} from '@/designer/model';
import { placementAt } from '@/designer/editing';
import { activeDrop, parseDrop } from '@/designer/drop';
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
  } | null>(null);
  const { room } = design,
    padding = 28;
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
    onSelect(item.id);
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
    });
  }
  function startPan(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 && event.button !== 1) return;
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
    const p = coordinates(event),
      position = snapPlacement(
        item,
        design,
        p.x - drag.dx,
        p.y - drag.dy,
        snap,
      );
    setDrag({ ...drag, ...position });
  }
  function end() {
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
      onMove(drag.id, drag.x, drag.y);
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
          {room.width}″ · {(room.width / 12).toFixed(1)} ft
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
          {room.depth}″ · {(room.depth / 12).toFixed(1)} ft
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
            const preview = ghost
              ? { ...design, items: [...design.items, candidate] }
              : !moveTogether
                ? {
                    ...design,
                    items: design.items.map((i) =>
                      i.id === candidate.id ? candidate : i,
                    ),
                  }
                : updateAssembly(design, candidate.id, {
                    x: candidate.x,
                    y: candidate.y,
                  });
            const issues = warnings(preview).filter(
              (i) =>
                i.itemIds.includes(candidate.id) &&
                /^(outside|overlap|ceiling|swing|sink|opening|wall|clearance)-/.test(
                  i.id,
                ),
            );
            const f = footprint(candidate),
              color = issues.length ? '#bf413b' : '#087984';
            return (
              <g pointerEvents="none" data-testid="placement-preview">
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
                {ghost && (
                  <text
                    x={candidate.x}
                    y={candidate.y - 5}
                    fontSize="4"
                    fill={color}
                    stroke="white"
                    strokeWidth="1"
                    paintOrder="stroke"
                  >
                    {candidate.sku} ·{' '}
                    {issues.length ? issues[0]?.message : 'Ready to place'}
                  </text>
                )}
              </g>
            );
          })()}
      </svg>
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
