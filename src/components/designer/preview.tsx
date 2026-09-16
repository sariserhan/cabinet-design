'use client';
import { ceilingAt } from '@/designer/room';
import {
  localToWorld,
  partitionPanels,
  wallPanels as buildWallPanels,
} from '@/designer/model';
import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { RotateCcw, RotateCw, Hand, Plus, Minus, Maximize } from 'lucide-react';
import {
  resolvedFront,
  isUpperCabinet,
  finishes,
  cutPanels,
  sinkHoles,
} from '@/designer/model';
import { roomOutline, wallSegments } from '@/designer/room';
import type { Cabinet, Design } from '@/designer/model';
import { footprint } from '@/designer/model';
import { itemDimensionText } from '@/designer/dimension-overlay';
import type { DimensionAxes } from '@/designer/dimension-overlay';
type Vec = [number, number, number];
export function Preview({
  design,
  selected,
  onSelect,
  dimensions,
}: {
  design: Design;
  selected: string | null;
  onSelect: (id: string) => void;
  dimensions?: { on: boolean; axes: DimensionAxes };
}) {
  const [angle, setAngle] = useState(0);
  const [panMode, setPanMode] = useState(false),
    [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const gesture = useRef<{
    x: number;
    y: number;
    angle: number;
    pan: { x: number; y: number };
    matrix: DOMMatrix;
    cabinetId: string | null;
  } | null>(null);
  const moved = useRef(false);
  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    const matrix = event.currentTarget.getScreenCTM()?.inverse();
    if (!matrix) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    moved.current = false;
    gesture.current = {
      x: event.clientX,
      y: event.clientY,
      angle,
      pan,
      matrix,
      cabinetId:
        event.target instanceof Element
          ? (event.target
              .closest('[data-cabinet]')
              ?.getAttribute('data-cabinet') ?? null)
          : null,
    };
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const initial = gesture.current;
    if (!initial) return;
    const dx = event.clientX - initial.x,
      dy = event.clientY - initial.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
    if (panMode)
      setPan({
        x: initial.pan.x - dx * initial.matrix.a - dy * initial.matrix.c,
        y: initial.pan.y - dx * initial.matrix.b - dy * initial.matrix.d,
      });
    else setAngle((((initial.angle + dx * 0.5) % 360) + 360) % 360);
  }

  const { room } = design,
    rad = (angle * Math.PI) / 180;
  function rotated([x, y, z]: Vec): Vec {
    const dx = x - room.width / 2,
      dy = y - room.depth / 2;
    return [
      dx * Math.cos(rad) - dy * Math.sin(rad),
      dx * Math.sin(rad) + dy * Math.cos(rad),
      z,
    ];
  }
  function point(v: Vec): [number, number] {
    const [x, y, z] = rotated(v);
    return [(x - y) * 0.8, (x + y) * 0.4 - z * 0.9];
  }
  function points(v: Vec[]) {
    return v.map((p) => point(p).join(',')).join(' ');
  }
  function depth(v: Vec[]) {
    return (
      v.reduce((sum, p) => {
        const r = rotated(p);
        return sum + r[0] + r[1];
      }, 0) / v.length
    );
  }
  const corners: Vec[] = roomOutline(room).map((p) => [p.x, p.y, 0]);
  const all = corners
    .concat(corners.map(([x, y]) => [x, y, ceilingAt(room, x, y)] as Vec))
    .map(point);
  const xs = all.map((p) => p[0]),
    ys = all.map((p) => p[1]);
  const left = Math.min(...xs) - 20,
    top = Math.min(...ys) - 10,
    w = Math.max(...xs) - left + 20,
    h = Math.max(...ys) - top + 20;
  const walls = wallSegments(room)
    .filter((edge) => {
      const normalX = -(edge.b.y - edge.a.y),
        normalY = edge.b.x - edge.a.x;
      const facing =
        normalX * Math.cos(rad) -
        normalY * Math.sin(rad) +
        (normalX * Math.sin(rad) + normalY * Math.cos(rad));
      return room.walls[edge.side] && facing > 0;
    })
    .map((edge) => ({
      ...edge,
      key: edge.segment,
      vertices: [
        [edge.a.x, edge.a.y, 0],
        [edge.b.x, edge.b.y, 0],
        [edge.b.x, edge.b.y, ceilingAt(room, edge.b.x, edge.b.y)],
        [edge.a.x, edge.a.y, ceilingAt(room, edge.a.x, edge.a.y)],
      ] as Vec[],
    }));
  function cabinetPoints(item: Cabinet) {
    function local(x: number, y: number, z: number): Vec {
      const p = localToWorld(item, x, y);
      return [p.x, p.y, item.elevation + z];
    }
    return {
      local,
      v: [
        local(0, 0, 0),
        local(item.width, 0, 0),
        local(item.width, item.depth, 0),
        local(0, item.depth, 0),
        local(0, 0, item.height),
        local(item.width, 0, item.height),
        local(item.width, item.depth, item.height),
        local(0, item.depth, item.height),
      ],
    };
  }

  const faces = design.items
    .filter((i) => !i.hidden)
    .flatMap((item) => {
      const palette = finishes[item.finish ?? design.finish];
      const { v, local } = cabinetPoints(item);
      const wood =
        item.kind === 'cabinet' ||
        item.kind === 'custom_cabinet' ||
        item.kind === 'island' ||
        item.kind === 'door';
      const side = wood ? palette.side : '#a5b3bc',
        front =
          item.kind === 'window' ? '#a6d6e5' : wood ? palette.front : '#d6dfe3';
      type Decoration = { vertices: Vec[]; fill: string };
      const frontDetails: Decoration[] = [];
      const frontRect = (
        x: number,
        z: number,
        w: number,
        h: number,
        fill: string,
        plane = item.depth + 0.1,
      ) => ({
        vertices: [
          local(x, plane, z),
          local(x + w, plane, z),
          local(x + w, plane, z + h),
          local(x, plane, z + h),
        ],
        fill,
      });
      if (item.kind === 'cabinet') {
        const style = resolvedFront(item);
        if (style === 'drawers')
          for (let row = 0; row < 3; row++)
            frontDetails.push(
              frontRect(
                2,
                2 + (row * (item.height - 4)) / 3,
                item.width - 4,
                (item.height - 4) / 3 - 1,
                palette.front,
              ),
            );
        if (style === 'double')
          frontDetails.push(
            frontRect(
              item.width / 2 - 0.3,
              2,
              0.6,
              item.height - 4,
              palette.side,
            ),
          );
        if (style === 'glass')
          frontDetails.push(
            frontRect(3, 4, item.width - 6, item.height - 8, '#a7c4cb'),
          );
        if (item.category === 'oven_cabinet')
          frontDetails.push(
            frontRect(
              3,
              item.height * 0.3,
              item.width - 6,
              item.height * 0.4,
              '#506471',
            ),
          );
      }
      if (item.kind === 'washing_machine') {
        frontDetails.push(
          frontRect(2, item.height - 7, item.width - 4, 5, '#f2f5f6'),
        );
        frontDetails.push({
          vertices: Array.from({ length: 32 }, (_, i) => {
            const a = (i / 32) * Math.PI * 2;
            return local(
              item.width / 2 + Math.cos(a) * item.width * 0.32,
              item.depth + 0.2,
              item.height * 0.43 + Math.sin(a) * item.width * 0.32,
            );
          }),
          fill: '#7cabbc',
        });
      } else if (item.kind === 'window') {
        frontDetails.push(
          frontRect(item.width / 2 - 0.5, 0, 1, item.height, '#f1f4f4'),
          frontRect(0, item.height / 2 - 0.5, item.width, 1, '#f1f4f4'),
        );
      } else if (item.kind === 'refrigerator') {
        frontDetails.push(
          frontRect(1, 1, item.width - 2, item.height * 0.27, '#c1cdd3'),
          frontRect(
            item.width / 2 - 0.25,
            item.height * 0.3,
            0.5,
            item.height * 0.68,
            '#7f919a',
          ),
        );
      } else if (item.kind === 'range') {
        frontDetails.push(
          frontRect(3, 5, item.width - 6, item.height * 0.55, '#4c626f'),
          frontRect(1, item.height - 6, item.width - 2, 4, '#8f9fa8'),
        );
      } else if (item.kind === 'dishwasher')
        frontDetails.push(
          frontRect(1, item.height - 5, item.width - 2, 3, '#718892'),
        );
      const topDetails: Decoration[] = [];
      if (item.kind === 'range')
        for (const x of [0.28, 0.72])
          for (const y of [0.28, 0.72])
            topDetails.push({
              vertices: Array.from({ length: 24 }, (_, i) => {
                const a = (i / 24) * Math.PI * 2,
                  r = Math.min(item.width, item.depth) * 0.14;
                return local(
                  item.width * x + Math.cos(a) * r,
                  item.depth * y + Math.sin(a) * r,
                  item.height + 0.05,
                );
              }),
              fill: '#445862',
            });
      if (item.kind === 'sink')
        topDetails.push({
          vertices: [
            local(2, 2, item.height + 0.05),
            local(item.width - 2, 2, item.height + 0.05),
            local(item.width - 2, item.depth - 2, item.height + 0.05),
            local(2, item.depth - 2, item.height + 0.05),
          ],
          fill: '#8db5c4',
        });
      const holes =
        item.kind === 'countertop' || item.kind === 'island'
          ? sinkHoles(item, design.items)
          : [];
      const topPanels = cutPanels(item.width, item.depth, holes);
      const surfaces = [
        {
          vertices: [v[0], v[1], v[5], v[4]] as Vec[],
          color: item.kind === 'window' ? front : side,
          front: false,
          details:
            item.kind === 'window'
              ? [
                  frontRect(
                    item.width / 2 - 0.5,
                    0,
                    1,
                    item.height,
                    '#f1f4f4',
                    -0.1,
                  ),
                  frontRect(
                    0,
                    item.height / 2 - 0.5,
                    item.width,
                    1,
                    '#f1f4f4',
                    -0.1,
                  ),
                ]
              : item.kind === 'door'
                ? [
                    frontRect(
                      2,
                      3,
                      item.width - 4,
                      item.height - 6,
                      palette.front,
                      -0.1,
                    ),
                  ]
                : ([] as Decoration[]),
        },
        {
          vertices: [v[1], v[2], v[6], v[5]] as Vec[],
          color: side,
          front: false,
          details: [] as Decoration[],
        },
        {
          vertices: [v[2], v[3], v[7], v[6]] as Vec[],
          color: front,
          front: true,
          details: frontDetails,
        },
        {
          vertices: [v[3], v[0], v[4], v[7]] as Vec[],
          color: side,
          front: false,
          details: [] as Decoration[],
        },
        ...topPanels.map((p) => ({
          vertices: [
            local(p.x, p.y, item.height),
            local(p.x + p.width, p.y, item.height),
            local(p.x + p.width, p.y + p.height, item.height),
            local(p.x, p.y + p.height, item.height),
          ],
          color:
            item.kind === 'countertop' ||
            item.kind === 'island' ||
            item.category === 'base_cabinet'
              ? '#f5f1e8'
              : wood
                ? palette.top
                : '#c5d2d8',
          front: false,
          details: topDetails,
        })),
      ];
      if (item.kind === 'partition') {
        surfaces.splice(
          0,
          surfaces.length,
          ...partitionPanels(item, design.items).flatMap((p) => {
            const v = [
              local(p.x, 0, p.y),
              local(p.x + p.width, 0, p.y),
              local(p.x + p.width, item.depth, p.y),
              local(p.x, item.depth, p.y),
              local(p.x, 0, p.y + p.height),
              local(p.x + p.width, 0, p.y + p.height),
              local(p.x + p.width, item.depth, p.y + p.height),
              local(p.x, item.depth, p.y + p.height),
            ];
            return [
              [0, 1, 5, 4],
              [1, 2, 6, 5],
              [2, 3, 7, 6],
              [3, 0, 4, 7],
              [4, 5, 6, 7],
            ].map((indices) => ({
              vertices: indices.map((i) => v[i] ?? ([0, 0, 0] as Vec)),
              color: '#e5e1d8',
              front: false,
              details: [] as Decoration[],
            }));
          }),
        );
      }
      return surfaces.map((face, index) => ({
        item,
        index,
        ...face,
        handle:
          face.front &&
          item.kind !== 'window' &&
          item.kind !== 'sink' &&
          item.kind !== 'countertop'
            ? [
                local(
                  item.width * (item.mirrored ? 0.2 : 0.8),
                  item.depth + 0.15,
                  isUpperCabinet(item) ? 3 : item.height * 0.55,
                ),
                local(
                  item.width * (item.mirrored ? 0.2 : 0.8),
                  item.depth + 0.15,
                  isUpperCabinet(item) ? 6 : item.height * 0.55 + 3,
                ),
              ]
            : null,
        door:
          face.front && wood
            ? [
                local(2, item.depth + 0.05, 4),
                local(item.width - 2, item.depth + 0.05, 4),
                local(item.width - 2, item.depth + 0.05, item.height - 2),
                local(2, item.depth + 0.05, item.height - 2),
              ]
            : null,
      }));
    })
    .sort((a, b) => depth(a.vertices) - depth(b.vertices));
  function wallPanels(wall: (typeof walls)[number]) {
    const dx = (wall.b.x - wall.a.x) / wall.length,
      dy = (wall.b.y - wall.a.y) / wall.length;
    return buildWallPanels(design, wall).map((panel) =>
      panel.map((p) => [wall.a.x + dx * p.x, wall.a.y + dy * p.x, p.y] as Vec),
    );
  }

  return (
    <div className="preview-stage">
      <div className="preview-controls">
        <button
          onClick={() => setAngle((angle + 315) % 360)}
          aria-label="Rotate view left"
        >
          <RotateCcw size={15} />
        </button>
        <span>View {Math.round(angle)}°</span>
        <button
          onClick={() => setAngle((angle + 45) % 360)}
          aria-label="Rotate view right"
        >
          <RotateCw size={15} />
        </button>
        <button
          aria-label="Orbit 3D view"
          aria-pressed={!panMode}
          onClick={() => setPanMode(false)}
        >
          <RotateCw size={14} />
        </button>
        <button
          aria-label="Pan 3D view"
          aria-pressed={panMode}
          onClick={() => setPanMode(true)}
        >
          <Hand size={14} />
        </button>
        <button
          aria-label="Zoom out 3D"
          disabled={zoom <= 0.5}
          onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
        >
          <Minus size={14} />
        </button>
        <button
          aria-label="Zoom in 3D"
          disabled={zoom >= 3}
          onClick={() => setZoom(Math.min(3, zoom + 0.25))}
        >
          <Plus size={14} />
        </button>
        <button
          aria-label="Fit 3D view"
          onClick={() => {
            setPan({ x: 0, y: 0 });
            setZoom(1);
            setAngle(0);
          }}
        >
          <Maximize size={14} />
        </button>
      </div>
      <svg
        className="preview-svg"
        viewBox={`${left + w / 2 - w / zoom / 2 + pan.x} ${top + h / 2 - h / zoom / 2 + pan.y} ${w / zoom} ${h / zoom}`}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={() => {
          if (!moved.current && gesture.current?.cabinetId)
            onSelect(gesture.current.cabinetId);
          gesture.current = null;
        }}
        onPointerCancel={() => {
          gesture.current = null;
          moved.current = true;
        }}
        style={{ touchAction: 'none', cursor: 'grab' }}
        role="img"
        aria-label="3D kitchen preview"
      >
        <defs>
          <clipPath id="preview-floor-clip">
            <polygon points={points(corners)} />
          </clipPath>
        </defs>
        <polygon
          points={points(corners)}
          fill="#dfd7c9"
          stroke="#b9afa0"
          strokeWidth=".6"
        />
        {Array.from({ length: Math.floor(room.depth / 12) }, (_, i) => (
          <polyline
            key={i}
            clipPath="url(#preview-floor-clip)"
            points={points([
              [0, (i + 1) * 12, 0],
              [room.width, (i + 1) * 12, 0],
            ])}
            fill="none"
            stroke="#c7bdac"
            strokeWidth=".3"
          />
        ))}
        {walls.flatMap((wall) =>
          wallPanels(wall).map((panel, i) => (
            <polygon
              key={wall.key + i}
              className="wall-panel"
              points={points(panel)}
              fill="#e5eaec"
              stroke="#e5eaec"
              strokeWidth=".2"
            />
          )),
        )}
        {faces.map((face) => (
          <g
            key={face.item.id + ':' + face.index}
            data-cabinet={face.item.id}
            onClick={() => {
              if (!moved.current) onSelect(face.item.id);
            }}
            style={{ cursor: 'pointer' }}
          >
            <polygon
              points={points(face.vertices)}
              fill={face.color}
              stroke={selected === face.item.id ? '#087984' : '#867d70'}
              strokeWidth={selected === face.item.id ? 0.7 : 0.35}
            />
            {face.details.map((detail, i) => (
              <polygon
                key={i}
                className={`object-detail ${face.item.kind}`}
                points={points(detail.vertices)}
                fill={detail.fill}
                stroke="#607c8b"
                strokeWidth=".35"
              />
            ))}
            {face.handle && (
              <polyline
                className="preview-handle"
                points={points(face.handle)}
                fill="none"
                stroke="#33444e"
                strokeWidth="1.1"
                strokeLinecap="round"
              />
            )}
            {face.door && (
              <>
                <polygon
                  points={points(face.door)}
                  fill="none"
                  stroke="#746b5e"
                  strokeWidth=".45"
                />
                <line
                  x1={point(face.door[2] ?? [0, 0, 0])[0]}
                  y1={point(face.door[2] ?? [0, 0, 0])[1]}
                  x2={point(face.door[3] ?? [0, 0, 0])[0]}
                  y2={point(face.door[3] ?? [0, 0, 0])[1]}
                  stroke="#807463"
                  strokeWidth=".8"
                />
              </>
            )}
          </g>
        ))}
        {dimensions?.on &&
          design.items
            .filter((i) => !i.hidden)
            .map((item) => {
              const label = itemDimensionText(item, dimensions.axes);
              if (!label) return null;
              // Over the middle of the item, at the height of its top, so
              // the number sits on the thing it measures.
              const f = footprint(item);
              const [x, y] = point([
                item.x + f.width / 2,
                item.y + f.depth / 2,
                item.elevation + item.height,
              ]);
              return (
                <text
                  key={`size-${item.id}`}
                  data-testid="preview-dimensions"
                  x={x}
                  y={y - 2}
                  textAnchor="middle"
                  fontSize="4"
                  fill="#41545e"
                  stroke="white"
                  strokeWidth="1.1"
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  {label}
                </text>
              );
            })}
      </svg>
      <p className="preview-caption">
        Drag to {panMode ? 'pan' : 'orbit'} · schematic 3D · illustrative fronts
      </p>
    </div>
  );
}
