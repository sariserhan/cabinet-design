'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Overview, RecordListRow } from '@/lib/workspace-types';
import type { Doc } from '../../../../convex/_generated/dataModel';
import { VersionPicker } from '@/components/version-picker';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
export default function Catalog() {
  const raw = useQuery(api.workspace.overview, {});
  const data = raw ? (JSON.parse(raw) as Overview) : undefined;
  const [choice, setChoice] = useState('');
  const version =
    data?.versions.find((v) => v._id === choice) ?? data?.versions[0];
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Catalog</h1>
          <p className="muted">
            Search source-linked products by geometry, family, and review status
          </p>
        </div>
        {data && version ? (
          <VersionPicker
            versions={data.versions}
            value={version._id}
            onChange={setChoice}
          />
        ) : null}
      </header>
      <div className="page-body">
        {version ? (
          <Browser key={version._id} version={version} />
        ) : (
          <p>
            Load a document and compile a representative subset to browse
            products.
          </p>
        )}
      </div>
    </>
  );
}
function Browser({ version }: { version: Doc<'versions'> }) {
  const [filters, setFilters] = useState({
      query: '',
      category: '',
      family: '',
      width: '',
      height: '',
      depth: '',
      minConfidence: '',
    }),
    [status, setStatus] = useState<string>('all'),
    [offset, setOffset] = useState(0);
  const numeric = (value: string) =>
    value.trim() && Number.isFinite(Number(value)) ? Number(value) : undefined;
  const raw = useQuery(api.workspace.browseCatalog, {
    versionId: version._id,
    query: filters.query,
    category: filters.category,
    family: filters.family,
    width: numeric(filters.width),
    height: numeric(filters.height),
    depth: numeric(filters.depth),
    minConfidence: numeric(filters.minConfidence),
    status:
      status === 'all' ? undefined : (status as Doc<'records'>['reviewStatus']),
    offset,
  });
  const data = raw
    ? (JSON.parse(raw) as { total: number; records: RecordListRow[] })
    : undefined;
  return (
    <>
      <div className="toolbar">
        {Object.entries(filters).map(([key, value]) => (
          <Field key={key} className="max-w-40">
            <FieldLabel htmlFor={'filter-' + key}>
              {
                (
                  {
                    query: 'SKU',
                    category: 'Category',
                    family: 'Family',
                    width: 'Width (in)',
                    height: 'Height (in)',
                    depth: 'Depth (in)',
                    minConfidence: 'Min confidence (0–1)',
                  } as Record<string, string>
                )[key]
              }
            </FieldLabel>
            <Input
              id={'filter-' + key}
              value={value}
              onChange={(e) => {
                setFilters({ ...filters, [key]: e.target.value });
                setOffset(0);
              }}
            />
          </Field>
        ))}
        <Field className="max-w-44">
          <FieldLabel>Review status</FieldLabel>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v ?? 'all');
              setOffset(0);
            }}
          >
            <SelectTrigger aria-label="Review status filter">
              <SelectValue>{status.replaceAll('_', ' ')}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {[
                'all',
                'unreviewed',
                'approved',
                'auto_approved',
                'rejected',
              ].map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replaceAll('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <p className="muted">
        {data ? `${data.total} matching products` : 'Loading products…'} ·{' '}
        {version.status === 'published'
          ? 'Published immutable catalog'
          : 'Draft catalog; publication checks have not passed'}
      </p>
      <div className="table-wrap">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              {[
                'SKU',
                'Category / family',
                'W × H × D (in)',
                'Confidence',
                'Review',
                'Source',
              ].map((t) => (
                <th key={t} className="p-3">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.records.map((r) => (
              <tr key={r._id} className="border-t">
                <td className="p-3 font-semibold">{r.sku}</td>
                <td className="p-3">
                  {r.category}
                  <p className="muted">{r.family}</p>
                </td>
                <td className="p-3">
                  {[r.width, r.height, r.depth]
                    .map((v) => v ?? '—')
                    .join(' × ')}
                </td>
                <td className="p-3">
                  {r.confidence
                    ? `${(r.confidence * 100).toFixed(1)}%`
                    : 'Uncalibrated'}
                </td>
                <td className="p-3">
                  {r.reviewStatus.replaceAll('_', ' ')}
                  {r.blockers.length ? ` · ${r.blockers.length} blockers` : ''}
                </td>
                <td className="p-3">
                  <Link
                    className="text-primary underline"
                    href={'/review?version=' + version._id + '&record=' + r._id}
                  >
                    Inspect PDF {r.pageNumber}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar">
        <Button
          variant="outline"
          disabled={!offset}
          onClick={() => setOffset(Math.max(0, offset - 100))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          disabled={!data || offset + 100 >= data.total}
          onClick={() => setOffset(offset + 100)}
        >
          Next
        </Button>
      </div>
    </>
  );
}
