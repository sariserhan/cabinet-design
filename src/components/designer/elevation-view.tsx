'use client';
import { useRef, useState } from 'react';
import { roomEdges } from '@/designer/room';
import { elevationRows } from '@/designer/studio-tools';
import type { Design } from '@/designer/model';
export function ElevationView({
  design,
  onSelect,
}: {
  design: Design;
  onSelect: (id: string) => void;
}) {
  const edges = roomEdges(design.room).filter((e) => !e.curved),
    [selected, setSelected] = useState(0),
    edge = edges.find((e) => e.index === selected) ?? edges[0],
    svg = useRef<SVGSVGElement>(null);
  if (!edge) return <p>Wall elevations require a straight wall.</p>;
  const rows = elevationRows(design, edge.index),
    height = design.room.height;
  return (
    <section className="elevation-view">
      <h2>Wall elevations</h2>
      <label>
        Wall
        <select
          aria-label="Elevation wall"
          value={edge.index}
          onChange={(e) => setSelected(Number(e.target.value))}
        >
          {edges.map((e) => (
            <option value={e.index} key={e.index}>
              Wall {e.index + 1} · {e.side}
            </option>
          ))}
        </select>
      </label>
      <button
        onClick={() => {
          if (!svg.current) return;
          const text = svg.current.outerHTML.replace(
            '<svg',
            '<svg xmlns="http://www.w3.org/2000/svg"',
          );
          const url = URL.createObjectURL(
              new Blob([text], { type: 'image/svg+xml' }),
            ),
            a = document.createElement('a');
          a.href = url;
          a.download = `wall-${edge.index + 1}-elevation.svg`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        Download elevation SVG
      </button>
      <p>
        Straight-on projection of visible objects within 36 inches of the wall.
        Dimensions are in inches; check detailed installation drawings for
        construction.
      </p>
      <svg
        ref={svg}
        role="img"
        aria-label="Wall elevation drawing"
        viewBox={`-15 -15 ${edge.length + 30} ${height + 40}`}
      >
        <rect
          x="0"
          y="0"
          width={edge.length}
          height={height}
          fill="#f6f4ed"
          stroke="#617783"
        />
        {rows.map(({ item: i, x, width }) => (
          <g
            key={i.id}
            role="button"
            tabIndex={0}
            aria-label={`Elevation ${i.sku}`}
            onClick={() => onSelect(i.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSelect(i.id);
            }}
          >
            <rect
              x={x}
              y={height - i.elevation - i.height}
              width={width}
              height={i.height}
              fill={
                i.kind === 'window'
                  ? '#bed9e0'
                  : i.kind === 'countertop'
                    ? '#e2dfd8'
                    : '#cbb78e'
              }
              fillOpacity=".85"
              stroke="#455e69"
              strokeWidth=".5"
            />
            {i.height >= 8 && width >= 12 && (
              <>
                <text
                  x={x + width / 2}
                  y={height - i.elevation - i.height / 2}
                  textAnchor="middle"
                  fontSize="2.4"
                >
                  {i.sku.slice(0, 14)}
                </text>
                <text
                  x={x + width / 2}
                  y={height - i.elevation - i.height - 2}
                  textAnchor="middle"
                  fontSize="2.4"
                >
                  {i.width} W × {i.height} H
                </text>
              </>
            )}
            <title>
              {i.sku}: {i.width} W × {i.height} H, elevation {i.elevation}{' '}
              inches
            </title>
          </g>
        ))}
        <text
          x={edge.length / 2}
          y={height + 9}
          textAnchor="middle"
          fontSize="4"
        >
          Wall {edge.index + 1}: {edge.length.toFixed(1)}″ · reference height{' '}
          {height}″
        </text>
      </svg>
      <details>
        <summary>Object dimensions and heights</summary>
        <table>
          <thead>
            <tr>
              <th>Object</th>
              <th>Width</th>
              <th>Height</th>
              <th>Above floor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item }) => (
              <tr key={item.id}>
                <td>{item.sku}</td>
                <td>{item.width}″</td>
                <td>{item.height}″</td>
                <td>{item.elevation}″</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
