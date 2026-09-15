'use client';
import { isPublicRecord } from '@/designer/public-catalogs';
import { useEffect, useMemo, useState } from 'react';
import { useConvex, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import {
  type Design,
  type Cabinet,
  designSchema,
  normalizeOpenings,
  updateAssembly,
} from '@/designer/model';
import {
  changeImpact,
  explainedChecks,
  pricedProposals,
  sourceLink,
  storageRecommendations,
  storageSummary,
  type CatalogChoice,
} from '@/designer/design-decisions';
import { parsePriceBook, supplierQuote } from '@/designer/supplier-pricing';
import {
  defaultStorageProfile,
  type StorageProfile,
} from '@/designer/decision-schema';
import { lockViolation } from '@/designer/studio-tools';
import { placementBlock } from '@/designer/refinements';
import { money } from '@/designer/quote';
import { proposalDocument } from '@/designer/proposal-document';
import { MiniPlan } from './workflow-tools';
import { ClientSelectionBoard } from './selection-board';
import { InstallerTools } from './installer-tools';
import { downloadJson } from './business-tools';

type Pending = {
  requiresPrices: boolean;
  source: string;
  prices: string;
  design: Design;
  label: string;
};
type Evidence = CatalogChoice & { revision: number; evidenceJson: string };
export function DesignDecisions(props: {
  design: Design;
  versionId?: string;
  onChange: (d: Design) => void;
  onLocate: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="business-panel design-decisions"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Design decisions · budget, checks & site handoff</summary>
      {open && <DecisionWorkspace key={props.design.id} {...props} />}
    </details>
  );
}
function DecisionWorkspace({
  design,
  versionId,
  onChange,
  onLocate,
}: {
  design: Design;
  versionId?: string;
  onChange: (d: Design) => void;
  onLocate: (id: string) => void;
}) {
  const client = useConvex();
  const books = useQuery(api.supplierPricing.list, {});
  const [tab, setTab] = useState('checks'),
    [message, setMessage] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [target, setTarget] = useState(''),
    [keepDrawers, setKeepDrawers] = useState(true),
    [protectedIds, setProtectedIds] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<{
      version: string;
      rows: CatalogChoice[];
      cursor: string | null;
      done: boolean;
    } | null>(null),
    [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    source: string;
    prices: string;
    value: ReturnType<typeof pricedProposals>;
  } | null>(null);
  const stored =
    books?.find((b) => b._id === design.supplierBookId) ??
    (!design.supplierBookId ? books?.[0] : undefined);
  const book = useMemo(
    () => (stored ? parsePriceBook(stored.priceBookJson) : undefined),
    [stored],
  );
  const json = JSON.stringify(design),
    priceStamp = stored
      ? `${stored._id}:${stored.revision}:${stored.priceBookJson}`
      : '';
  const evidenceIds = design.items
    .filter((i) => i.kind === 'cabinet' && i.recordId)
    .map((i) => i.recordId);
  const evidenceKey = JSON.stringify([...new Set(evidenceIds)]);
  const [evidenceState, setEvidenceState] = useState<{
    key: string;
    rows: Evidence[];
  } | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    const ids = JSON.parse(evidenceKey) as string[];
    void Promise.all(
      ids.map(async (recordId) => {
        if (isPublicRecord(recordId)) return null;
        try {
          const result = JSON.parse(
            await client.query(api.workspace.record, {
              recordId: recordId as Id<'records'>,
            }),
          ) as { record: Evidence };
          return result.record;
        } catch {
          return null;
        }
      }),
    ).then((rows) => {
      if (active)
        setEvidenceState({
          key: evidenceKey,
          rows: rows.filter((r): r is Evidence => r !== null),
        });
    });
    return () => {
      active = false;
    };
  }, [client, evidenceKey, refresh]);
  const evidence = evidenceState?.key === evidenceKey ? evidenceState.rows : [];
  const available = catalog?.version === versionId ? catalog : null;
  const checks = useMemo(() => explainedChecks(design), [design]);
  function stage(next: Design, label: string, requiresPrices = false) {
    try {
      const parsed = designSchema.parse(normalizeOpenings(next));
      setPending({
        source: json,
        prices: priceStamp,
        design: parsed,
        label,
        requiresPrices,
      });
      setMessage('Review the change impact before applying.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  const validPending =
    pending?.source === json && pending.prices === priceStamp;
  const impact = pending ? changeImpact(design, pending.design, book) : null;
  const blocked = pending
    ? lockViolation(design, pending.design)
      ? 'Unlock affected items before applying.'
      : placementBlock(design, pending.design)
    : null;
  const validResults =
    results?.source === json && results.prices === priceStamp
      ? results.value
      : null;
  function generate() {
    try {
      if (!book)
        throw Error('Import supplier prices under Supplier quotes first.');
      const dollars = Number(target);
      if (target !== '' && (!Number.isFinite(dollars) || dollars < 0))
        throw Error('Enter a non-negative budget in USD.');
      const value = pricedProposals(design, book, available?.rows ?? [], {
        preserveDrawers: keepDrawers,
        protectedIds,
        ...(target !== '' ? { target: Math.round(dollars * 100) } : {}),
      });
      setResults({ source: json, prices: priceStamp, value });
      setMessage(
        'Compared exact priced variants. Duplicate or infeasible tiers are omitted.',
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <div className="decision-workspace">
      <div
        className="decision-tabs"
        role="tablist"
        aria-label="Design decision tools"
      >
        {[
          ['checks', 'Explain checks'],
          ['budget', 'Budget & proposals'],
          ['impact', 'Preview a change'],
          ['storage', 'Storage planning'],
          ['site', 'Installer handoff'],
          ['selections', 'Client selections'],
        ].map(([key, label]) => (
          <button
            role="tab"
            aria-selected={tab === key}
            aria-controls={`decision-${key}`}
            id={`tab-${key}`}
            key={key}
            onClick={() => setTab(key ?? 'checks')}
          >
            {label}
          </button>
        ))}
      </div>
      <p role="status">{message}</p>
      {pending && (
        <section
          className="decision-preview"
          aria-label="Change impact preview"
        >
          <h3>{pending.label}</h3>
          <div className="business-grid">
            <div>
              <h4>Current</h4>
              <MiniPlan
                design={design}
                highlightedIds={impact?.affected ?? []}
              />
            </div>
            <div>
              <h4>Proposed</h4>
              <MiniPlan
                design={pending.design}
                highlightedIds={impact?.affected ?? []}
              />
            </div>
          </div>
          {impact && (
            <>
              <p>
                {impact.changed.length} changed items · {impact.affected.length}{' '}
                affected items · {impact.added.length} new checks ·{' '}
                {impact.resolved.length} resolved checks
              </p>
              {impact.roomChanged && (
                <p>
                  Room geometry changes; recheck measurements and site
                  connections.
                </p>
              )}
              <div className="decision-pills">
                {impact.affected.map((id) => (
                  <button key={id} onClick={() => onLocate(id)}>
                    {design.items.find((i) => i.id === id)?.sku ??
                      pending.design.items.find((i) => i.id === id)?.sku ??
                      'Removed item'}
                  </button>
                ))}
              </div>
              <p>
                {impact.quoteBefore !== null && impact.quoteAfter !== null
                  ? `Quote: ${money(impact.quoteBefore)} → ${money(impact.quoteAfter)} (${money(impact.quoteAfter - impact.quoteBefore)} change)`
                  : 'Quote impact unavailable until both designs have complete, current supplier prices.'}
              </p>
              {impact.missingPrices.length > 0 && (
                <p>Needs new prices: {impact.missingPrices.join(', ')}</p>
              )}
              <p>
                Existing client approvals cover their saved snapshots. Apply
                this change, then create a new link under Cloud projects &
                client reviews to request approval for the revised design.
              </p>
              <ul>
                {impact.added.map((w) => (
                  <li key={w.id}>{w.message}</li>
                ))}
              </ul>
              <details>
                <summary>Changed item details</summary>
                {impact.changed.map((id) => {
                  const a = design.items.find((i) => i.id === id),
                    b = pending.design.items.find((i) => i.id === id);
                  return (
                    <p key={id}>
                      {a?.sku ?? 'New'} → {b?.sku ?? 'Removed'} · position{' '}
                      {a ? `${a.x}, ${a.y}` : '—'} →{' '}
                      {b ? `${b.x}, ${b.y}` : '—'} · front{' '}
                      {a?.frontStyle ?? '—'} → {b?.frontStyle ?? '—'} · finish{' '}
                      {a?.finish ?? design.finish} →{' '}
                      {b?.finish ?? pending.design.finish}
                    </p>
                  );
                })}
              </details>
            </>
          )}
          {!validPending && (
            <p role="alert">
              Design or supplier prices changed. Preview the change again.
            </p>
          )}
          {blocked && <p role="alert">{blocked}</p>}
          <div className="designer-row">
            <button
              disabled={!validPending || !!blocked}
              onClick={() => {
                if (!validPending || blocked) return;
                if (
                  pending.requiresPrices &&
                  (!book || supplierQuote(pending.design, book).total === null)
                ) {
                  setMessage(
                    'Supplier prices are incomplete or expired. Import current prices and preview again.',
                  );
                  return;
                }
                onChange(pending.design);
                setPending(null);
                setResults(null);
                setMessage(
                  'Change applied. Undo restores the previous design. Create a new client review link for approval.',
                );
              }}
            >
              Apply reviewed change
            </button>
            <button onClick={() => setPending(null)}>Discard preview</button>
          </div>
        </section>
      )}
      <section
        role="tabpanel"
        id={`decision-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === 'checks' && (
          <>
            <h3>Understand each check</h3>
            <p>
              Geometry checks use the current drawing. Manufacturer facts retain
              their own review status; a clear layout does not approve catalog
              data.
            </p>
            {checks.length === 0 && (
              <p>No current geometry or installation warnings.</p>
            )}
            {checks.map((check) => (
              <article className="decision-card" key={check.id}>
                <h4>{check.message}</h4>
                <p>
                  <strong>Basis:</strong> {check.basis}
                </p>
                <p>
                  <strong>Next step:</strong> {check.fix}
                </p>
                {check.items.map((i) => (
                  <button key={i.id} onClick={() => onLocate(i.id)}>
                    Locate {i.sku}
                  </button>
                ))}
                {check.sources.map((s) => (
                  <p key={s.href}>
                    <a href={s.href} target="_blank" rel="noreferrer">
                      {s.label} source
                    </a>{' '}
                    · {s.note}
                  </p>
                ))}
              </article>
            ))}
            <h3>Catalog evidence & missing information</h3>
            <button
              onClick={() => {
                setEvidenceState(null);
                setRefresh((n) => n + 1);
              }}
            >
              Refresh source evidence
            </button>
            <p>
              Source status is retrieved when this panel opens. Refresh after
              completing source review.
            </p>
            {evidenceState?.key !== evidenceKey && (
              <p>Loading source records…</p>
            )}
            {design.items
              .filter((i) => i.kind === 'cabinet')
              .map((i) => {
                const r = evidence.find(
                  (r) => r._id === i.recordId && r.versionId === i.versionId,
                );
                const mismatch =
                  r &&
                  (r.width !== i.width ||
                    r.depth !== i.depth ||
                    r.height !== i.height);
                return (
                  <article className="decision-card" key={i.id}>
                    <h4>{i.sku}</h4>
                    <p>
                      {r
                        ? `Source revision ${r.revision} · ${r.reviewStatus} · ${r.truthVerified ? 'Human verification recorded' : 'Human verification pending'}`
                        : 'Source record unavailable for this account.'}
                    </p>
                    {mismatch && (
                      <p role="alert">
                        Placed dimensions differ from the source. Reconcile the
                        cabinet before ordering.
                      </p>
                    )}
                    {r && (
                      <>
                        <p>
                          {r.blockers.length
                            ? r.blockers.join(', ')
                            : 'No stored field blockers.'}
                        </p>
                        <p>
                          Source page {r.pageNumber}.{' '}
                          {r.truthVerified &&
                          r.reviewStatus === 'approved' &&
                          !r.blockers.length
                            ? 'Reviewed record; confirm configuration availability.'
                            : 'Next step: obtain missing manufacturer evidence and complete source review.'}
                        </p>
                        <a href={sourceLink(i)}>
                          Open manufacturer page & source review
                        </a>
                        <details>
                          <summary>Recorded evidence</summary>
                          <pre className="decision-evidence">
                            {r.evidenceJson}
                          </pre>
                        </details>
                      </>
                    )}
                    <button onClick={() => onLocate(i.id)}>
                      Locate {i.sku}
                    </button>
                  </article>
                );
              })}
          </>
        )}
        {tab === 'budget' && (
          <>
            <h3>Design to a budget</h3>
            <p>
              Compare exact priced finishes and configurations. Alternate SKUs
              require a human-verified, approved record in the same catalog,
              category and dimensions. Locked items and their assemblies stay
              fixed; appliances and islands are retained.
            </p>
            <label>
              Price source
              <select
                aria-label="Decision price source"
                value={stored?._id ?? ''}
                onChange={(e) =>
                  onChange({ ...design, supplierBookId: e.target.value })
                }
              >
                <option value="" disabled>
                  Choose supplier
                </option>
                {books?.map((b) => (
                  <option key={b._id} value={b._id}>
                    {parsePriceBook(b.priceBookJson).supplier} · revision{' '}
                    {b.revision}
                  </option>
                ))}
              </select>
            </label>
            <div className="business-grid">
              <label>
                Total budget (USD)
                <input
                  aria-label="Total budget (USD)"
                  type="number"
                  min="0"
                  value={target}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    setResults(null);
                  }}
                  placeholder="Optional"
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={keepDrawers}
                  onChange={(e) => {
                    setKeepDrawers(e.target.checked);
                    setResults(null);
                  }}
                />
                Keep existing drawer / pull-out storage
              </label>
            </div>
            <details>
              <summary>Protect specific items</summary>
              {design.items.map((i, n) => (
                <label className="decision-check" key={i.id}>
                  <input
                    type="checkbox"
                    checked={protectedIds.includes(i.id)}
                    onChange={(e) => {
                      setProtectedIds(
                        e.target.checked
                          ? [...protectedIds, i.id]
                          : protectedIds.filter((id) => id !== i.id),
                      );
                      setResults(null);
                    }}
                  />
                  {n + 1}. {i.sku}
                </label>
              ))}
            </details>
            <p>
              {available?.rows.length ?? 0} catalog candidates loaded.{' '}
              {available?.done
                ? 'All candidates loaded.'
                : 'Same-SKU variants can be compared now; load catalog pages for substitutions.'}
            </p>
            <button
              disabled={!versionId || loading || available?.done}
              onClick={async () => {
                if (!versionId) return;
                setLoading(true);
                try {
                  const raw = await client.query(api.workspace.browseCatalog, {
                    versionId: versionId as Id<'versions'>,
                    offset: available?.rows.length ?? 0,
                  });
                  const page = JSON.parse(raw) as {
                    records: CatalogChoice[];
                    total: number;
                  };
                  const rows = [...(available?.rows ?? []), ...page.records];
                  setCatalog({
                    version: versionId,
                    rows,
                    cursor: null,
                    done: rows.length >= page.total,
                  });
                  setResults(null);
                } catch (error) {
                  setMessage((error as Error).message);
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? 'Loading candidates…' : 'Load next catalog candidates'}
            </button>
            <button onClick={generate} disabled={!book}>
              Compare priced proposals
            </button>
            {results && !validResults && (
              <p>Design or price list changed. Generate fresh comparisons.</p>
            )}
            {validResults && (
              <>
                <p>
                  Current total: {money(validResults.baseline)}.{' '}
                  {validResults.proposals.length} distinct feasible tiers;
                  “best” prioritizes the recorded storage preference, not price.
                </p>
                {target !== '' && (
                  <article className="decision-card">
                    <h4>
                      {validResults.achieved
                        ? 'Budget reached'
                        : 'Budget not reached with available variants'}
                    </h4>
                    <p>
                      Proposed total {money(validResults.budgetTotal)} · savings{' '}
                      {money(validResults.baseline - validResults.budgetTotal)}.
                    </p>
                    <button
                      onClick={() =>
                        stage(validResults.budget, 'Budget proposal', true)
                      }
                    >
                      Preview budget proposal
                    </button>
                  </article>
                )}
                <div className="proposal-grid">
                  {validResults.proposals.map((option) => (
                    <article className="decision-card" key={option.name}>
                      <h4>{option.name}</h4>
                      <strong>{money(option.total)}</strong>
                      <MiniPlan design={option.design} />
                      <p>
                        {option.storage.drawerUnits} drawer/pull-out units ·{' '}
                        {option.storage.pantryWidth} in pantry frontage
                      </p>
                      <p>
                        {option.changes.changed.length} substitutions ·{' '}
                        {money(option.total - validResults.baseline)} versus
                        current
                      </p>
                      <button
                        onClick={() => stage(option.design, option.name, true)}
                      >
                        Preview {option.name}
                      </button>
                    </article>
                  ))}
                </div>
                <button
                  onClick={() => {
                    if (!book) return;
                    try {
                      const fresh = pricedProposals(
                        design,
                        book,
                        available?.rows ?? [],
                        { preserveDrawers: keepDrawers, protectedIds },
                      );
                      downloadJson(
                        {
                          format: 'kitchen-proposals-v1',
                          createdAt: new Date().toISOString(),
                          supplier: book.supplier,
                          reference: book.reference,
                          priceBookRevision: stored?.revision,
                          validUntil: book.validUntil,
                          proposals: fresh.proposals,
                        },
                        'kitchen-proposals.json',
                      );
                    } catch (error) {
                      setMessage((error as Error).message);
                    }
                  }}
                >
                  Export proposal comparison
                </button>
                <button
                  onClick={() => {
                    if (!book) return;
                    try {
                      const html = proposalDocument(
                        validResults.proposals,
                        book,
                        stored?.revision ?? 0,
                      );
                      const url = URL.createObjectURL(
                        new Blob([html], { type: 'text/html' }),
                      );
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'kitchen-proposal-comparison.html';
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    } catch (error) {
                      setMessage((error as Error).message);
                    }
                  }}
                >
                  Download client comparison / PDF
                </button>
                <p>
                  Apply a proposal to issue its branded quote or create its
                  client review snapshot.
                </p>
              </>
            )}
          </>
        )}
        {tab === 'impact' && (
          <>
            <h3>Preview a move or configuration change</h3>
            <p>
              Select an item and enter its proposed position or illustrative
              storage front. Linked assembly parts follow. Review affected
              worktops, new checks and quote changes before applying.
            </p>
            <ChangeForm design={design} onPreview={stage} />
          </>
        )}
        {tab === 'storage' && (
          <StoragePlanning
            design={design}
            onChange={onChange}
            onLocate={onLocate}
          />
        )}
        {tab === 'selections' && (
          <ClientSelectionBoard
            design={design}
            onChange={onChange}
            onPreview={stage}
          />
        )}
        {tab === 'site' && (
          <InstallerTools design={design} onChange={onChange} />
        )}
      </section>
    </div>
  );
}
function ChangeForm({
  design,
  onPreview,
}: {
  design: Design;
  onPreview: (d: Design, label: string) => void;
}) {
  const [id, setId] = useState(design.items[0]?.id ?? '');
  const item = design.items.find((i) => i.id === id);
  return (
    <>
      <label>
        Item to preview
        <select
          aria-label="Item to preview"
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          <option value="">Choose item</option>
          {design.items.map((i, n) => (
            <option key={i.id} value={i.id}>
              {n + 1}. {i.sku}
            </option>
          ))}
        </select>
      </label>
      {item && (
        <ItemChange
          key={JSON.stringify(item)}
          design={design}
          item={item}
          onPreview={onPreview}
        />
      )}
    </>
  );
}
function ItemChange({
  design,
  item,
  onPreview,
}: {
  design: Design;
  item: Cabinet;
  onPreview: (d: Design, label: string) => void;
}) {
  const [x, setX] = useState(String(item.x)),
    [y, setY] = useState(String(item.y)),
    [rotation, setRotation] = useState(String(item.rotation)),
    [front, setFront] = useState(item.frontStyle);
  const valid = [x, y, rotation].every(
    (s) => s.trim() !== '' && Number.isFinite(Number(s)),
  );
  return (
    <>
      <div className="business-grid">
        {[
          ['Proposed X', x, setX],
          ['Proposed Y', y, setY],
          ['Proposed rotation', rotation, setRotation],
        ].map(([label, value, set]) => (
          <label key={label as string}>
            {label as string}
            <input
              aria-label={label as string}
              type="number"
              value={value as string}
              onChange={(e) => (set as (s: string) => void)(e.target.value)}
            />
          </label>
        ))}
        <label>
          Proposed front
          <select
            aria-label="Proposed front"
            value={front}
            onChange={(e) => setFront(e.target.value as Cabinet['frontStyle'])}
          >
            {['auto', 'single', 'double', 'drawers', 'glass'].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
      </div>
      <button
        disabled={!valid}
        onClick={() =>
          onPreview(
            updateAssembly(design, item.id, {
              x: Number(x),
              y: Number(y),
              rotation: Number(rotation),
              frontStyle: front,
            }),
            `Change ${item.sku}`,
          )
        }
      >
        Preview item change
      </button>
    </>
  );
}
function StoragePlanning({
  design,
  onChange,
  onLocate,
}: {
  design: Design;
  onChange: (d: Design) => void;
  onLocate: (id: string) => void;
}) {
  const profile = design.storageProfile ?? defaultStorageProfile,
    summary = storageSummary(design);
  const update = (patch: Partial<StorageProfile>) =>
    onChange({ ...design, storageProfile: { ...profile, ...patch } });
  return (
    <>
      <h3>Storage for your household</h3>
      <p>
        Targets are editable household preferences expressed through planning
        rules. Front styles are illustrative; supplier dimensions and
        configurations determine usable storage.
      </p>
      <div className="business-grid">
        <label>
          Household size
          <input
            aria-label="Household size"
            type="number"
            min="1"
            max="12"
            value={profile.household}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 1 && n <= 12)
                update({ household: n });
            }}
          />
        </label>
        {(
          [
            ['cookware', ['light', 'regular', 'extensive']],
            ['pantry', ['small', 'weekly', 'bulk']],
            ['reach', ['standard', 'low']],
            ['priority', ['balanced', 'drawers', 'pantry']],
          ] as const
        ).map(([field, options]) => (
          <label key={field}>
            {field}
            <select
              aria-label={`Storage ${field}`}
              value={profile[field]}
              onChange={(e) => update({ [field]: e.target.value })}
            >
              {options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p>
        {summary.drawerUnits} drawer / pull-out units ·{' '}
        {summary.accessibleUnits} lower drawer / pull-out units ·{' '}
        {summary.pantryWidth} in tall pantry frontage
      </p>
      {storageRecommendations(design, profile).map((r) => (
        <article className="decision-card" key={r.title}>
          <h4>{r.title}</h4>
          <p>{r.reason}</p>
          {r.itemIds.map((id) => (
            <button key={id} onClick={() => onLocate(id)}>
              Inspect {design.items.find((i) => i.id === id)?.sku}
            </button>
          ))}
        </article>
      ))}
      <p>
        Use Preview a change to explore a front change, then obtain its exact
        supplier price before including it in a quote.
      </p>
    </>
  );
}
