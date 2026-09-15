'use client';
import { useEffect, useRef, useState } from 'react';
import { useConvex } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import {
  parseProjectBackup,
  type ProjectBackup,
} from '@/designer/project-backup';
import { canonical } from '@/designer/installer-handoff';
import { downloadJson } from './business-tools';
const content = (b: ProjectBackup) => {
  const shared = { ...b, createdAt: '' };
  delete shared.trades;
  delete shared.presentationScenes;
  return canonical(shared);
};
type Row = {
  id: Id<'sharedProjects'>;
  name: string;
  designId: string;
  revision: number;
  updatedAt: number;
  role: 'owner' | 'editor' | 'viewer';
};
export type SharedBinding = {
  id: Id<'sharedProjects'>;
  revision: number;
  role: Row['role'];
};
export function SharedProjectRecords({
  ownerId,
  bundle,
  getCurrent,
  onLoad,
}: {
  ownerId: string;
  bundle: ProjectBackup;
  getCurrent: () => ProjectBackup;
  onLoad: (b: ProjectBackup, binding: SharedBinding) => void;
}) {
  const client = useConvex(),
    key = `kitchen-shared:${ownerId}:${bundle.design.id}`;
  const [rows, setRows] = useState<Row[]>([]),
    [binding, setSharedBinding] = useState<SharedBinding | null>(null),
    [pending, setPending] = useState<{
      backup: ProjectBackup;
      binding: SharedBinding;
      local: string;
    } | null>(null),
    [members, setMembers] = useState<
      { userId: Id<'users'>; role: Row['role'] }[]
    >([]),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [user, setUser] = useState(''),
    [role, setRole] = useState<'editor' | 'viewer'>('viewer');
  const latest = useRef(getCurrent);
  latest.current = getCurrent;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      const b = raw ? JSON.parse(raw) : null;
      if (
        b &&
        typeof b.id === 'string' &&
        Number.isInteger(b.revision) &&
        ['owner', 'editor', 'viewer'].includes(b.role)
      )
        setSharedBinding(b);
    } catch {
      setMessage('Could not read the local shared-project binding.');
    }
  }, [key]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setMessage(
        `Shared records unavailable or not saved: ${(e as Error).message}`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setRows(await client.query(api.sharedProjects.list, {}));
  }
  async function publish(create: boolean) {
    if (!create && !binding) throw Error('Load a shared revision first.');
    const current = { ...latest.current() };
    delete current.trades;
    delete current.presentationScenes;
    const oldRaw = localStorage.getItem(key);
    if (
      !create &&
      canonical(oldRaw ? JSON.parse(oldRaw) : null) !== canonical(binding)
    )
      throw Error(
        'Shared binding changed in another tab. Reload before publishing.',
      );
    const saved = await client.mutation(api.sharedProjects.publish, {
      backupJson: JSON.stringify(current),
      expectedRevision: create ? 0 : (binding?.revision ?? 0),
      ...(!create && binding ? { sharedId: binding.id } : {}),
    });
    if ('error' in saved) throw Error(saved.error);
    const next: SharedBinding = {
      id: saved.sharedId,
      revision: saved.revision,
      role: create ? 'owner' : (binding?.role ?? 'viewer'),
    };
    if (oldRaw !== localStorage.getItem(key))
      throw Error(
        'Shared binding changed in another tab. Remote save succeeded; load its revision before publishing again.',
      );
    localStorage.setItem(key, JSON.stringify(next));
    setSharedBinding(next);
    await refresh();
    setMessage(
      content(current) === content(latest.current())
        ? `Shared revision ${saved.revision} published. Source and approval claims require re-verification when loaded.`
        : 'Snapshot published; newer local edits remain unpublished.',
    );
  }
  return (
    <details className="business-panel support-panel">
      <summary>Shared project records</summary>
      <p>
        Share complete project snapshots, purchasing, warranties, service
        records and operations. Load a revision, edit locally, then publish.
        Revision conflicts are rejected; newer remote data never overwrites
        local work automatically. Source-review, approval and completion claims
        must be reverified after transfer. Trade estimates remain local;
        transfer them with a complete backup or trade-settings export.
      </p>
      <p>
        Your account ID: <code>{ownerId}</code>. Give this to the project owner
        to request access.
      </p>
      <div className="designer-row">
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              await refresh();
              setMessage('Shared project list refreshed.');
            })
          }
        >
          Refresh shared projects
        </button>
        <button
          disabled={busy || !!binding}
          onClick={() => run(() => publish(true))}
        >
          Create shared project
        </button>
        {binding && (
          <button
            disabled={busy || binding.role === 'viewer'}
            onClick={() => run(() => publish(false))}
          >
            Publish local records
          </button>
        )}
        <button
          onClick={() =>
            downloadJson(latest.current(), 'before-shared-load-backup.json')
          }
        >
          Back up local records
        </button>
      </div>
      {binding && (
        <p>
          Loaded/shared revision {binding.revision} · {binding.role}. Refreshing
          the list does not change your editing revision.
        </p>
      )}
      {rows.map((r) => (
        <article className="purchase-card" key={r.id}>
          <h4>{r.name}</h4>
          <p>
            Revision {r.revision} · {r.role} ·{' '}
            {new Date(r.updatedAt).toLocaleString()}
          </p>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const local = content(latest.current());
                const remote = await client.query(api.sharedProjects.get, {
                  sharedId: r.id,
                });
                setPending({
                  backup: parseProjectBackup(remote.backupJson),
                  binding: {
                    id: r.id,
                    revision: remote.revision,
                    role: remote.role,
                  },
                  local,
                });
                setMessage(
                  'Review the shared snapshot before replacing local records. Export your current work first if needed.',
                );
              })
            }
          >
            Review shared revision {r.revision}
          </button>
          {r.role === 'owner' && (
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (!binding || binding.id !== r.id)
                    throw Error(
                      'Load this shared project before managing its members.',
                    );
                  setMembers(
                    await client.query(api.sharedProjects.members, {
                      sharedId: r.id,
                    }),
                  );
                })
              }
            >
              Manage members
            </button>
          )}
        </article>
      ))}
      {pending && (
        <article className="purchase-card">
          <h4>
            Load {pending.backup.design.name} · revision{' '}
            {pending.binding.revision}
          </h4>
          <p>
            {pending.backup.design.items.length} items ·{' '}
            {pending.backup.purchasing.purchases.length} purchase drafts ·{' '}
            {pending.backup.support?.cases.length ?? 0} service requests. This
            replaces the local records for this project identity; cloud design
            saves remain separate.
          </p>
          <button
            disabled={busy}
            onClick={() => {
              try {
                if (content(latest.current()) !== pending.local)
                  throw Error(
                    'Local records changed since preview. Review the shared revision again.',
                  );
                onLoad(pending.backup, pending.binding);
                setSharedBinding(pending.binding);
                setPending(null);
                setMessage('Shared revision loaded locally.');
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            Load shared revision locally
          </button>
          <button onClick={() => setPending(null)}>Cancel shared load</button>
        </article>
      )}
      {binding?.role === 'owner' && (
        <fieldset>
          <legend>Project members</legend>
          <p>
            Viewers can read and export; editors can publish revisions. Only the
            owner can grant or revoke access. Access removal cannot recall
            already downloaded copies.
          </p>
          <label>
            Teammate account ID
            <input
              aria-label="Teammate account ID"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              maxLength={100}
            />
          </label>
          <label>
            Access
            <select
              aria-label="Teammate access"
              value={role}
              onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
          </label>
          <button
            disabled={busy || !user.trim()}
            onClick={() =>
              run(async () => {
                await client.mutation(api.sharedProjects.setMember, {
                  sharedId: binding.id,
                  userId: user.trim() as Id<'users'>,
                  role,
                });
                setMembers(
                  await client.query(api.sharedProjects.members, {
                    sharedId: binding.id,
                  }),
                );
                setMessage('Member access saved.');
              })
            }
          >
            Save member access
          </button>
          {members.map((m) => (
            <p key={m.userId}>
              {m.userId} · {m.role}{' '}
              {m.role !== 'owner' && (
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await client.mutation(api.sharedProjects.setMember, {
                        sharedId: binding.id,
                        userId: m.userId,
                        role: 'remove',
                      });
                      setMembers(
                        await client.query(api.sharedProjects.members, {
                          sharedId: binding.id,
                        }),
                      );
                      setMessage('Member access revoked.');
                    })
                  }
                >
                  Revoke {m.userId}
                </button>
              )}
            </p>
          ))}
        </fieldset>
      )}
      <p role="status">{message}</p>
    </details>
  );
}
