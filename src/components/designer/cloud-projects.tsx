'use client';
import { useEffect, useRef, useState } from 'react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { parseDesign, type Design } from '@/designer/model';
import { ProjectDirectory } from './project-directory';
import { downloadJson } from './business-tools';

type Binding = { projectId: Id<'projects'>; revision: number };
export function CloudProjects({
  design,
  ownerId,
  onOpen,
  onLocate,
}: {
  design: Design;
  ownerId: string;
  onOpen: (d: Design) => void;
  onLocate: (id: string) => void;
}) {
  const client = useConvex(),
    save = useMutation(api.projects.save),
    createReview = useMutation(api.projects.createReview),
    revoke = useMutation(api.projects.revokeReview);
  const projects = useQuery(api.projects.list, {});
  const key = `kitchen-cloud:${ownerId}:${design.id}`;
  const [binding, setBinding] = useState<Binding | null>(null),
    bindingRef = useRef<Binding | null>(null);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [paused, setPaused] = useState(false),
    [message, setMessage] = useState(''),
    [tick, setTick] = useState(0);
  const [shareUrl, setShareUrl] = useState('');
  const [feedbackId, setFeedbackId] = useState<Id<'projectReviews'> | null>(
    null,
  );
  const lastSaved = useRef('');
  const json = JSON.stringify(design),
    latestJson = useRef(json);
  latestJson.current = json;
  const backups = useQuery(
    api.projects.history,
    binding ? { projectId: binding.projectId } : 'skip',
  );
  const links = useQuery(
    api.projects.listReviews,
    binding ? { projectId: binding.projectId } : 'skip',
  );
  const feedback = useQuery(
    api.projects.reviewFeedback,
    feedbackId ? { reviewId: feedbackId } : 'skip',
  );
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const value = JSON.parse(raw);
        if (
          typeof value.projectId === 'string' &&
          Number.isInteger(value.revision)
        ) {
          bindingRef.current = value;
          setBinding(value);
        }
      }
    } catch {
      /* Local bindings are optional; projects remain in the account. */
    }
    setReady(true);
  }, [key]);
  function bind(value: Binding, designId = design.id) {
    bindingRef.current = value;
    setBinding(value);
    try {
      localStorage.setItem(
        `kitchen-cloud:${ownerId}:${designId}`,
        JSON.stringify(value),
      );
    } catch {
      /* Cloud save succeeded even when browser storage is full. */
    }
  }
  async function persist(copy = false) {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setMessage('Saving to cloud…');
    const snapshot = latestJson.current;
    try {
      const source = parseDesign(snapshot),
        current = copy ? null : bindingRef.current;
      const result = await save({
        name: source.name,
        designJson: snapshot,
        ...(current
          ? { projectId: current.projectId, expectedRevision: current.revision }
          : {}),
      });
      bind(result);
      if (
        source.storageProfile ||
        source.siteTasks?.length ||
        source.selectionBoard
      ) {
        const savedProject = await client.query(api.projects.get, {
          projectId: result.projectId,
        });
        const savedDesign = parseDesign(savedProject.designJson);
        if (
          JSON.stringify(savedDesign.selectionBoard) !==
            JSON.stringify(source.selectionBoard) ||
          JSON.stringify(savedDesign.storageProfile) !==
            JSON.stringify(source.storageProfile) ||
          JSON.stringify(savedDesign.siteTasks ?? []) !==
            JSON.stringify(source.siteTasks ?? [])
        ) {
          throw Error(
            'Cloud storage did not preserve the new project fields. Update the backend before syncing this design; export a local backup now',
          );
        }
      }
      lastSaved.current = snapshot;
      setPaused(false);
      setMessage(`Cloud saved · revision ${result.revision}`);
      return result;
    } catch (e) {
      setPaused(true);
      setMessage(
        `Cloud save paused: ${(e as Error).message}. Open the cloud version to reload it, or save a separate cloud copy. Your local draft is retained.`,
      );
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
      setTick((t) => t + 1);
    }
  }
  // One write at a time. A follow-up edit is saved after the in-flight revision returns.
  useEffect(() => {
    if (!ready || !binding || paused || json === lastSaved.current) return;
    const timer = setTimeout(() => {
      void persist();
    }, 1200);
    return () => clearTimeout(timer);
    // persist reads the current JSON and revision from refs.
  }, [json, ready, binding?.projectId, paused, tick]);
  async function openProject(id: string) {
    if (!id || busyRef.current) return;
    try {
      const project = await client.query(api.projects.get, {
        projectId: id as Binding['projectId'],
      });
      const next = parseDesign(project.designJson);
      bind({ projectId: project._id, revision: project.revision }, next.id);
      lastSaved.current = project.designJson;
      setPaused(false);
      setShareUrl('');
      onOpen(next);
      setMessage(`Opened cloud revision ${project.revision}.`);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <details className="business-panel">
      <summary>Cloud projects & client reviews</summary>
      <p>
        {binding
          ? 'Edits save to your account after a short pause. Previous cloud revisions are retained.'
          : 'Save this design to your account to enable automatic cloud backups and open it on other devices.'}
      </p>
      <div className="designer-row">
        <button disabled={!ready || busy} onClick={() => void persist()}>
          Save to cloud
        </button>
        <button disabled={busy} onClick={() => void persist(true)}>
          Save separate cloud copy
        </button>
        <button
          onClick={() => downloadJson(design, 'local-design-backup.json')}
        >
          Export local backup
        </button>
      </div>
      <div className="designer-row">
        <ProjectDirectory
          projects={projects}
          ownerId={ownerId}
          busy={busy}
          onOpen={(id) => void openProject(id)}
        />
        {binding && (
          <button
            disabled={busy}
            onClick={() => void openProject(binding.projectId)}
          >
            Reload cloud version
          </button>
        )}
      </div>
      {binding && !busy && json !== lastSaved.current && !paused && (
        <p>Local changes are waiting to sync…</p>
      )}
      <p role="status">
        {message ||
          (binding
            ? `Connected to revision ${binding.revision}`
            : 'Local draft only')}
      </p>
      {binding && (
        <>
          <details>
            <summary>Cloud backup history</summary>
            {backups?.map((b) => (
              <div className="designer-row" key={b._id}>
                <span>
                  Revision {b.revision} ·{' '}
                  {new Date(b.createdAt).toLocaleString()}
                </span>
                <button
                  disabled={busy}
                  onClick={async () => {
                    try {
                      const backup = await client.query(
                        api.projects.getBackup,
                        { backupId: b._id },
                      );
                      lastSaved.current = '';
                      onOpen(parseDesign(backup.designJson));
                      setMessage(
                        'Backup restored locally; it will save as a new cloud revision.',
                      );
                    } catch (e) {
                      setMessage((e as Error).message);
                    }
                  }}
                >
                  Restore revision {b.revision}
                </button>
              </div>
            ))}
          </details>
          <h3>Client review links</h3>
          <p>
            Create a link to a saved snapshot. Anyone with the link can view and
            leave named feedback for 7 days. Approval is recorded for that
            snapshot; names are self-reported.
          </p>
          <button
            disabled={busy}
            onClick={async () => {
              const saved = await persist();
              if (!saved) return;
              try {
                const token = Array.from(
                  crypto.getRandomValues(new Uint8Array(32)),
                  (b) => b.toString(16).padStart(2, '0'),
                ).join('');
                await createReview({
                  projectId: saved.projectId,
                  expectedRevision: saved.revision,
                  token,
                  expiresInDays: 7,
                });
                setShareUrl(`${location.origin}/client-review#${token}`);
                setMessage(
                  'Review link created. Copy it to share with your client.',
                );
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            Create review link
          </button>
          {shareUrl && (
            <div>
              <label>
                Review link
                <input
                  aria-label="Review link"
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    setMessage('Review link copied.');
                  } catch {
                    setMessage('Select the review link and copy it.');
                  }
                }}
              >
                Copy review link
              </button>
              {/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(shareUrl) && (
                <p>
                  This address is local. External clients need access through a
                  hosted app address.
                </p>
              )}
              <a href={shareUrl} target="_blank" rel="noreferrer">
                Open client preview
              </a>
            </div>
          )}
          {links?.map((link) => (
            <div className="designer-row" key={link._id}>
              <span>
                Revision {link.revision} ·{' '}
                {link.revoked
                  ? 'Revoked'
                  : `expires ${new Date(link.expiresAt).toLocaleDateString()}`}
              </span>
              <button onClick={() => setFeedbackId(link._id)}>
                View feedback
              </button>
              <button
                disabled={link.revoked}
                onClick={async () => {
                  try {
                    await revoke({ reviewId: link._id });
                    setShareUrl('');
                    setMessage('Review link revoked.');
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              >
                Revoke link
              </button>
            </div>
          ))}
          {feedback && (
            <section>
              <h4>Feedback for revision {feedback.revision}</h4>
              {feedback.comments.length === 0 && <p>No feedback yet.</p>}
              {feedback.comments.map((c, index) => (
                <p key={index}>
                  <strong>
                    {c.name} · {c.kind}
                  </strong>
                  : {c.text}
                  {c.itemId &&
                    (design.items.some((i) => i.id === c.itemId) ? (
                      <button onClick={() => onLocate(c.itemId ?? '')}>
                        Locate{' '}
                        {design.items.find((i) => i.id === c.itemId)?.sku}
                      </button>
                    ) : (
                      <span>
                        {' '}
                        (Pinned item is absent from the current design.)
                      </span>
                    ))}
                </p>
              ))}
            </section>
          )}
        </>
      )}
    </details>
  );
}
