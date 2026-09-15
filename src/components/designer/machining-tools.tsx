'use client';
import type { Design } from '@/designer/model';
import { OptionNumber } from './demo-options';
import {
  machiningSettings,
  machiningParts,
  nestPanels,
  machiningDxf,
  nestingDxf,
  manufacturingCsv,
} from '@/designer/machining';
function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function MachiningTools({
  design,
  onChange,
}: {
  design: Design;
  onChange: (design: Design) => void;
}) {
  const s = machiningSettings(design),
    parts = machiningParts(design),
    nest = nestPanels(design);
  const change = (patch: Partial<typeof s>) =>
    onChange({ ...design, fabrication: { ...s, ...patch } });
  return (
    <details className="demo-options machining-tools">
      <summary>Joinery, drilling & sheet nesting</summary>
      <p className="designer-muted">
        Custom cabinets only. Blank sizes account for edge banding. Drilling is
        a user-defined template, not a verified hardware specification. Confirm
        faces, depths and hardware before machining; exports contain geometry,
        not machine toolpaths.
      </p>
      <label className="designer-numeric">
        <span>Case joint</span>
        <select
          aria-label="Case joint"
          value={s.joinery}
          onChange={(e) =>
            change({ joinery: e.target.value as 'butt' | 'rabbet' })
          }
        >
          <option value="butt">Butt joint</option>
          <option value="rabbet">Housed top/bottom rabbets</option>
        </select>
      </label>
      {s.joinery === 'rabbet' && (
        <OptionNumber
          label="Rabbet depth (in)"
          max={s.thickness / 2}
          value={s.rebate}
          onChange={(rebate) => change({ rebate })}
        />
      )}
      <OptionNumber
        label="Edge band thickness (mm)"
        max={3}
        value={s.edgeBandMm}
        onChange={(edgeBandMm) => change({ edgeBandMm })}
      />
      <details>
        <summary>Drilling template</summary>
        <label>
          <input
            type="checkbox"
            checked={s.drilling}
            onChange={(e) => change({ drilling: e.target.checked })}
          />{' '}
          Enable drilling template
        </label>
        {(
          [
            ['cupDiameterMm', 'Hinge cup diameter (mm)', 20, 40],
            ['cupEdgeMm', 'Cup edge distance (mm)', 2, 8],
            ['cupEndMm', 'Hinge end setback (mm)', 50, 200],
            ['drillDepthMm', 'Bore depth (mm)', 2, 15],
            ['shelfPitchMm', 'Shelf hole pitch (mm)', 16, 64],
            ['shelfSetbackMm', 'Shelf row setback (mm)', 20, 75],
          ] as const
        ).map(([key, label, min, max]) => (
          <OptionNumber
            key={key}
            label={label}
            min={min}
            max={max}
            value={s[key]}
            onChange={(value) => change({ [key]: value })}
          />
        ))}
        <p className="designer-muted">
          Two hinge cups per slab door, mirrored for paired doors. Side-panel
          shelf bores are 5 mm. Hinge fixing screws, handle holes and drawer
          slides are excluded.
        </p>
      </details>
      <details open>
        <summary>Sheet layout</summary>
        <OptionNumber
          label="Sheet width (in)"
          min={12}
          max={120}
          value={s.sheetWidth}
          onChange={(sheetWidth) => change({ sheetWidth })}
        />
        <OptionNumber
          label="Sheet height (in)"
          min={12}
          max={144}
          value={s.sheetHeight}
          onChange={(sheetHeight) => change({ sheetHeight })}
        />
        <OptionNumber
          label="Cut gap / kerf (in)"
          min={0.01}
          max={0.5}
          value={s.kerf}
          onChange={(kerf) => change({ kerf })}
        />
        <label>
          <input
            type="checkbox"
            checked={s.allowRotate}
            onChange={(e) => change({ allowRotate: e.target.checked })}
          />{' '}
          Allow 90° rotation (ignore grain)
        </label>
        <p>
          {nest.sheets.length} sheets · {(nest.utilization * 100).toFixed(1)}%
          material utilization · {nest.unplaced.length} oversized blanks
        </p>
        <p className="designer-muted">
          Shelf packing keeps stock thickness and door material separate.
          Default orientation preserves panel-height grain direction. This is a
          layout estimate, not an optimal nesting guarantee.
        </p>
        <div className="sheet-previews">
          {nest.sheets.map((sheet) => (
            <figure key={sheet.id}>
              <figcaption>
                Sheet {sheet.id} · {sheet.material} ·{' '}
                {(sheet.thickness * 25.4).toFixed(2)} mm
              </figcaption>
              <svg
                aria-label={`Nested sheet ${sheet.id}`}
                viewBox={`-1 -1 ${s.sheetWidth + 2} ${s.sheetHeight + 2}`}
              >
                <rect
                  width={s.sheetWidth}
                  height={s.sheetHeight}
                  fill="#f5ecdb"
                  stroke="#9a825e"
                  strokeWidth=".3"
                />
                {sheet.placements.map((p) => (
                  <g key={p.panel.id}>
                    <rect
                      x={p.x}
                      y={p.y}
                      width={p.width}
                      height={p.height}
                      fill="#bdcfd2"
                      stroke="#547d84"
                      strokeWidth=".2"
                    />
                    <text x={p.x + 0.5} y={p.y + 2} fontSize="1.4">
                      {p.panel.id}
                      {p.rotated ? ' ↻' : ''}
                    </text>
                  </g>
                ))}
              </svg>
            </figure>
          ))}
        </div>
      </details>
      <div className="designer-row">
        <button
          disabled={!parts.panels.length}
          onClick={() =>
            download(
              manufacturingCsv(design),
              'manufacturing-blanks-mm.csv',
              'text/csv',
            )
          }
        >
          Manufacturing CSV
        </button>
        <button
          disabled={!parts.panels.length}
          onClick={() =>
            download(
              machiningDxf(design),
              'panel-machining-mm.dxf',
              'application/dxf',
            )
          }
        >
          Drilling & joint DXF
        </button>
        <button
          disabled={!nest.sheets.length}
          onClick={() =>
            download(
              nestingDxf(design),
              'nested-sheets-mm.dxf',
              'application/dxf',
            )
          }
        >
          Nested sheets DXF
        </button>
        <button
          onClick={() =>
            download(
              JSON.stringify(
                { units: 'inches', settings: s, ...parts, nesting: nest },
                null,
                2,
              ),
              'manufacturing-report.json',
              'application/json',
            )
          }
        >
          Manufacturing report
        </button>
      </div>
      {(parts.issues.length > 0 || nest.unplaced.length > 0) && (
        <div role="status">
          <strong>Review / excluded operations</strong>
          {parts.issues.map((issue, i) => (
            <p key={i}>{issue}</p>
          ))}
          {nest.unplaced.map((p) => (
            <p key={p.id}>
              {p.id}: {p.width.toFixed(2)} × {p.height.toFixed(2)}″ does not fit
              the selected sheet.
            </p>
          ))}
        </div>
      )}
    </details>
  );
}
