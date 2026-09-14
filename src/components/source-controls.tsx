'use client';
import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Doc } from '../../convex/_generated/dataModel';
import { parsePages } from '@/lib/workspace-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldLabel } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
export function SourceControls({ version }: { version: Doc<'versions'> }) {
  const [range, setRange] = useState(''),
    [reason, setReason] = useState(''),
    [nonCatalog, setNonCatalog] = useState(false),
    [pending, setPending] = useState(false);
  const raw = useQuery(api.workspace.pages, {
    versionId: version._id,
    paginationOpts: { cursor: null, numItems: 40 },
  });
  const pages = raw ? (JSON.parse(raw) as { page: Doc<'pages'>[] }).page : [];
  const reprocess = useMutation(api.workspace.reprocess),
    ignore = useMutation(api.versions.ignorePage);
  const locked = ['published', 'superseded'].includes(version.status);
  return (
    <section className="flex flex-col gap-4">
      <h2>Source pages</h2>
      <p className="muted">
        Page numbers below are physical PDF positions. Reprocessing preserves
        audited corrections.
      </p>
      <div className="toolbar">
        <Input
          className="max-w-64"
          aria-label="Pages to reprocess"
          placeholder="22-25, 51"
          value={range}
          onChange={(e) => setRange(e.target.value)}
        />
        <Button
          variant="outline"
          disabled={locked || pending || !range}
          onClick={async () => {
            setPending(true);
            try {
              await reprocess({
                versionId: version._id,
                pages: parsePages(range),
              });
              toast.success('Reprocessing queued');
            } catch (e) {
              toast.error(
                e instanceof Error ? e.message : 'Reprocessing failed',
              );
            } finally {
              setPending(false);
            }
          }}
        >
          Reprocess pages
        </Button>
      </div>
      <div className="table-wrap">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="p-3">PDF / printed</th>
              <th>Status</th>
              <th>Classification</th>
              <th>Source</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr className="border-t" key={p._id}>
                <td className="p-3">
                  {p.pageNumber} / {p.printedLabel}
                </td>
                <td>
                  {p.status}
                  {p.error ? (
                    <p className="text-destructive">{p.error}</p>
                  ) : null}
                </td>
                <td>{p.classification}</td>
                <td>
                  <a
                    href={
                      '/api/files?documentId=' +
                      version.documentId +
                      '#page=' +
                      p.pageNumber
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    Open PDF
                  </a>
                </td>
                <td>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={
                      locked ||
                      !nonCatalog ||
                      reason.trim().length < 10 ||
                      !['other', 'index', 'table_of_contents'].includes(
                        p.classification,
                      )
                    }
                    onClick={async () => {
                      try {
                        await ignore({
                          versionId: version._id,
                          pageNumber: p.pageNumber,
                          reason,
                          attestNonCatalog: nonCatalog,
                        });
                        toast.success('Non-catalog exclusion recorded');
                      } catch (e) {
                        toast.error(
                          e instanceof Error
                            ? e.message
                            : 'Page exclusion failed',
                        );
                      }
                    }}
                  >
                    Ignore non-catalog page
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Field>
        <FieldLabel htmlFor="ignore-reason">
          Reason for excluding a non-catalog page
        </FieldLabel>
        <Textarea
          id="ignore-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <label className="flex gap-2 items-center">
        <Checkbox
          checked={nonCatalog}
          onCheckedChange={(v) => setNonCatalog(v === true)}
        />
        I inspected the page and it contains no product, dimension, footnote,
        modification, or restriction information.
      </label>
    </section>
  );
}
