'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { Overview } from '@/lib/workspace-types';
import { defaultCatalog } from '@/lib/workspace-types';
import { downloadJson } from '@/components/designer/business-tools';
export default function ReadinessPage() {
  const raw = useQuery(api.workspace.overview, {});
  const overview = raw ? (JSON.parse(raw) as Overview) : null;
  const [choice, setChoice] = useState('');
  const version =
    overview?.versions.find((v) => v._id === choice) ??
    defaultCatalog(overview?.versions);
  return (
    <div className="page-body">
      <h1>Catalog readiness</h1>
      <p>
        Resolve source questions, attach manufacturer answers, and complete
        human review before publication.
      </p>
      <label>
        Catalog version
        <select
          aria-label="Readiness catalog version"
          value={version?._id ?? ''}
          onChange={(e) => setChoice(e.target.value)}
        >
          {overview?.versions.map((v) => (
            <option key={v._id} value={v._id}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      {version ? (
        <Queue key={version._id} versionId={version._id} />
      ) : (
        <p>Load a catalog in Documents to start review.</p>
      )}
    </div>
  );
}
function Queue({ versionId }: { versionId: Id<'versions'> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.catalogReadiness.list,
    { versionId },
    { initialNumItems: 25 },
  );
  const [selected, setSelected] = useState('');
  const record = results.find((r) => r._id === selected);
  return (
    <>
      <section className="business-panel">
        <h2>Release checklist</h2>
        <ol>
          <li>Resolve unknown dimensions with authoritative evidence.</li>
          <li>Review each source record and approve verified facts.</li>
          <li>Complete the independent benchmark and publication checks.</li>
        </ol>
        <p>
          Submitted answers are pending evidence. They do not approve facts or
          bypass publication gates.
        </p>
        <Link href="/review">Source review</Link>
        <Link href="/benchmarks">Benchmark sign-off</Link>
        <Link href="/versions">Publication checks</Link>
      </section>
      <section className="business-panel">
        <h2>Products requiring review</h2>
        <p>
          {results.length} loaded products require source review or have
          blockers.
        </p>
        <button
          disabled={!results.length}
          onClick={() =>
            downloadJson(
              {
                versionId,
                complete: status === 'Exhausted',
                preparedAt: new Date().toISOString(),
                questions: results.map((r) => ({
                  sku: r.sku,
                  page: r.pageNumber,
                  revision: r.revision,
                  blockers: r.blockers,
                  reviewStatus: r.reviewStatus,
                  request:
                    'Confirm unresolved fields against an authoritative specification; provide source edition, page, dimension convention and exceptions.',
                })),
              },
              'catalog-source-questions.json',
            )
          }
        >
          Export loaded source questions
        </button>
        <div className="business-table">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Source page</th>
                <th>Status / blockers</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r._id}>
                  <td>{r.sku}</td>
                  <td>{r.pageNumber}</td>
                  <td>
                    {r.reviewStatus} ·{' '}
                    {r.blockers.join('; ') || 'Source verification required'}
                  </td>
                  <td>
                    <button onClick={() => setSelected(r._id)}>
                      Review {r.sku}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {status === 'CanLoadMore' && (
          <button onClick={() => loadMore(25)}>Load more products</button>
        )}
        {(status === 'LoadingFirstPage' || status === 'LoadingMore') && (
          <p>Loading products…</p>
        )}
        {status === 'Exhausted' && (
          <p>
            All product pages loaded. Rule, footnote and benchmark checks remain
            in the publication workflow.
          </p>
        )}
      </section>
      {record && (
        <EvidenceForm key={record._id} record={record} versionId={versionId} />
      )}
    </>
  );
}
function EvidenceForm({
  record,
  versionId,
}: {
  versionId: Id<'versions'>;
  record: {
    _id: Id<'records'>;
    sku: string;
    revision: number;
    payloadJson: string;
    evidenceJson: string;
  };
}) {
  const entries = useQuery(api.catalogReadiness.clarifications, {
      recordId: record._id,
    }),
    submit = useMutation(api.catalogReadiness.submitClarification);
  const [reference, setReference] = useState(''),
    [text, setText] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <section className="business-panel">
      <h2>Manufacturer evidence · {record.sku}</h2>
      <details>
        <summary>Current facts and evidence</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {JSON.stringify(JSON.parse(record.payloadJson), null, 2)}
        </pre>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {JSON.stringify(JSON.parse(record.evidenceJson), null, 2)}
        </pre>
      </details>
      <label>
        Source reference
        <input
          aria-label="Manufacturer source reference"
          maxLength={1000}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Specification edition, page, or manufacturer response reference"
        />
      </label>
      <label>
        Authoritative answer
        <textarea
          aria-label="Manufacturer answer"
          maxLength={10000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Record exact dimensions, units, nominal/actual convention and any exceptions."
        />
      </label>
      <button
        disabled={busy || !reference.trim() || !text.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            await submit({
              recordId: record._id,
              expectedRevision: record.revision,
              evidenceReference: reference,
              evidenceText: text,
            });
            setReference('');
            setText('');
            setMessage(
              'Evidence saved for human review. Catalog facts remain unchanged.',
            );
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Submit manufacturer evidence
      </button>
      <p role="status">{message}</p>
      <Link href={`/review?version=${versionId}&record=${record._id}`}>
        Open source review for this record
      </Link>
      <h3>Pending evidence</h3>
      {entries?.map((e) => (
        <article key={e._id}>
          <strong>{e.evidenceReference}</strong>
          <p>{e.evidenceText}</p>
          <small>
            {e.status} · record revision {e.recordRevision}
          </small>
        </article>
      ))}
    </section>
  );
}
