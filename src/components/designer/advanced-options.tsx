'use client';
import type { Cabinet, Design } from '@/designer/model';
import { itemPolygon, partitionPanels, footprint } from '@/designer/model';
import { roomEdges, roomOutline, ceilingAt } from '@/designer/room';
import {
  installationDefaults,
  installationProfiles,
  installationIssues,
  profileFor,
} from '@/designer/installation';
import {
  panelParts,
  planDxf,
  planAndElevationsDxf,
  installationSchedule,
  shopDefaults,
} from '@/designer/fabrication';
import { manufacturingCsv, machiningDxf } from '@/designer/machining';
import { OptionNumber } from './demo-options';
export function ArchitectureOptions({
  design,
  onChange,
}: {
  design: Design;
  onChange: (next: Design) => void;
}) {
  return (
    <details className="demo-options">
      <summary>Curved walls & vault ridge</summary>
      <p className="designer-muted">
        Bow is measured at the wall midpoint. Positive values curve into the
        room. Curved perimeter openings are not supported; move them to a
        straight wall first.
      </p>
      {roomEdges(design.room).map((edge) => (
        <OptionNumber
          key={edge.index}
          label={`Wall ${edge.index + 1} bow (in)`}
          min={-120}
          max={120}
          value={
            design.room.curves?.find((c) => c.wall === edge.index)?.bow ?? 0
          }
          onChange={(bow) =>
            onChange({
              ...design,
              room: {
                ...design.room,
                curves: [
                  ...(design.room.curves ?? []).filter(
                    (c) => c.wall !== edge.index,
                  ),
                  ...(bow ? [{ wall: edge.index, bow }] : []),
                ],
              },
            })
          }
        />
      ))}
      {design.room.ceiling?.kind === 'vault' && (
        <>
          <label className="designer-numeric">
            <span>Vault slope axis</span>
            <select
              aria-label="Vault slope axis"
              value={design.room.ceiling.axis}
              onChange={(e) =>
                onChange({
                  ...design,
                  room: {
                    ...design.room,
                    ceiling: {
                      endHeight: design.room.ceiling?.endHeight ?? 132,
                      ridge: design.room.ceiling?.ridge ?? 0.5,
                      kind: 'vault',
                      axis: e.target.value as 'x' | 'y',
                    },
                  },
                })
              }
            >
              <option value="x">Width</option>
              <option value="y">Depth</option>
            </select>
          </label>
          <OptionNumber
            label="Ridge position (%)"
            min={10}
            max={90}
            value={(design.room.ceiling.ridge ?? 0.5) * 100}
            onChange={(value) =>
              onChange({
                ...design,
                room: {
                  ...design.room,
                  ceiling: {
                    axis: design.room.ceiling?.axis ?? 'x',
                    endHeight: design.room.ceiling?.endHeight ?? 132,
                    kind: 'vault',
                    ridge: value / 100,
                  },
                },
              })
            }
          />
        </>
      )}
    </details>
  );
}
export function PartitionOptions({
  design,
  item,
  onChange,
}: {
  design: Design;
  item: Cabinet;
  onChange: (patch: Partial<Cabinet>) => void;
}) {
  if (item.kind !== 'door' && item.kind !== 'window') return null;
  return (
    <details className="demo-options">
      <summary>Opening host</summary>
      <label className="designer-numeric">
        <span>Host wall</span>
        <select
          aria-label="Opening host"
          value={item.opening?.hostId ?? 'perimeter'}
          onChange={(e) =>
            onChange(
              e.target.value === 'perimeter'
                ? { opening: undefined, wall: 'north', wallSegment: 0 }
                : {
                    opening: {
                      hostId: e.target.value,
                      offset: 0,
                      sill: item.kind === 'window' ? 36 : 0,
                    },
                    wall: null,
                    wallSegment: null,
                  },
            )
          }
        >
          <option value="perimeter">Room perimeter</option>
          {design.items
            .filter((i) => i.kind === 'partition')
            .map((p, i) => (
              <option key={p.id} value={p.id}>
                Partition {i + 1} · {p.width}″
              </option>
            ))}
        </select>
      </label>
      {item.opening && (
        <>
          <OptionNumber
            label="Opening offset (in)"
            value={item.opening.offset}
            onChange={(offset) =>
              onChange({
                opening: {
                  hostId: item.opening?.hostId ?? '',
                  sill: item.opening?.sill ?? 0,
                  offset,
                },
              })
            }
          />
          <OptionNumber
            label="Opening sill (in)"
            value={item.opening.sill}
            onChange={(sill) =>
              onChange({
                opening: {
                  hostId: item.opening?.hostId ?? '',
                  offset: item.opening?.offset ?? 0,
                  sill,
                },
              })
            }
          />
          <p className="designer-muted">
            Moves and rotates with its partition. Offset and sill are measured
            from the partition's local left end and base.
          </p>
        </>
      )}
    </details>
  );
}
export function InstallationOptions({
  item,
  onChange,
}: {
  item: Cabinet;
  onChange: (patch: Partial<Cabinet>) => void;
}) {
  if (
    ![
      'refrigerator',
      'dishwasher',
      'washing_machine',
      'range',
      'hood',
      'sink',
    ].includes(item.kind)
  )
    return null;
  const state = { ...installationDefaults, ...item.installation },
    profile = profileFor(item);
  return (
    <details className="demo-options">
      <summary>Installation & utilities</summary>
      <label className="designer-numeric">
        <span>Product profile</span>
        <select
          aria-label="Installation product profile"
          value={state.profile}
          onChange={(e) =>
            onChange({ installation: { ...state, profile: e.target.value } })
          }
        >
          <option value="">Unverified / generic</option>
          {installationProfiles
            .filter((p) => p.kind === item.kind)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </label>
      {profile && (
        <>
          <p className="designer-muted">{profile.note}</p>
          <a href={profile.source} target="_blank" rel="noreferrer">
            Manufacturer specification
          </a>
          <button
            onClick={() =>
              onChange({
                ...profile.dimensions,
                sku: profile.name,
                clearance: profile.clearance,
              })
            }
          >
            Apply model dimensions & gaps
          </button>
        </>
      )}
      <p className="designer-muted">
        Record actual site services. Unknown is not a pass. These checks do not
        certify wiring, gas, plumbing, or code compliance.
      </p>
      <OptionNumber
        label="Supply voltage (V)"
        max={500}
        value={state.voltage}
        onChange={(voltage) =>
          onChange({ installation: { ...state, voltage } })
        }
      />
      <OptionNumber
        label="Circuit capacity (A)"
        max={100}
        value={state.circuitAmps}
        onChange={(circuitAmps) =>
          onChange({ installation: { ...state, circuitAmps } })
        }
      />
      <label className="designer-numeric">
        <span>Water supply</span>
        <select
          aria-label="Water supply"
          value={state.water}
          onChange={(e) =>
            onChange({
              installation: {
                ...state,
                water: e.target.value as typeof state.water,
              },
            })
          }
        >
          {['unknown', 'hot', 'cold', 'none'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <OptionNumber
        label="Water pressure (psi)"
        max={300}
        value={state.waterPressure ?? 0}
        onChange={(waterPressure) =>
          onChange({ installation: { ...state, waterPressure } })
        }
      />
      <label>
        <input
          type="checkbox"
          checked={state.drain}
          onChange={(e) =>
            onChange({ installation: { ...state, drain: e.target.checked } })
          }
        />{' '}
        Drain connection documented
      </label>
      <OptionNumber
        label="Drain high-loop height (in)"
        max={120}
        value={state.drainRise ?? 0}
        onChange={(drainRise) =>
          onChange({ installation: { ...state, drainRise } })
        }
      />
      <label className="designer-numeric">
        <span>Ventilation</span>
        <select
          aria-label="Ventilation route"
          value={state.vent}
          onChange={(e) =>
            onChange({
              installation: {
                ...state,
                vent: e.target.value as typeof state.vent,
              },
            })
          }
        >
          {['unknown', 'outside', 'recirculating', 'none'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <OptionNumber
        label="Duct diameter (in)"
        max={24}
        value={state.ductDiameter}
        onChange={(ductDiameter) =>
          onChange({ installation: { ...state, ductDiameter } })
        }
      />
      <OptionNumber
        label="Exhaust airflow (CFM)"
        max={3000}
        value={state.ventCfm ?? 0}
        onChange={(ventCfm) =>
          onChange({ installation: { ...state, ventCfm } })
        }
      />
      {(['serviceX', 'serviceY', 'serviceZ'] as const).map((key) => (
        <OptionNumber
          key={key}
          label={`Service ${key.slice(-1)} (in)`}
          value={state[key] ?? 0}
          onChange={(value) =>
            onChange({ installation: { ...state, [key]: value } })
          }
        />
      ))}
      <label>
        Installation notes
        <textarea
          aria-label="Installation notes"
          maxLength={1000}
          value={state.notes}
          onChange={(e) =>
            onChange({ installation: { ...state, notes: e.target.value } })
          }
        />
      </label>
    </details>
  );
}
function saveFile(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function DrawingTools({
  design,
  onChange,
}: {
  design: Design;
  onChange: (next: Design) => void;
}) {
  const settings = design.fabrication ?? shopDefaults,
    { parts, excluded } = panelParts(design);
  return (
    <details className="demo-options">
      <summary>Drawings & fabrication exports</summary>
      <p className="designer-muted">
        Layout DXF uses millimeters and closed polylines. Curves are sampled at
        32 spans. Panel blanks are generated only for Custom cabinet objects,
        using the construction assumptions below. Catalog cabinets, drawer
        systems and corner units are not reverse-engineered.
      </p>
      <OptionNumber
        label="Carcass stock thickness (in)"
        min={0.25}
        max={1.5}
        value={settings.thickness}
        onChange={(thickness) =>
          onChange({ ...design, fabrication: { ...settings, thickness } })
        }
      />
      <OptionNumber
        label="Applied back thickness (in)"
        min={0.125}
        max={0.75}
        value={settings.back}
        onChange={(back) =>
          onChange({ ...design, fabrication: { ...settings, back } })
        }
      />
      <OptionNumber
        label="Door / shelf gap (in)"
        min={0.03125}
        max={0.25}
        value={settings.gap}
        onChange={(gap) =>
          onChange({ ...design, fabrication: { ...settings, gap } })
        }
      />
      <p className="designer-muted">
        Full-height sides, applied backs, full-overlay slab doors and separate
        toe platforms. Configure joint, banding and drilling allowances below.
        Shop review and machine toolpaths are still required.
      </p>
      <div className="designer-row">
        <button onClick={() => window.print()}>
          Installation drawings / PDF
        </button>
        <button
          onClick={() =>
            saveFile(
              planDxf(design),
              'kitchen-layout-mm.dxf',
              'application/dxf',
            )
          }
        >
          Layout DXF
        </button>
        <button
          onClick={() =>
            saveFile(
              planAndElevationsDxf(design),
              'kitchen-plan-and-elevations-mm.dxf',
              'application/dxf',
            )
          }
        >
          Plan &amp; elevations DXF
        </button>
        <button
          disabled={!parts.length}
          onClick={() =>
            saveFile(
              manufacturingCsv(design),
              'custom-panel-cutlist-mm.csv',
              'text/csv',
            )
          }
        >
          Panel cut list
        </button>
        <button
          disabled={!parts.length}
          onClick={() =>
            saveFile(
              machiningDxf(design),
              'custom-panel-blanks-mm.dxf',
              'application/dxf',
            )
          }
        >
          Panel DXF
        </button>
        <button
          onClick={() =>
            saveFile(
              JSON.stringify(installationSchedule(design), null, 2),
              'installation-schedule.json',
              'application/json',
            )
          }
        >
          Installation JSON
        </button>
      </div>
      <p>{parts.reduce((n, p) => n + p.quantity, 0)} custom panel blanks</p>
      {excluded.map((note, i) => (
        <p className="designer-muted" key={i}>
          {note}
        </p>
      ))}
    </details>
  );
}
export function InstallationSheets({ design }: { design: Design }) {
  const { parts, excluded } = panelParts(design),
    issues = installationIssues(design),
    sectionAxis = design.room.ceiling?.axis ?? 'x',
    sectionSpan = sectionAxis === 'x' ? design.room.width : design.room.depth;
  return (
    <article
      className="print-package"
      aria-label="Installation drawing supplement"
    >
      <section className="print-sheet">
        <h2>A2 · Setting-out & service plan</h2>
        <p>
          {design.name} · Dimensions in inches · Datum: plan upper-left (X
          right, Y down), elevation above floor
        </p>
        <svg
          className="print-plan"
          viewBox={`-20 -20 ${design.room.width + 40} ${design.room.depth + 40}`}
        >
          <polygon
            points={roomOutline(design.room)
              .map((p) => `${p.x},${p.y}`)
              .join(' ')}
            fill="#fafafa"
            stroke="#243c49"
            strokeWidth="1"
          />
          {design.items.map((item, i) => {
            const f = footprint(item),
              s = item.installation;
            return (
              <g key={item.id}>
                <polygon
                  points={itemPolygon(item)
                    .map((p) => `${p.x},${p.y}`)
                    .join(' ')}
                  fill="none"
                  stroke="#536d79"
                  strokeWidth=".4"
                />
                <text
                  x={item.x + f.width / 2}
                  y={item.y + f.depth / 2}
                  fontSize="3"
                  textAnchor="middle"
                >
                  {i + 1}
                </text>
                {s && s.serviceX !== undefined && s.serviceY !== undefined && (
                  <>
                    <circle cx={s.serviceX} cy={s.serviceY} r="2" fill="#b33" />
                    <text x={s.serviceX + 3} y={s.serviceY + 3} fontSize="3">
                      S{i + 1}
                    </text>
                  </>
                )}
              </g>
            );
          })}
          <text
            x={design.room.width / 2}
            y={-8}
            fontSize="4"
            textAnchor="middle"
          >
            {design.room.width}″ overall
          </text>
          <text
            x={-15}
            y={design.room.depth / 2}
            fontSize="4"
            transform={`rotate(-90 -15 ${design.room.depth / 2})`}
            textAnchor="middle"
          >
            {design.room.depth}″ overall
          </text>
        </svg>
        <table>
          <thead>
            <tr>
              <th>No. / item</th>
              <th>X / Y / elevation</th>
              <th>W × D × H</th>
              <th>Rotation</th>
            </tr>
          </thead>
          <tbody>
            {design.items.map((i, n) => (
              <tr key={i.id}>
                <td>
                  {n + 1} · {i.sku}
                </td>
                <td>
                  {i.x.toFixed(2)} / {i.y.toFixed(2)} / {i.elevation.toFixed(2)}
                </td>
                <td>
                  {i.width} × {i.depth} × {i.height}
                </td>
                <td>{i.rotation.toFixed(1)}°</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="print-sheet">
        <h2>M1 · Appliance & utility schedule</h2>
        <p>
          Source-backed checks cover only the documented fields in the selected
          model profiles. Recorded site values are user-entered, not inspected.
        </p>
        <table>
          <thead>
            <tr>
              <th>Service / appliance</th>
              <th>Profile / source</th>
              <th>Electrical</th>
              <th>Plumbing</th>
              <th>Ventilation / location</th>
            </tr>
          </thead>
          <tbody>
            {design.items
              .filter((i) => i.installation)
              .map((i) => {
                const s = i.installation,
                  p = profileFor(i);
                return (
                  <tr key={i.id}>
                    <td>
                      S{design.items.indexOf(i) + 1} · {i.sku}
                    </td>
                    <td>
                      {p ? <a href={p.source}>{p.name}</a> : 'Unverified demo'}
                      <br />
                      {s?.notes}
                    </td>
                    <td>
                      {s?.voltage || '?'} V / {s?.circuitAmps || '?'} A capacity
                    </td>
                    <td>
                      {s?.water} · drain {s?.drain ? 'recorded' : 'unknown'} ·{' '}
                      {s?.waterPressure ?? '?'} psi · loop {s?.drainRise ?? '?'}
                      ″
                    </td>
                    <td>
                      {s?.vent} · {s?.ductDiameter || '?'}″ /{' '}
                      {s?.ventCfm || '?'} CFM
                      <br />X {s?.serviceX ?? '?'} / Y {s?.serviceY ?? '?'} / Z{' '}
                      {s?.serviceZ ?? '?'}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        <h3>Outstanding installation checks</h3>
        {issues.length ? (
          issues.map((i) => <p key={i.id}>{i.message}</p>)
        ) : (
          <p>
            No conflicts in recorded checks. This does not certify installation
            or code compliance.
          </p>
        )}
      </section>
      <section className="print-sheet">
        <h2>A3 · Partitions & ceiling section</h2>
        {design.items
          .filter((i) => i.kind === 'partition')
          .map((p, n) => (
            <div key={p.id}>
              <h3>
                Partition {n + 1} · {p.width} W × {p.height} H × {p.depth} thick
              </h3>
              <svg
                viewBox={`-5 -8 ${p.width + 10} ${p.height + 16}`}
                style={{ width: '70%', maxHeight: 240 }}
              >
                {partitionPanels(p, design.items).map((r, i) => (
                  <rect
                    key={i}
                    x={r.x}
                    y={p.height - r.y - r.height}
                    width={r.width}
                    height={r.height}
                    fill="#eee"
                    stroke="#333"
                    strokeWidth=".4"
                  />
                ))}
                {design.items
                  .filter((i) => i.opening?.hostId === p.id)
                  .map((i) => (
                    <text
                      key={i.id}
                      x={(i.opening?.offset ?? 0) + i.width / 2}
                      y={p.height - (i.opening?.sill ?? 0) - i.height / 2}
                      fontSize="4"
                      textAnchor="middle"
                    >
                      {i.width} × {i.height} · sill {i.opening?.sill}
                    </text>
                  ))}
              </svg>
            </div>
          ))}
        <p>
          Ceiling:{' '}
          {design.room.ceiling?.kind === 'vault' ? 'vault' : 'flat / slope'} ·
          near/eave {design.room.height}″ ·{' '}
          {design.room.ceiling?.kind === 'vault' ? 'peak' : 'far end'}{' '}
          {design.room.ceiling?.endHeight ?? design.room.height}″
        </p>
        <svg
          viewBox={`-10 -10 ${sectionSpan + 20} ${Math.max(design.room.height, design.room.ceiling?.endHeight ?? 0) + 20}`}
          style={{ width: '70%', maxHeight: 220 }}
        >
          <polyline
            points={Array.from({ length: 65 }, (_, i) => {
              const x = (sectionSpan * i) / 64;
              return `${x},${Math.max(design.room.height, design.room.ceiling?.endHeight ?? 0) - ceilingAt(design.room, sectionAxis === 'x' ? x : design.room.width / 2, sectionAxis === 'y' ? x : design.room.depth / 2)}`;
            }).join(' ')}
            fill="none"
            stroke="#333"
            strokeWidth="1"
          />
        </svg>
        <p>
          Section along the ceiling slope axis, through the room center. Field
          verification, structural design, fastening and load calculations are
          excluded.
        </p>
      </section>
      <section className="print-sheet">
        <h2>F1 · Custom panel schedule</h2>
        <p>
          SHOP REVIEW REQUIRED. Finished panel dimensions below are millimeters.
          Use the manufacturing exports for raw blanks, banding allowances and
          configured machining. Machine-specific toolpaths and manufacturer
          cabinet internals are excluded.
        </p>
        <table>
          <thead>
            <tr>
              <th>Cabinet / part</th>
              <th>Qty</th>
              <th>Width × height × stock (mm)</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p, i) => (
              <tr key={i}>
                <td>
                  {p.sku} · {p.part}
                </td>
                <td>{p.quantity}</td>
                <td>
                  {[p.width, p.height, p.thickness]
                    .map((n) => (n * 25.4).toFixed(2))
                    .join(' × ')}
                </td>
                <td>{p.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {excluded.map((note, i) => (
          <p key={i}>{note}</p>
        ))}
      </section>
    </article>
  );
}
