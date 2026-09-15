'use client';
import { useEffect, useState } from 'react';
import type { Room } from '@/designer/model';
import {
  roomOutline,
  roomPreset,
  outlineIssue,
  clockwise,
  area,
} from '@/designer/room';
export function RoomEditor({
  room,
  onChange,
}: {
  room: Room;
  onChange: (outline: Room['outline']) => void;
}) {
  const format = (points: Room['outline']) =>
    points.map((p) => `${p.x}, ${p.y}`).join('\n');
  const [text, setText] = useState(format(roomOutline(room))),
    [error, setError] = useState(''),
    [drawing, setDrawing] = useState(false);
  useEffect(() => setText(format(roomOutline(room))), [room]);
  const points = text
    .split('\n')
    .filter((s) => s.trim())
    .map((s) => {
      const [x, y] = s.split(',').map(Number);
      return { x: x ?? NaN, y: y ?? NaN };
    });
  const valid = points.every(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  return (
    <details className="room-outline-editor">
      <summary>
        Room shape · {(Math.abs(area(roomOutline(room))) / 144).toFixed(1)} sq
        ft
      </summary>
      <p className="designer-muted">
        Draw angled or right-angle rooms. Place corners on the grid or enter X,
        Y coordinates in inches, clockwise.
      </p>
      <div className="designer-row">
        {(['rectangle', 'l', 'u'] as const).map((kind) => (
          <button
            key={kind}
            onClick={() => {
              onChange(roomPreset(kind, room.width, room.depth));
              setError('');
              setDrawing(false);
            }}
          >
            {kind === 'rectangle' ? 'Rectangle' : kind.toUpperCase() + ' shape'}
          </button>
        ))}
      </div>
      <button
        aria-pressed={drawing}
        onClick={() => {
          setDrawing(!drawing);
          if (!drawing) setText('');
        }}
      >
        Draw outline
      </button>
      <svg
        viewBox={`-6 -6 ${room.width + 12} ${room.depth + 12}`}
        className="room-outline-sketch"
        aria-label="Room outline drawing"
        onClick={(e) => {
          if (!drawing) return;
          const svg = e.currentTarget,
            p = svg.createSVGPoint(),
            matrix = svg.getScreenCTM()?.inverse();
          if (!matrix) return;
          p.x = e.clientX;
          p.y = e.clientY;
          const q = p.matrixTransform(matrix);
          const x = Math.min(room.width, Math.max(0, Math.round(q.x / 6) * 6)),
            y = Math.min(room.depth, Math.max(0, Math.round(q.y / 6) * 6));
          const last = points.at(-1);
          if (points.length >= 24) {
            setError('Use no more than 24 corners.');
            return;
          }
          if (last && last.x === x && last.y === y) return;
          setText(format([...points, { x, y }]));
        }}
      >
        <rect
          width={room.width}
          height={room.depth}
          fill="#edf4f7"
          stroke="#94a8b4"
          strokeWidth="1"
        />
        {valid && (
          <>
            <polyline
              points={points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill={drawing ? 'none' : '#cce3e6'}
              stroke="#147d88"
              strokeWidth="2"
            />
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#147d88" />
            ))}
          </>
        )}
      </svg>
      <label>
        Corner coordinates
        <textarea
          aria-label="Room corner coordinates"
          value={text}
          rows={6}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="designer-row">
        <button onClick={() => setText(format(points.slice(0, -1)))}>
          Remove last corner
        </button>
        <button
          onClick={() => {
            const issue = outlineIssue(points, room.width, room.depth);
            if (issue || !points.length) {
              setError(issue ?? 'Add at least four corners.');
              return;
            }
            onChange(clockwise(points));
            setError('');
            setDrawing(false);
          }}
        >
          Apply room shape
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
