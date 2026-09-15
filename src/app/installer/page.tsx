'use client';
import { useState } from 'react';
import type { Design } from '@/designer/model';
import { parseHandoff, siteReport } from '@/designer/installer-handoff';
import { SiteTasks } from '@/components/designer/installer-tools';
import { downloadJson } from '@/components/designer/business-tools';
export default function InstallerPage() {
  const [source, setSource] = useState<Design | null>(null),
    [design, setDesign] = useState<Design | null>(null),
    [message, setMessage] = useState('');
  return (
    <main className="client-review installer-page">
      <header>
        <p>Kitchen Studio · Site handoff</p>
        <h1>Installer workspace</h1>
        <p>
          Open the handoff file from your designer. Record wall questions and
          photos, then download a site report to return. Download before
          leaving: edits stay in this tab until exported.
        </p>
      </header>
      <label>
        Open installer handoff
        <input
          aria-label="Open installer handoff"
          type="file"
          accept=".json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              if (file.size > 600000)
                throw Error('Handoff must be smaller than 600 KB.');
              const result = parseHandoff(await file.text());
              setSource(result.design);
              setDesign(result.design);
              setMessage('Handoff opened.');
            } catch (error) {
              setMessage((error as Error).message);
            }
          }}
        />
      </label>
      <p role="status">{message}</p>
      {design && source && (
        <>
          <h2>{design.name}</h2>
          <p>
            {design.room.width} × {design.room.depth} × {design.room.height} in
            · {design.items.length} items
          </p>
          <div className="designer-row">
            <button
              onClick={() =>
                downloadJson(
                  siteReport(source, design),
                  'kitchen-site-report.json',
                )
              }
            >
              Download site report
            </button>
            <button onClick={() => window.print()}>Print site plan</button>
          </div>
          <SiteTasks design={design} onChange={setDesign} />
          <details>
            <summary>Item schedule</summary>
            {design.items.map((i, n) => (
              <p key={i.id}>
                {n + 1}. {i.sku} · {i.width} × {i.depth} × {i.height} in · X{' '}
                {i.x}, Y {i.y}, elevation {i.elevation}
              </p>
            ))}
          </details>
        </>
      )}
    </main>
  );
}
