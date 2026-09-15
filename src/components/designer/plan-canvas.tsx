'use client';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, KeyboardEvent } from 'react';
import {
  footprint,
  objectTransform,
  snapPosition,
  updateAssembly,
  resolvedFront,
} from '@/designer/model';
import { roomOutline, roomEdges } from '@/designer/room';
import { ObjectPlan } from './objects';
import type { Cabinet, Design } from '@/designer/model';

type Props = {
  design: Design;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  snap: boolean;
  zoom: number;
  warningIds: Set<string>;
  panMode: boolean;
  moveTogether: boolean;
};
export function PlanCanvas({
  design,
  selected,
  onSelect,
  onMove,
  snap,
  zoom,
  warningIds,
  panMode,
  moveTogether,
}: Props) {
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
      setDrag(null);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
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
  function coordinates(event: PointerEvent) {
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
    onSelect(item.id);
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

    if (!drag) return;
    const item = design.items.find((i) => i.id === drag.id);
    if (!item) return;
    const p = coordinates(event),
      position = snapPosition(item, room, p.x - drag.dx, p.y - drag.dy, snap);
    setDrag({ ...drag, ...position });
  }
  function end() {
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
    if (dir) {
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
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={() => {
          setDrag(null);
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
          x={room.width / 2}
          y={-17}
          textAnchor="middle"
          fontSize="4"
          fill="#243e49"
        >
          {room.width}″ · {(room.width / 12).toFixed(1)} ft
        </text>
        <text
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
          .sort((a, b) => a.elevation - b.elevation)
          .map((original) => {
            const item =
              drag?.id === original.id
                ? { ...original, x: drag.x, y: drag.y }
                : original;
            const b = footprint(item),
              active = selected === item.id,
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
                {active && (
                  <text
                    x={b.width / 2}
                    y={b.depth + 5}
                    textAnchor="middle"
                    fontSize="3"
                    fill="#087984"
                  >
                    {b.width}″ × {b.depth}″
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
      </svg>
    </div>
  );
}
