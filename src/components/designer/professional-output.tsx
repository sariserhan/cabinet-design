'use client';
import { useEffect, useState } from 'react';
import { type Design } from '@/designer/model';
import {
  drawingOptionsSchema,
  drawingPackageHtml,
  drawingItemCsv,
  drawingRows,
  drawingReference,
  type DrawingOptions,
} from '@/designer/drawing-package';
import { downloadJson } from './business-tools';
export function ProfessionalOutput({
  design,
  ownerId,
}: {
  design: Design;
  ownerId: string;
}) {
  const [options, setOptions] = useState<DrawingOptions>({
      company: '',
      client: design.quote?.customer ?? '',
      reference: 'KITCHEN-001',
      revision: 'A',
      preparedBy: '',
      date: new Date().toISOString().slice(0, 10),
      purpose: 'Dealer review',
      unit: 'in',
      scale: 25,
      notes: '',
    }),
    [message, setMessage] = useState('');
  const key = `kitchen-drawing-options:${ownerId}:${design.id}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setOptions(drawingOptionsSchema.parse(JSON.parse(raw)));
    } catch {
      setMessage(
        'Saved drawing settings could not be loaded. Enter the issue details again.',
      );
    }
  }, [key]);
  function prepare() {
    const checked = drawingOptionsSchema.parse(options);
    localStorage.setItem(key, JSON.stringify(checked));
    return checked;
  }
  function download(text: string, name: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type })),
      a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <details className="business-panel support-panel professional-output" open>
      <summary>Drawings & item list</summary>
      <p>
        Prepare a matching set of plans, elevations, placement schedules and
        grouped quantities. Each sheet carries the same revision and design
        fingerprint. These are coordination drafts until the site and
        manufacturer details are verified.
      </p>
      <div className="business-grid">
        {(
          [
            ['company', 'Company'],
            ['client', 'Client'],
            ['reference', 'Drawing reference'],
            ['revision', 'Drawing revision'],
            ['preparedBy', 'Prepared by'],
          ] as const
        ).map(([field, label]) => (
          <label key={field}>
            {label}
            <input
              aria-label={label}
              value={options[field]}
              maxLength={
                field === 'revision'
                  ? 40
                  : field === 'reference'
                    ? 80
                    : field === 'preparedBy'
                      ? 120
                      : 160
              }
              onChange={(e) =>
                setOptions({ ...options, [field]: e.target.value })
              }
            />
          </label>
        ))}
        <label>
          Issue date
          <input
            aria-label="Drawing issue date"
            type="date"
            value={options.date}
            onChange={(e) => setOptions({ ...options, date: e.target.value })}
          />
        </label>
        <label>
          Purpose
          <select
            aria-label="Drawing purpose"
            value={options.purpose}
            onChange={(e) =>
              setOptions({
                ...options,
                purpose: e.target.value as DrawingOptions['purpose'],
              })
            }
          >
            {[
              'Client review',
              'Dealer review',
              'Installation coordination',
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Dimensions
          <select
            aria-label="Drawing units"
            value={options.unit}
            onChange={(e) =>
              setOptions({
                ...options,
                unit: e.target.value as DrawingOptions['unit'],
              })
            }
          >
            <option value="in">Inches</option>
            <option value="mm">Millimeters</option>
          </select>
        </label>
        <label>
          A3 drawing scale
          <select
            aria-label="Drawing scale"
            value={options.scale}
            onChange={(e) =>
              setOptions({
                ...options,
                scale: Number(e.target.value) as DrawingOptions['scale'],
              })
            }
          >
            {[20, 24, 25, 48, 50, 100].map((n) => (
              <option value={n} key={n}>
                1:{n}
                {n === 24 ? ' (½ in = 1 ft)' : n === 48 ? ' (¼ in = 1 ft)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Issue notes
        <textarea
          aria-label="Drawing issue notes"
          value={options.notes}
          maxLength={3000}
          onChange={(e) => setOptions({ ...options, notes: e.target.value })}
        />
      </label>
      <div className="designer-row">
        <button
          onClick={() => {
            try {
              const checked = prepare();
              download(
                drawingPackageHtml(design, checked),
                'kitchen-drawing-package.html',
                'text/html',
              );
              setMessage(
                'Drawing package exported. Open it and print A3 landscape at 100% / actual size.',
              );
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          Export drawing package / PDF
        </button>
        <button
          onClick={() => {
            try {
              download(
                drawingItemCsv(design),
                'kitchen-item-list.csv',
                'text/csv',
              );
              setMessage(
                'Grouped item list exported. Dimensions in this CSV are inches.',
              );
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          Export dealer item list CSV
        </button>
        <button
          onClick={() => {
            try {
              const checked = prepare();
              downloadJson(
                {
                  format: 'kitchen-drawing-issue-v1',
                  options: checked,
                  snapshot: drawingReference(design),
                  design,
                  items: drawingRows(design),
                },
                'kitchen-drawing-issue.json',
              );
              setMessage(
                'Matching design snapshot and item references exported.',
              );
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          Export matching design snapshot
        </button>
      </div>
      <p>
        Curved walls receive a wall schedule; straight elevations are not
        invented for them. Verify the printed 100 mm calibration line before
        measuring a sheet. CSV quantities exclude room openings.
      </p>
      <p role="status">{message}</p>
    </details>
  );
}
