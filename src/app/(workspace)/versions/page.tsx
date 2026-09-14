'use client';
import { GeometryProfiles } from '@/components/geometry-profiles';
import { SourceControls } from '@/components/source-controls';
import { useState } from 'react';
import { useQuery, useAction, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { Overview } from '@/lib/workspace-types';
import type { PublicationGate } from '@/catalog/publication';
import { VersionPicker } from '@/components/version-picker';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
export default function Versions() {
  const raw = useQuery(api.workspace.overview, {});
  const data = raw ? (JSON.parse(raw) as Overview) : undefined;
  const [chosen, setChosen] = useState('');
  const version =
    data?.versions.find((v) => v._id === chosen) ?? data?.versions[0];
  const [before, setBefore] = useState('');
  const inspect = useQuery(
    api.versions.inspect,
    version ? { versionId: version._id } : 'skip',
  );
  const report = inspect
    ? (JSON.parse(inspect) as {
        gate: PublicationGate;
        verified: number;
        total: number;
      })
    : undefined;
  const diff = useQuery(
    api.versions.diff,
    version && before
      ? { beforeId: before as Id<'versions'>, afterId: version._id }
      : 'skip',
  );
  const revise = useMutation(api.versions.createRevision);
  const publish = useAction(api.versions.publish);
  const [pending, setPending] = useState(false);
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Versions</h1>
          <p className="muted">
            Publication checks, immutable exports, and catalog changes
          </p>
        </div>
        {data && version ? (
          <VersionPicker
            versions={data.versions}
            value={version._id}
            onChange={setChosen}
          />
        ) : null}
      </header>
      <div className="page-body">
        {!version ? (
          <p>No catalog versions yet.</p>
        ) : (
          <>
            <div className="metric-line">
              <div>
                <strong>{version.revision}</strong>
                <span>Revision</span>
              </div>
              <div>
                <strong>{version.stats.products}</strong>
                <span>Products</span>
              </div>
              <div>
                <strong>{version.stats.rules}</strong>
                <span>Rules</span>
              </div>
              <div>
                <strong>{version.status}</strong>
                <span>Publication status</span>
              </div>
            </div>
            <p>
              This catalog covers its declared representative subset. It is not
              a complete Allure catalog.
            </p>
            {version.status === 'published' ? (
              <div className="toolbar">
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      setChosen(await revise({ versionId: version._id }));
                      toast.success('Editable revision created');
                    } catch (e) {
                      toast.error(
                        e instanceof Error ? e.message : 'Revision failed',
                      );
                    }
                  }}
                >
                  Create editable revision
                </Button>
                <a
                  href={'/api/files?versionId=' + version._id}
                  download="catalog.json"
                >
                  <Button>Download published JSON</Button>
                </a>
              </div>
            ) : (
              <>
                <Alert
                  variant={report?.gate.publishable ? 'default' : 'destructive'}
                >
                  <AlertTitle>
                    {report?.gate.publishable
                      ? 'Publication checks passed'
                      : 'Publication is blocked'}
                  </AlertTitle>
                  <AlertDescription>
                    {report
                      ? `${report.gate.issues.length} issues at revision ${version.revision}. ${report.verified}/${report.total} records have human verification.`
                      : 'Checking this revision…'}
                  </AlertDescription>
                </Alert>
                <Button
                  className="w-fit"
                  disabled={pending || !report?.gate.publishable}
                  onClick={async () => {
                    setPending(true);
                    try {
                      await publish({ versionId: version._id });
                      toast.success('Version published');
                    } catch (e) {
                      toast.error(
                        e instanceof Error ? e.message : 'Publication failed',
                      );
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  Publish checked revision
                </Button>
                <div className="table-wrap">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="p-3">Issue</th>
                        <th>Record</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report?.gate.issues.map((i, n) => (
                        <tr key={n} className="border-t">
                          <td className="p-3">{i.code.replaceAll('_', ' ')}</td>
                          <td>{i.entityId ?? 'Catalog'}</td>
                          <td className="p-3">{i.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <GeometryProfiles version={version} />
            <SourceControls version={version} />
            <h2>Compare versions</h2>
            {data ? (
              <VersionPicker
                versions={data.versions.filter((v) => v._id !== version._id)}
                value={before}
                onChange={setBefore}
              />
            ) : null}
            {diff ? (
              <pre className="source-quote">
                {JSON.stringify(JSON.parse(diff), null, 2)}
              </pre>
            ) : (
              <p className="muted">
                Choose an earlier version to see added, removed, and changed
                records.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
