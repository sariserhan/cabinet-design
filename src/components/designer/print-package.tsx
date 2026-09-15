'use client';
import { quoteTotals, money } from '@/designer/quote';
import { itemPolygon } from '@/designer/model';
import { ceilingAt } from '@/designer/room';
import type { Design, Cabinet } from '@/designer/model';
import { footprint, billKey, warnings } from '@/designer/model';
import { roomOutline, roomEdges, area } from '@/designer/room';
export function PrintPackage({ design }: { design: Design }) {
  const outline = roomOutline(design.room),
    edges = roomEdges(design.room),
    issues = warnings(design);
  const bill = Array.from(
    design.items
      .reduce((m, item) => {
        const key = billKey(item),
          current = m.get(key);
        if (current) current.count++;
        else m.set(key, { item, count: 1 });
        return m;
      }, new Map<string, { item: Cabinet; count: number }>())
      .values(),
  );
  return (
    <article className="print-package" aria-label="Printable design package">
      <section className="print-sheet">
        <header>
          <h1>{design.name}</h1>
          <p>
            Kitchen planning demo · dimensions in inches · drawings not to scale
          </p>
        </header>
        <h2>Floor plan</h2>
        <p>
          {design.room.width}″ × {design.room.depth}″ · ceiling{' '}
          {design.room.height}″ · {(Math.abs(area(outline)) / 144).toFixed(1)}{' '}
          sq ft · {design.items.length} items
        </p>
        <svg
          className="print-plan"
          viewBox={`-15 -15 ${design.room.width + 30} ${design.room.depth + 30}`}
        >
          <polygon
            points={outline.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="#f7f9fa"
            stroke="#253d48"
            strokeWidth="1"
          />
          {edges.map((e) => (
            <text
              key={e.index}
              x={(e.a.x + e.b.x) / 2 + 3}
              y={(e.a.y + e.b.y) / 2 - 3}
              fontSize="4"
            >
              Wall {e.index + 1} · {Number(e.length.toFixed(1))}″
            </text>
          ))}
          {design.items.map((item) => {
            return (
              <g key={item.id}>
                <polygon
                  points={itemPolygon(item)
                    .map((p) => `${p.x},${p.y}`)
                    .join(' ')}
                  fill={item.elevation > 40 ? '#dbe7ee' : '#e6ddce'}
                  fillOpacity=".8"
                  stroke="#50636b"
                  strokeWidth=".5"
                />
              </g>
            );
          })}
          {design.items.map((item, index) => {
            const f = footprint(item);
            return (
              <text
                key={item.id}
                x={item.x + f.width / 2}
                y={item.y + f.depth / 2 + ((index % 5) - 2) * 4}
                textAnchor="middle"
                fontSize="3.5"
                stroke="white"
                strokeWidth=".7"
                paintOrder="stroke"
              >
                {index + 1}
              </text>
            );
          })}
        </svg>
        <p>
          Numbered items correspond to the placement schedule. Generic objects
          and cabinet fronts are illustrative. Verify dimensions, clearances,
          services, and manufacturer options before ordering or installation.
        </p>
      </section>
      <section className="print-sheet">
        <h2>Wall elevations</h2>
        <div className="print-elevations">
          {edges
            .filter((edge) => design.room.walls[edge.side])
            .map((edge) => {
              if (edge.curved) {
                const maxHeight = Math.max(
                  design.room.height,
                  design.room.ceiling?.endHeight ?? 0,
                );
                let length = 0;
                const developed = edge.points.map((p, i) => {
                  if (i) {
                    const prev = edge.points[i - 1] ?? p;
                    length += Math.hypot(p.x - prev.x, p.y - prev.y);
                  }
                  return `${length},${maxHeight - ceilingAt(design.room, p.x, p.y)}`;
                });
                return (
                  <section key={edge.index}>
                    <h3>
                      Wall {edge.index + 1} · curved · developed length{' '}
                      {edge.length.toFixed(2)}″
                    </h3>
                    <svg
                      viewBox={`-5 -8 ${edge.length + 10} ${maxHeight + 16}`}
                    >
                      <polygon
                        points={`0,${maxHeight} ${developed.join(' ')} ${edge.length},${maxHeight}`}
                        fill="#f3f3f3"
                        stroke="#50636b"
                        strokeWidth=".6"
                      />
                    </svg>
                    <p>
                      Developed elevation along sampled curve. Radius is not
                      constant; see coordinate export.
                    </p>
                  </section>
                );
              }

              const dx = (edge.b.x - edge.a.x) / edge.length,
                dy = (edge.b.y - edge.a.y) / edge.length;
              const project = (i: Cabinet) => {
                const points = itemPolygon(i),
                  ts = points.map(
                    (p) => (p.x - edge.a.x) * dx + (p.y - edge.a.y) * dy,
                  ),
                  dist = points.map(
                    (p) => -(p.x - edge.a.x) * dy + (p.y - edge.a.y) * dx,
                  );
                return {
                  x: Math.min(...ts),
                  width: Math.max(...ts) - Math.min(...ts),
                  distance: Math.min(...dist),
                };
              };
              const adjacent = design.items.filter((i) => {
                const p = project(i);
                return (
                  Math.abs(p.distance) < 6 &&
                  p.x >= -0.01 &&
                  p.x + p.width <= edge.length + 0.01
                );
              });
              const maxHeight = Math.max(
                  design.room.height,
                  design.room.ceiling?.endHeight ?? 0,
                ),
                aHeight = ceilingAt(design.room, edge.a.x, edge.a.y),
                bHeight = ceilingAt(design.room, edge.b.x, edge.b.y);
              return (
                <section key={edge.index}>
                  <h3>
                    Wall {edge.index + 1} · {edge.side} ·{' '}
                    {Number(edge.length.toFixed(1))}″
                  </h3>
                  <svg viewBox={`-5 -8 ${edge.length + 10} ${maxHeight + 16}`}>
                    <polygon
                      points={`0,${maxHeight} ${edge.length},${maxHeight} ${edge.length},${maxHeight - bHeight} 0,${maxHeight - aHeight}`}
                      fill="white"
                      stroke="#50636b"
                      strokeWidth=".6"
                    />
                    {adjacent.map((i) => {
                      const { x, width } = project(i);
                      return (
                        <g key={i.id}>
                          <rect
                            x={x}
                            y={maxHeight - i.elevation - i.height}
                            width={width}
                            height={i.height}
                            fill={i.kind === 'window' ? '#d5eaf0' : '#e5ded2'}
                            stroke="#50636b"
                            strokeWidth=".5"
                          />
                          <text
                            x={x + width / 2}
                            y={maxHeight - i.elevation - i.height / 2}
                            textAnchor="middle"
                            fontSize="3"
                          >
                            {i.sku}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </section>
              );
            })}
        </div>
      </section>
      <section className="print-sheet">
        <h2>Placement schedule</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>W × D × H</th>
              <th>X / Y / elevation</th>
              <th>Rotation</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {design.items.map((i, index) => (
              <tr key={i.id}>
                <td>{index + 1}</td>
                <td>{i.sku}</td>
                <td>
                  {i.width} × {i.depth} × {i.height}
                </td>
                <td>
                  {i.x} / {i.y} / {i.elevation}
                </td>
                <td>
                  {i.rotation}°{i.mirrored ? ' · mirrored' : ''}
                </td>
                <td>
                  {i.kind === 'cabinet' ? `PDF ${i.pageNumber}` : 'Demo object'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>Quantity summary</h2>
        <ul>
          {bill.map(({ item, count }) => (
            <li key={billKey(item)}>
              {item.sku}: {count} × {item.width}″ × {item.depth}″ ×{' '}
              {item.height}″
            </li>
          ))}
        </ul>
        <h2>Layout review</h2>
        {issues.length ? (
          <ul>
            {issues.map((issue) => (
              <li key={issue.id}>{issue.message}</li>
            ))}
          </ul>
        ) : (
          <p>No issues detected by the demo geometry checks.</p>
        )}
        <p>
          This package is for design discussion; it is not a construction or
          order approval.
        </p>
      </section>
      <section className="print-sheet">
        <h2>Demo quote · USD</h2>
        <p>DEMO PRICING — NOT A MANUFACTURER QUOTE</p>
        <p>Customer: {design.quote?.customer || '—'}</p>
        <table>
          <thead>
            <tr>
              <th>Item (one unit per placement)</th>
              <th>Dimensions</th>
              <th>Demo price</th>
            </tr>
          </thead>
          <tbody>
            {quoteTotals(design).lines.map((line) => (
              <tr key={line.id}>
                <td>{line.sku}</td>
                <td>{line.description}</td>
                <td>{money(line.unitCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Merchandise: {money(quoteTotals(design).subtotal)} · Discount: −
          {money(quoteTotals(design).discount)} · Tax:{' '}
          {money(quoteTotals(design).tax)}
        </p>
        <p>
          Installation: {money(quoteTotals(design).installation)} · Delivery:{' '}
          {money(quoteTotals(design).delivery)}
        </p>
        <h3>Demo total: {money(quoteTotals(design).total)}</h3>
        <p>
          Tax applies to discounted merchandise only. Illustrative prices only.
          No payment collected or supplier order placed.
        </p>
      </section>
    </article>
  );
}
