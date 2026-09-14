'use client';
import { MergeRecords } from './merge-records';
import { SplitRecord } from './split-record';
import { useMemo, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '../../convex/_generated/api';
import type { Id, Doc } from '../../convex/_generated/dataModel';
import type {
  Overview,
  RecordPage,
  RecordDetail,
  RecordListRow,
} from '@/lib/workspace-types';
import {
  recordDataSchema,
  recordEvidence,
  requiredFieldIssues,
} from '@/catalog/record-data';
import type { RecordData } from '@/catalog/record-data';
import type { SourceEvidence } from '@/catalog/evidence';
import { VersionPicker } from './version-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { cn } from '@/lib/utils';

export function ReviewWorkspace({
  kind = 'product',
  title = 'Review',
}: {
  kind?: Doc<'records'>['kind'];
  title?: string;
}) {
  const raw = useQuery(api.workspace.overview, {}),
    data = raw ? (JSON.parse(raw) as Overview) : undefined;
  const search = useSearchParams(),
    router = useRouter();
  const requested = search.get('version');
  const version =
    data?.versions.find((v) => v._id === requested) ?? data?.versions[0];
  return (
    <>
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          <p className="muted">
            {version ? version.label : 'Source-linked catalog records'}
          </p>
        </div>
        {data && version ? (
          <VersionPicker
            versions={data.versions}
            value={version._id}
            onChange={(id) => router.replace('?version=' + id)}
          />
        ) : null}
      </header>
      {version ? (
        <ReviewList
          key={version._id + kind}
          version={version}
          initialKind={kind}
        />
      ) : (
        <div className="page-body">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No catalog to review</EmptyTitle>
              <EmptyDescription>
                Load the Allure draft benchmark or queue a compilation from
                Documents.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      )}
    </>
  );
}
function ReviewList({
  version,
  initialKind,
}: {
  version: Doc<'versions'>;
  initialKind: Doc<'records'>['kind'];
}) {
  const requestedRecord = useSearchParams().get('record');
  const [mergeSelection, setMergeSelection] = useState<RecordListRow[]>([]);
  const [kind, setKind] = useState(initialKind),
    [search, setSearch] = useState(''),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<Id<'records'> | null>(
      requestedRecord as Id<'records'> | null,
    );
  const raw = useQuery(api.workspace.listRecords, {
    versionId: version._id,
    kind,
    search,
    paginationOpts: { numItems: 50, cursor },
  });
  const result = raw ? (JSON.parse(raw) as RecordPage) : undefined;
  const selectedId = selected ?? result?.page[0]?._id;
  return (
    <div className="review-grid">
      <section className="review-list" aria-label="Review queue">
        <h2>Review queue</h2>
        <div className="toolbar">
          {(['product', 'rule', 'footnote', 'case', 'registry'] as const).map(
            (k) => (
              <Button
                key={k}
                variant={kind === k ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => {
                  setKind(k);
                  setMergeSelection([]);
                  setCursor(null);
                  setSelected(null);
                }}
              >
                {k === 'product'
                  ? 'Products'
                  : k === 'rule'
                    ? 'Rules'
                    : k === 'footnote'
                      ? 'Footnotes'
                      : k === 'registry'
                        ? 'Families / options'
                        : 'Cases'}
              </Button>
            ),
          )}
        </div>
        <Input
          aria-label="Search by SKU"
          placeholder="Search by SKU…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCursor(null);
            setSelected(null);
          }}
        />
        <MergeRecords
          records={mergeSelection}
          locked={['published', 'superseded'].includes(version.status)}
          onDone={() => setMergeSelection([])}
        />
        {result?.page.map((r) => (
          <div key={r._id} className="flex items-start gap-1">
            <Checkbox
              aria-label={'Select ' + r.sku + ' for merge'}
              checked={mergeSelection.some((x) => x._id === r._id)}
              onCheckedChange={(checked) =>
                setMergeSelection((current) =>
                  checked
                    ? [...current.filter((x) => x._id !== r._id), r]
                    : current.filter((x) => x._id !== r._id),
                )
              }
            />
            <button
              className={cn('record-row', selectedId === r._id && 'selected')}
              onClick={() => setSelected(r._id)}
            >
              <div className="record-row-top">
                <strong>{r.sku}</strong>
                <span className="text-xs muted">
                  {r.reviewStatus === 'unreviewed'
                    ? 'Needs review'
                    : r.reviewStatus.replace('_', ' ')}
                </span>
              </div>
              <div className="text-xs muted">
                PDF {r.pageNumber}
                {r.blockers.length
                  ? ' · ' + r.blockers.length + ' blockers'
                  : ''}
              </div>
            </button>
          </div>
        ))}
        {result && !result.page.length ? (
          <p className="muted">No matching records on this page.</p>
        ) : null}
        <div className="toolbar">
          <Button
            variant="outline"
            size="sm"
            disabled={!cursor}
            onClick={() => {
              setCursor(null);
              setSelected(null);
            }}
          >
            First
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!result || result.isDone}
            onClick={() => {
              if (result) setCursor(result.continueCursor);
              setSelected(null);
            }}
          >
            Next
          </Button>
        </div>
      </section>
      <section className="review-detail">
        {version.origin === 'benchmark_draft' ? (
          <Alert>
            <AlertTitle>
              Draft annotations — human verification pending
            </AlertTitle>
            <AlertDescription>
              Check each field against its source. Importing a draft does not
              verify its accuracy.
            </AlertDescription>
          </Alert>
        ) : null}
        {selectedId ? (
          <RecordInspector recordId={selectedId} version={version} />
        ) : (
          <p className="muted">
            Records will appear as pages finish processing.
          </p>
        )}
      </section>
    </div>
  );
}
function RecordInspector({
  recordId,
  version,
}: {
  recordId: Id<'records'>;
  version: Doc<'versions'>;
}) {
  const raw = useQuery(api.workspace.record, { recordId });
  const detail = raw ? (JSON.parse(raw) as RecordDetail) : undefined;
  return detail ? (
    <RecordEditor
      key={detail.record._id + ':' + detail.record.revision}
      detail={detail}
      version={version}
    />
  ) : (
    <p>Loading record…</p>
  );
}
function RecordEditor({
  detail,
  version,
}: {
  detail: RecordDetail;
  version: Doc<'versions'>;
}) {
  const record = detail.record;
  const initial = recordDataSchema.parse(JSON.parse(record.payloadJson));
  const [payload, setPayload] = useState<RecordData>(initial),
    [reason, setReason] = useState(''),
    [attest, setAttest] = useState(false),
    [pending, setPending] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [json, setJson] = useState(JSON.stringify(initial, null, 2));
  const initialEvidence = recordEvidence(initial);
  const [selectedEvidence, setSelectedEvidence] = useState<
    SourceEvidence | undefined
  >(initialEvidence[0]);
  const decide = useMutation(api.review.decide);
  const locked =
    version.status === 'published' || version.status === 'superseded';
  async function act(
    action: 'approve' | 'edit' | 'reject' | 'ambiguous' | 'resolve',
  ) {
    setPending(true);
    try {
      await decide({
        recordId: record._id,
        expectedRevision: record.revision,
        action,
        reason,
        attestWholeRecord: attest,
        ...(action === 'edit' ? { payloadJson: JSON.stringify(payload) } : {}),
      });
      toast.success(
        action === 'approve'
          ? 'Record approved'
          : action === 'edit'
            ? 'Correction saved; review again before approval'
            : 'Review decision saved',
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Review failed');
    } finally {
      setPending(false);
    }
  }
  const fieldIssues = requiredFieldIssues(initial);
  const fieldLabel = (field: string) => {
    const label = field
      .replace(/In$/, ' (in)')
      .replace(/([a-z])([A-Z])/g, '$1 $2');
    return label.charAt(0).toUpperCase() + label.slice(1);
  };
  const changed = JSON.stringify(payload) !== JSON.stringify(initial);
  const allEvidence = useMemo(() => {
    const m = new Map(recordEvidence(payload).map((e) => [e.id, e]));
    return [...m.values()];
  }, [payload]);
  return (
    <>
      <div className="evidence-grid">
        <SourcePanel
          versionId={version._id}
          selected={selectedEvidence}
          allEvidence={allEvidence}
          onSelect={setSelectedEvidence}
        />
        <div className="fields-panel">
          <div className="toolbar">
            <h2>{record.sku}</h2>
            <Badge
              variant={record.blockers.length ? 'destructive' : 'secondary'}
            >
              {record.reviewStatus === 'unreviewed'
                ? 'Needs review'
                : record.reviewStatus.replace('_', ' ')}
            </Badge>
          </div>
          {record.blockers.length ? (
            <Alert variant="destructive">
              <AlertTitle>Approval blocked</AlertTitle>
              <AlertDescription>
                {record.blockers.map((code) => {
                  const details = fieldIssues.filter(
                    (issue) => issue.code === code,
                  );
                  return details.length ? (
                    details.map((issue) => (
                      <div key={code + ':' + issue.field}>
                        {fieldLabel(issue.field)}:{' '}
                        {code === 'missing_required_field'
                          ? 'a required value is missing or unresolved.'
                          : code.replaceAll('_', ' ')}
                      </div>
                    ))
                  ) : (
                    <div key={code}>{code.replaceAll('_', ' ')}</div>
                  );
                })}
                {fieldIssues.some(
                  (issue) => issue.code === 'missing_required_field',
                ) ? (
                  <p>
                    Only add a value when the source supports it. Otherwise,
                    leave this record unapproved.
                  </p>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
          {payload.kind === 'product' ? (
            <FieldGroup>
              {Object.entries(payload.data.fields).map(([key, f]) => (
                <div className="field-row" key={key}>
                  <Field>
                    <FieldLabel htmlFor={'field-' + key}>
                      {key.replace(/([A-Z])/g, ' $1').replace(/In$/, ' (in)')}
                    </FieldLabel>
                    {f.state === 'known' ? (
                      <Input
                        id={'field-' + key}
                        disabled={locked || key === 'sku'}
                        value={String(f.value)}
                        onChange={(e) => {
                          const next = structuredClone(payload),
                            target = next.data.fields[key];
                          if (target?.state !== 'known') return;
                          const value =
                            typeof f.value === 'number'
                              ? Number(e.target.value)
                              : typeof f.value === 'boolean'
                                ? e.target.value === 'true'
                                : e.target.value;
                          if (
                            typeof value === 'number' &&
                            !Number.isFinite(value)
                          )
                            return;
                          target.value = value;
                          target.extractionMethod = 'human';
                          delete target.derivation;
                          target.reviewStatus = 'unreviewed';
                          setPayload(next);
                        }}
                      />
                    ) : (
                      <p>
                        {f.state === 'unknown'
                          ? f.reason
                          : f.state === 'absent'
                            ? f.reason
                            : 'Conflicting source values'}
                      </p>
                    )}
                  </Field>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setSelectedEvidence(f.provenance[0])}
                    disabled={!f.provenance.length}
                  >
                    View source
                  </Button>
                </div>
              ))}
            </FieldGroup>
          ) : payload.kind === 'rule' ? (
            <>
              <h3>Rule</h3>
              <pre className="source-quote">
                {payload.data.modelingStatus === 'modeled'
                  ? JSON.stringify(payload.data.constraint, null, 2)
                  : payload.data.reason}
              </pre>
              <h3>Original source text</h3>
              <p className="source-quote">{payload.data.sourceText}</p>
            </>
          ) : payload.kind === 'footnote' ? (
            <>
              <h3>
                {payload.data.symbol} · {payload.data.field}
              </h3>
              <pre className="source-quote">{payload.data.valueJson}</pre>
            </>
          ) : payload.kind === 'registry' ? (
            <>
              <h3>{payload.data.entityKind}</h3>
              <pre className="source-quote">
                {JSON.stringify(payload.data, null, 2)}
              </pre>
            </>
          ) : (
            <>
              <h3>{payload.data.sourceKind.replaceAll('_', ' ')}</h3>
              <p>{payload.data.description}</p>
              <pre className="source-quote">{payload.data.expectationJson}</pre>
            </>
          )}
          <SplitRecord record={record} locked={locked} />
          <Dialog open={advanced} onOpenChange={setAdvanced}>
            <DialogTrigger
              render={<Button variant="outline" disabled={locked} />}
            >
              Edit structured record
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>
                  Edit fields, rules, and source evidence
                </DialogTitle>
              </DialogHeader>
              <p>
                Changes must pass the semantic schema. Keep the record identity
                and cite the exact source for every changed fact.
              </p>
              <Textarea
                className="json-editor"
                aria-label="Structured record JSON"
                value={json}
                onChange={(e) => setJson(e.target.value)}
              />
              <Button
                onClick={() => {
                  try {
                    const next = recordDataSchema.parse(JSON.parse(json));
                    setPayload(next);
                    setAdvanced(false);
                    toast.success(
                      'Changes staged. Save correction to record the audit entry.',
                    );
                  } catch (e) {
                    toast.error(
                      e instanceof Error ? e.message : 'Invalid record',
                    );
                  }
                }}
              >
                Apply to editor
              </Button>
            </DialogContent>
          </Dialog>
          <Field>
            <FieldLabel htmlFor="reason">
              Review note / correction reason
            </FieldLabel>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={locked}
              placeholder="Explain the source evidence or correction"
            />
          </Field>
          <label className="flex items-start gap-2">
            <Checkbox
              checked={attest}
              onCheckedChange={(v) => setAttest(v === true)}
              disabled={locked}
              aria-label="I checked every field and its source"
            />
            <span>I checked every field and its source.</span>
          </label>
          <div className="field-actions">
            <Button
              disabled={
                pending ||
                locked ||
                changed ||
                !attest ||
                !!record.blockers.length
              }
              onClick={() => void act('approve')}
            >
              Approve
            </Button>
            <Button
              variant="outline"
              disabled={pending || locked || !changed || !reason.trim()}
              onClick={() => void act('edit')}
            >
              Save correction
            </Button>
            <Button
              variant="outline"
              disabled={pending || locked || !reason.trim()}
              onClick={() => void act('reject')}
            >
              Reject
            </Button>
            <Button
              variant="outline"
              disabled={pending || locked || !reason.trim() || !attest}
              onClick={() => void act('ambiguous')}
            >
              Mark ambiguous
            </Button>
            {record.blockers.length ? (
              <Button
                variant="outline"
                disabled={pending || locked || !reason.trim() || !attest}
                onClick={() => void act('resolve')}
              >
                Revalidate / resolve
              </Button>
            ) : null}
          </div>
          {changed ? (
            <p className="muted">
              Unsaved corrections must be saved before approval.
            </p>
          ) : null}
          {locked ? (
            <p className="muted">
              This published version is immutable. Create a revision to make
              corrections.
            </p>
          ) : null}
        </div>
      </div>
      <section>
        <h3>Review history</h3>
        {detail.audit.length ? (
          <ol className="mt-2 flex flex-col gap-2">
            {detail.audit.map((a) => (
              <li key={a._id}>
                <strong>{a.action}</strong> · {new Date(a.at).toLocaleString()}{' '}
                · {a.actorKind}
                <p className="muted">
                  {a.reason || 'Source checked and approved'}
                </p>
                <details>
                  <summary>View before / after</summary>
                  <pre className="source-quote">
                    {JSON.stringify(
                      {
                        before: JSON.parse(a.beforeJson),
                        after: JSON.parse(a.afterJson),
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">No human review decisions yet.</p>
        )}
      </section>
    </>
  );
}
function SourcePanel({
  versionId,
  selected,
  allEvidence,
  onSelect,
}: {
  versionId: Id<'versions'>;
  selected: SourceEvidence | undefined;
  allEvidence: SourceEvidence[];
  onSelect: (e: SourceEvidence) => void;
}) {
  const raw = useQuery(
    api.workspace.page,
    selected ? { versionId, pageNumber: selected.pageNumber } : 'skip',
  );
  const page = raw ? (JSON.parse(raw) as Doc<'pages'> | null) : undefined;
  return (
    <section className="source-panel">
      <h2>Source evidence</h2>
      {selected ? (
        <>
          <div className="toolbar mt-3">
            <span>
              PDF page {selected.pageNumber} · Printed{' '}
              {selected.printedPageLabel ?? page?.printedLabel ?? '—'}
            </span>
            {page ? (
              <a
                href={
                  '/api/files?documentId=' +
                  page.documentId +
                  '#page=' +
                  selected.pageNumber
                }
                target="_blank"
                rel="noreferrer"
              >
                Open PDF
              </a>
            ) : null}
          </div>
          {page?.imageStorageId ? (
            <div className="source-image">
              <img
                src={'/api/files?pageId=' + page._id}
                alt={'Source PDF page ' + selected.pageNumber}
              />
              {selected.location.kind === 'region' ? (
                <div
                  className="evidence-box"
                  style={{
                    left: selected.location.boundingBox.x * 100 + '%',
                    top: selected.location.boundingBox.y * 100 + '%',
                    width: selected.location.boundingBox.width * 100 + '%',
                    height: selected.location.boundingBox.height * 100 + '%',
                  }}
                />
              ) : null}
            </div>
          ) : (
            <p className="muted mt-4">
              {page?.status === 'failed'
                ? 'Page extraction failed. Reprocess this page.'
                : 'Page image is being prepared.'}
            </p>
          )}
          <h3 className="mt-4">Source text</h3>
          <p className="source-quote mt-2">
            {selected.sourceText ?? 'Inspect the highlighted visual evidence.'}
          </p>
          {selected.location.kind === 'full_page' ? (
            <p className="muted text-xs mt-2">{selected.location.reason}</p>
          ) : null}
          <details className="mt-3">
            <summary>All linked evidence ({allEvidence.length})</summary>
            <div className="flex flex-col gap-1">
              {allEvidence.map((e) => (
                <Button
                  key={e.id}
                  variant="link"
                  className="justify-start"
                  onClick={() => onSelect(e)}
                >
                  PDF {e.pageNumber} ·{' '}
                  {e.sourceText?.slice(0, 45) ?? 'Visual evidence'}
                </Button>
              ))}
            </div>
          </details>
        </>
      ) : (
        <p>No source evidence. This blocks approval.</p>
      )}
    </section>
  );
}
