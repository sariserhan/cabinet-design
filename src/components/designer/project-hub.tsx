'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { type Design } from '@/designer/model';
import { parsePriceBook } from '@/designer/supplier-pricing';
import {
  collectProjectBackup,
  parseProjectBackup,
  restoreProjectCopy,
  type ProjectBackup,
} from '@/designer/project-backup';
import { dashboardSummary } from '@/designer/project-dashboard';
import { canonical } from '@/designer/installer-handoff';
import {
  emptyCloseout,
  fieldPackage,
  mergeFieldReport,
  parseCloseout,
  type Closeout,
} from '@/designer/closeout';
import { directorySchema } from '@/designer/project-directory';
import {
  projectDataChanged,
  writeLocalBatch,
} from '@/designer/local-project-events';
import { downloadJson } from './business-tools';
import { ProductChecks } from './product-checks';
import { AftercareTools } from './aftercare-tools';
import { AssemblyLibrary } from './assembly-library';
import {
  emptySupport,
  parseSupport,
  type ProductSupport,
} from '@/designer/product-support';
import { SharedProjectRecords } from './shared-project-records';
import { GuidedWorkspace, SuggestedFixes } from './project-guidance';
import { InstallationSequence } from './installation-sequence';
import { PilotOutcomes } from './pilot-outcomes';
import { CatalogImpactTools } from './catalog-impact-tools';
import {
  emptyOperations,
  parseOperations,
  type Operations,
} from '@/designer/project-operations';
import { CloseoutTools } from './closeout-tools';
export function openProjectTool(label: string) {
  const target =
    label === 'canvas'
      ? document.getElementById('design-workspace')
      : label === 'overview'
        ? document.getElementById('project-dashboard')
        : Array.from(document.querySelectorAll('details')).find(
            (d) => d.querySelector(':scope > summary')?.textContent === label,
          );
  const stage =
    label === 'canvas'
      ? 'Design'
      : target
          ?.closest('[data-workflow-stage]')
          ?.getAttribute('data-workflow-stage');
  if (stage)
    window.dispatchEvent(
      new CustomEvent('kitchen-workflow-stage', { detail: stage }),
    );
  let ancestor: Element | null = target ?? null;
  while (ancestor) {
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
    ancestor = ancestor.parentElement;
  }
  requestAnimationFrame(() => {
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const focus =
      target instanceof HTMLDetailsElement
        ? target.querySelector('summary')
        : target;
    if (focus instanceof HTMLElement) focus.focus({ preventScroll: true });
  });
}
export function ProjectHub({
  design,
  ownerId,
  onRestore,
  onSharedLoad,
  onApply,
  selectedIds,
  onLocate,
}: {
  design: Design;
  ownerId: string;
  onRestore: (d: Design) => void;
  onSharedLoad: (d: Design) => void;
  onApply: (d: Design) => void;
  selectedIds: string[];
  onLocate: (id: string) => void;
}) {
  const books = useQuery(api.supplierPricing.list, {}),
    stored =
      books?.find((b) => b._id === design.supplierBookId) ??
      (!design.supplierBookId ? books?.[0] : undefined);
  const book = useMemo(
    () => (stored ? parsePriceBook(stored.priceBookJson) : undefined),
    [stored],
  );
  const [bundle, setBundle] = useState<ProjectBackup | null>(null),
    [epoch, setEpoch] = useState(0),
    [message, setMessage] = useState(''),
    [pending, setPending] = useState<ProjectBackup | null>(null),
    [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setEpoch((v) => v + 1);
    window.addEventListener('storage', refresh);
    window.addEventListener('kitchen-project-data', refresh);
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('kitchen-project-data', refresh);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    try {
      setBundle(collectProjectBackup(localStorage, ownerId, design, book));
    } catch (e) {
      setBundle(null);
      setMessage(
        `Could not read complete project records: ${(e as Error).message}. Existing records were retained.`,
      );
    }
  }, [design, ownerId, book, epoch]);
  const summary = bundle ? dashboardSummary(bundle, now) : null;
  function saveCloseout(next: Closeout) {
    if (!bundle) throw Error('Project records are not loaded.');
    const key = `kitchen-closeout:${ownerId}:${design.id}`,
      raw = localStorage.getItem(key),
      current = raw
        ? parseCloseout(raw, design.id, true)
        : emptyCloseout(design.id);
    if (canonical(current) !== canonical(bundle.closeout))
      throw Error('Closeout changed in another tab. Refresh before editing.');
    const checked = parseCloseout(JSON.stringify(next), design.id, true);
    localStorage.setItem(key, JSON.stringify(checked));
    setBundle({ ...bundle, closeout: checked });
    projectDataChanged();
  }
  function saveSupport(next: ProductSupport) {
    if (!bundle) throw Error('Project records are not loaded.');
    const key = `kitchen-product-support:${ownerId}:${design.id}`;
    const raw = localStorage.getItem(key);
    const current = raw
      ? parseSupport(raw, design.id, true)
      : emptySupport(design.id);
    if (
      canonical(current) !==
      canonical(bundle.support ?? emptySupport(design.id))
    )
      throw Error(
        'Product support changed in another tab. Refresh before editing.',
      );
    const checked = parseSupport(JSON.stringify(next), design.id, true);
    localStorage.setItem(key, JSON.stringify(checked));
    setBundle({ ...bundle, support: checked });
    projectDataChanged();
  }
  function saveOperations(next: Operations) {
    if (!bundle) throw Error('Project records are not loaded.');
    const key = `kitchen-operations:${ownerId}:${design.id}`;
    const current = parseOperations(
      localStorage.getItem(key) ?? JSON.stringify(emptyOperations(design.id)),
      design.id,
    );
    if (
      canonical(current) !==
      canonical(bundle.operations ?? emptyOperations(design.id))
    )
      throw Error('Operations changed in another tab. Refresh before editing.');
    const checked = parseOperations(JSON.stringify(next), design.id);
    localStorage.setItem(key, JSON.stringify(checked));
    setBundle({ ...bundle, operations: checked });
    projectDataChanged();
  }
  function restore() {
    if (!pending) return;
    try {
      const b = restoreProjectCopy(pending);
      const id = b.design.id;
      const directory = directorySchema.parse(
        JSON.parse(
          localStorage.getItem(`kitchen-directory:${ownerId}`) ?? '{}',
        ),
      );
      const updatedDirectory = directorySchema.parse({
        ...directory,
        [id]: b.organization,
      });
      const entries: [string, string][] = [
        [
          `kitchen-project-history:${ownerId}:${id}`,
          JSON.stringify({
            format: 'kitchen-milestones-v1',
            designId: id,
            entries: b.history,
          }),
        ],
        [`kitchen-purchasing:${ownerId}:${id}`, JSON.stringify(b.purchasing)],
        [`kitchen-closeout:${ownerId}:${id}`, JSON.stringify(b.closeout)],
        [`kitchen-directory:${ownerId}`, JSON.stringify(updatedDirectory)],
        [`kitchen-studio:${ownerId}:draft`, JSON.stringify(b.design)],
      ];
      if (b.operations)
        entries.push([
          `kitchen-operations:${ownerId}:${id}`,
          JSON.stringify(b.operations),
        ]);
      if (b.support)
        entries.push([
          `kitchen-product-support:${ownerId}:${id}`,
          JSON.stringify(b.support),
        ]);
      if (b.priceBook)
        entries.push([
          `kitchen-restored-price:${ownerId}:${id}`,
          JSON.stringify(b.priceBook),
        ]);
      writeLocalBatch(localStorage, entries);
      setPending(null);
      onRestore(b.design);
      projectDataChanged();
    } catch (e) {
      setMessage(
        `Restore failed: ${(e as Error).message}. The original project is retained.`,
      );
    }
  }
  return (
    <section
      className="project-hub"
      aria-label="Project dashboard"
      id="project-dashboard"
      tabIndex={-1}
    >
      <header>
        <div>
          <small>PROJECT OVERVIEW</small>
          <h2>{design.name}</h2>
        </div>
        <button onClick={() => setEpoch((v) => v + 1)}>
          Refresh project overview
        </button>
      </header>
      {bundle && <GuidedWorkspace bundle={bundle} onOpen={openProjectTool} />}
      {summary && (
        <>
          <p>
            <strong>Next action:</strong> {summary.next.title}{' '}
            <button onClick={() => openProjectTool(summary.next.target)}>
              Go to next action
            </button>
          </p>
          <div className="project-hub-cards">
            {summary.rows.map((r) => (
              <button key={r.id} onClick={() => openProjectTool(r.target)}>
                <strong>{r.count}</strong>
                <span>{r.title}</span>
                <small>{r.detail}</small>
              </button>
            ))}
          </div>
          <p>
            Counts include all saved purchase drafts. Captured approvals are
            historical evidence. Refresh source reviews when approval status
            needs rechecking.
          </p>
        </>
      )}
      <p role="status">{message}</p>
      <details className="business-panel">
        <summary>Complete project backup</summary>
        <p>
          One file includes the current design, selections, site photos, local
          revision history, purchasing and supplier records, closeout,
          organization, product checks, aftercare, project assembly templates,
          installation sequences, catalog comparisons, pilot observations and a
          supplier price reference. Cloud-only revisions and catalog source
          documents are not included.
        </p>
        <div className="designer-row">
          <button
            disabled={!bundle}
            onClick={() => {
              try {
                downloadJson(
                  collectProjectBackup(localStorage, ownerId, design, book),
                  'complete-project-backup.json',
                );
                setMessage('Complete project backup exported.');
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            Export complete project
          </button>
          <label>
            Restore complete project
            <input
              type="file"
              accept=".json"
              aria-label="Restore complete project"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  if (f.size > 6000000) throw Error('Backup exceeds 6 MB.');
                  setPending(parseProjectBackup(await f.text()));
                  setMessage(
                    'Backup validated. Review the contents before restoring a separate copy.',
                  );
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            />
          </label>
        </div>
        {pending && (
          <section className="purchase-card">
            <h3>Restore {pending.design.name}</h3>
            <p>
              {pending.design.items.length} design items ·{' '}
              {pending.history.length} milestones ·{' '}
              {pending.purchasing.purchases.length} purchase drafts ·{' '}
              {pending.closeout.tasks.length} closeout items
            </p>
            <p>
              Restore creates a separate local project. Imported approval and
              completion claims must be reverified. The supplier list is
              preserved as a downloadable reference; import it into Supplier
              quotes to use it for new pricing.
            </p>
            <button onClick={restore}>Restore as separate project</button>
            <button onClick={() => setPending(null)}>Cancel restore</button>
          </section>
        )}
        {bundle?.priceBook && (
          <button
            onClick={() =>
              downloadJson(bundle.priceBook, 'project-supplier-prices.json')
            }
          >
            Export bundled supplier prices
          </button>
        )}
        {bundle && (
          <p>
            Organization: {bundle.organization.client || 'No client'} ·{' '}
            {bundle.organization.room || 'No room label'} ·{' '}
            {bundle.organization.tags || 'No tags'}
          </p>
        )}
      </details>
      {bundle && (
        <>
          <SharedProjectRecords
            ownerId={ownerId}
            bundle={bundle}
            getCurrent={() =>
              collectProjectBackup(localStorage, ownerId, design, book)
            }
            onLoad={(incoming, binding) => {
              const b = parseProjectBackup(JSON.stringify(incoming));
              const id = b.design.id;
              delete b.design.supplierBookId;
              const entries: [string, string | null][] = [
                [`kitchen-shared:${ownerId}:${id}`, JSON.stringify(binding)],
                [
                  `kitchen-purchasing:${ownerId}:${id}`,
                  JSON.stringify(b.purchasing),
                ],
                [
                  `kitchen-closeout:${ownerId}:${id}`,
                  JSON.stringify(b.closeout),
                ],
                [
                  `kitchen-product-support:${ownerId}:${id}`,
                  JSON.stringify(b.support ?? emptySupport(id)),
                ],
                [
                  `kitchen-operations:${ownerId}:${id}`,
                  JSON.stringify(b.operations ?? emptyOperations(id)),
                ],
                [
                  `kitchen-project-history:${ownerId}:${id}`,
                  JSON.stringify({
                    format: 'kitchen-milestones-v1',
                    designId: id,
                    entries: b.history,
                  }),
                ],
                [`kitchen-studio:${ownerId}:draft`, JSON.stringify(b.design)],
              ];
              const directory = directorySchema.parse(
                JSON.parse(
                  localStorage.getItem(`kitchen-directory:${ownerId}`) ?? '{}',
                ),
              );
              entries.push([
                `kitchen-directory:${ownerId}`,
                JSON.stringify(
                  directorySchema.parse({ ...directory, [id]: b.organization }),
                ),
              ]);
              entries.push([
                `kitchen-restored-price:${ownerId}:${id}`,
                b.priceBook ? JSON.stringify(b.priceBook) : null,
              ]);
              writeLocalBatch(localStorage, entries);
              onSharedLoad(b.design);
              projectDataChanged();
            }}
          />
          <SuggestedFixes design={design} onApply={onApply} />
          <CatalogImpactTools
            design={design}
            value={bundle.operations ?? emptyOperations(design.id)}
            onChange={saveOperations}
            onLocate={onLocate}
          />
          <InstallationSequence
            bundle={bundle}
            value={bundle.operations ?? emptyOperations(design.id)}
            onChange={saveOperations}
          />
          <PilotOutcomes
            value={bundle.operations ?? emptyOperations(design.id)}
            onChange={saveOperations}
          />
          <ProductChecks
            design={design}
            value={bundle.support ?? emptySupport(design.id)}
            onChange={saveSupport}
            onLocate={onLocate}
          />
          <AssemblyLibrary
            design={design}
            ownerId={ownerId}
            selectedIds={selectedIds}
            attached={bundle.support?.assemblies ?? []}
            onAttach={(assemblies) =>
              saveSupport({
                ...(bundle.support ?? emptySupport(design.id)),
                assemblies,
              })
            }
            onApply={onApply}
          />
          <AftercareTools
            design={design}
            value={bundle.support ?? emptySupport(design.id)}
            onChange={saveSupport}
          />
        </>
      )}
      {bundle && (
        <CloseoutTools
          design={design}
          value={bundle.closeout}
          onChange={saveCloseout}
        />
      )}
      <details className="business-panel">
        <summary>Offline field workspace</summary>
        <p>
          Download a field package, open the field workspace while online, and
          import the package there. Wait for “Ready offline” before leaving.
          Findings stay on that device; export a return report and import it
          here to transfer them. Cloud synchronization is not automatic.
        </p>
        <div className="designer-row">
          <button
            disabled={!bundle}
            onClick={() => {
              try {
                if (bundle)
                  downloadJson(
                    fieldPackage(design, bundle.closeout, bundle.purchasing),
                    'kitchen-field-package.json',
                  );
              } catch (error) {
                setMessage((error as Error).message);
              }
            }}
          >
            Download field package
          </button>
          <a href="/field/index.html" target="_blank" rel="noreferrer">
            Open offline field workspace
          </a>
          <label>
            Import field return report
            <input
              aria-label="Import field return report"
              type="file"
              accept=".json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f || !bundle) return;
                try {
                  if (f.size > 2300000)
                    throw Error('Field report exceeds 2.3 MB.');
                  saveCloseout(
                    mergeFieldReport(await f.text(), design, bundle.closeout),
                  );
                  setMessage(
                    'Field findings imported into this browser. Include them in your next complete project backup.',
                  );
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            />
          </label>
        </div>
      </details>
    </section>
  );
}
