'use client';
import { useState } from 'react';
import { useQuery, useAction } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { Overview } from '@/lib/workspace-types';
import { VersionPicker } from '@/components/version-picker';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
export default function Benchmarks() {
  const raw = useQuery(api.workspace.overview, {});
  const data = raw ? (JSON.parse(raw) as Overview) : undefined;
  const [candidate, setCandidate] = useState(''),
    [truth, setTruth] = useState(''),
    [pending, setPending] = useState(false),
    [result, setResult] = useState('');
  const run = useAction(api.versions.benchmark);
  const inspect = useQuery(
    api.versions.inspect,
    truth ? { versionId: truth as Id<'versions'> } : 'skip',
  );
  const status = inspect
    ? (JSON.parse(inspect) as { verified: number; total: number })
    : undefined;
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Benchmarks</h1>
          <p className="muted">
            Measure extraction against independently reviewed source truth
          </p>
        </div>
      </header>
      <div className="page-body">
        <Alert>
          <AlertTitle>Human verification is required</AlertTitle>
          <AlertDescription>
            Draft annotations and automated QA are never counted as verified
            truth. The development benchmark requires 150–200 products, at least
            30 rules and 30 footnotes, and difficult cases. A separate random
            sample of 600 auto-approved decisions with zero critical errors is
            required before a reliability claim.
          </AlertDescription>
        </Alert>
        {data ? (
          <>
            <h2>Compiler candidate</h2>
            <VersionPicker
              versions={data.versions.filter(
                (v) =>
                  v.origin !== 'benchmark_draft' && v.status !== 'published',
              )}
              value={candidate}
              onChange={setCandidate}
            />
            <h2>Reviewed benchmark truth</h2>
            <VersionPicker
              versions={data.versions.filter(
                (v) => v.origin === 'benchmark_draft',
              )}
              value={truth}
              onChange={setTruth}
            />
            {status ? (
              <p>
                {status.verified} of {status.total} records have human
                verification.
              </p>
            ) : null}
            <Button
              className="w-fit"
              disabled={!candidate || !truth || pending}
              onClick={async () => {
                setPending(true);
                try {
                  setResult(
                    await run({
                      versionId: candidate as Id<'versions'>,
                      truthVersionId: truth as Id<'versions'>,
                    }),
                  );
                } catch (e) {
                  toast.error(
                    e instanceof Error ? e.message : 'Benchmark failed',
                  );
                } finally {
                  setPending(false);
                }
              }}
            >
              {pending ? 'Measuring…' : 'Run benchmark'}
            </Button>
          </>
        ) : null}
        {result ? (
          <pre className="source-quote">
            {JSON.stringify(JSON.parse(result), null, 2)}
          </pre>
        ) : (
          <p className="muted">
            Results report products, fields, dimensions, rules, footnotes, and
            source references separately. No accuracy result has been
            established yet.
          </p>
        )}
      </div>
    </>
  );
}
