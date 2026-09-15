'use client';
import { useEffect, useRef, useState } from 'react';
import { useConvex } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { parseDesign } from '@/designer/model';
import {
  directoryEntrySchema,
  directorySchema,
  matchesProject,
  type DirectoryEntry,
} from '@/designer/project-directory';
import { downloadJson } from './business-tools';
type Project = {
  _id: Id<'projects'>;
  name: string;
  revision: number;
  clientName?: string;
  workflowStatus?: string;
};
export function ProjectDirectory({
  projects,
  ownerId,
  busy,
  onOpen,
}: {
  projects: Project[] | undefined;
  ownerId: string;
  busy: boolean;
  onOpen: (id: string) => void;
}) {
  const client = useConvex(),
    key = `kitchen-directory:${ownerId}`;
  const [entries, setEntries] = useState<Record<string, DirectoryEntry>>({}),
    [ready, setReady] = useState(false),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState(''),
    [archived, setArchived] = useState(false),
    [selected, setSelected] = useState(''),
    [message, setMessage] = useState(''),
    [indexing, setIndexing] = useState(false);
  const latest = useRef(entries);
  latest.current = entries;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setEntries(directorySchema.parse(JSON.parse(raw)));
      setReady(true);
    } catch {
      setMessage(
        'Directory could not be read. Import a valid backup to recover it.',
      );
    }
  }, [key]);
  function save(next: Record<string, DirectoryEntry>) {
    try {
      const valid = directorySchema.parse(next);
      localStorage.setItem(key, JSON.stringify(valid));
      latest.current = valid;
      setEntries(valid);
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      return false;
    }
  }
  const entryFor = (p: Project) =>
    entries[p._id] ??
    directoryEntrySchema.parse({ client: p.clientName ?? '' });
  const filtered = projects?.filter((p) =>
    matchesProject(p.name, entryFor(p), query, archived, status),
  );
  const project = projects?.find((p) => p._id === selected),
    entry = project ? entryFor(project) : undefined;
  function patch(change: Partial<DirectoryEntry>) {
    if (entry && project)
      save({ ...entries, [project._id]: { ...entry, ...change } });
  }
  return (
    <section className="project-directory" aria-label="Project directory">
      <h3>Find and organize projects</h3>
      <p>
        Search the latest 50 cloud projects by name, client, room, tags, status
        or indexed SKU. Organization and archive choices are saved in this
        browser. Status labels are organizational; they do not verify client
        approval.
      </p>
      <div className="business-grid">
        <label>
          Search projects
          <input
            aria-label="Search projects"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Client, room, SKU or tag"
          />
        </label>
        <label>
          Project status filter
          <select
            aria-label="Project status filter"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {['draft', 'review', 'approved', 'ordering', 'installed'].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Project visibility
          <select
            aria-label="Project visibility"
            value={archived ? 'archived' : 'active'}
            onChange={(e) => {
              setArchived(e.target.value === 'archived');
              setSelected('');
            }}
          >
            <option value="active">Active projects</option>
            <option value="archived">Archived projects</option>
          </select>
        </label>
      </div>
      <p>
        {projects
          ? `${filtered?.length} of ${projects.length} projects shown`
          : 'Loading cloud projects…'}
      </p>
      <div className="designer-row">
        <select
          aria-label="Cloud project"
          value={filtered?.some((p) => p._id === selected) ? selected : ''}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Choose a cloud project</option>
          {filtered?.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name} · revision {p.revision}
            </option>
          ))}
        </select>
        <button
          disabled={
            !selected || busy || !filtered?.some((p) => p._id === selected)
          }
          onClick={() => onOpen(selected)}
        >
          Open cloud project
        </button>
        <button
          disabled={!ready || indexing || !projects?.length}
          onClick={async () => {
            setIndexing(true);
            let failed = 0;
            const updates: Record<
              string,
              { skus: string[]; indexedRevision: number }
            > = {};
            const pending = projects ?? [];
            for (let offset = 0; offset < pending.length; offset += 5) {
              await Promise.all(
                pending.slice(offset, offset + 5).map(async (p) => {
                  try {
                    const saved = await client.query(api.projects.get, {
                      projectId: p._id,
                    });
                    const d = parseDesign(saved.designJson);
                    updates[p._id] = {
                      skus: [...new Set(d.items.map((i) => i.sku))],
                      indexedRevision: saved.revision,
                    };
                  } catch {
                    failed++;
                  }
                }),
              );
            }
            const next = { ...latest.current };
            for (const p of pending)
              if (updates[p._id])
                next[p._id] = {
                  ...(next[p._id] ??
                    directoryEntrySchema.parse({ client: p.clientName ?? '' })),
                  ...updates[p._id],
                };
            if (save(next))
              setMessage(
                `SKU index refreshed for ${Object.keys(updates).length} projects. ${failed} could not be read.`,
              );
            setIndexing(false);
          }}
        >
          Refresh SKU search index
        </button>
      </div>
      {project && entry && (
        <fieldset disabled={!ready || indexing}>
          <legend>Organize {project.name}</legend>
          <div className="business-grid">
            <label>
              Client
              <input
                aria-label="Directory client"
                maxLength={160}
                value={entry.client}
                onChange={(e) => patch({ client: e.target.value })}
              />
            </label>
            <label>
              Room name
              <input
                aria-label="Directory room"
                maxLength={100}
                value={entry.room}
                onChange={(e) => patch({ room: e.target.value })}
              />
            </label>
            <label>
              Tags
              <input
                aria-label="Directory tags"
                maxLength={300}
                value={entry.tags}
                onChange={(e) => patch({ tags: e.target.value })}
                placeholder="renovation, priority"
              />
            </label>
            <label>
              Workflow status
              <select
                aria-label="Directory status"
                value={entry.status}
                onChange={(e) =>
                  patch({ status: e.target.value as DirectoryEntry['status'] })
                }
              >
                {['draft', 'review', 'approved', 'ordering', 'installed'].map(
                  (s) => (
                    <option key={s}>{s}</option>
                  ),
                )}
              </select>
            </label>
          </div>
          <p>
            {entry.indexedRevision === project.revision
              ? 'SKU index matches current cloud revision.'
              : 'Refresh SKU search to include the latest cloud revision.'}
          </p>
          <button
            onClick={() => {
              patch({ archived: !entry.archived });
              setSelected('');
            }}
          >
            {entry.archived ? 'Restore to active projects' : 'Archive project'}
          </button>
        </fieldset>
      )}
      <div className="designer-row">
        <button
          onClick={() =>
            downloadJson(
              { format: 'kitchen-directory-v1', entries },
              'project-directory.json',
            )
          }
        >
          Export organization backup
        </button>
        <label>
          Import organization backup
          <input
            type="file"
            accept=".json"
            aria-label="Import organization backup"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                if (f.size > 1000000) throw Error('Directory exceeds 1 MB.');
                const data = JSON.parse(await f.text());
                if (data.format !== 'kitchen-directory-v1')
                  throw Error('Invalid directory format.');
                if (save(directorySchema.parse(data.entries))) {
                  setReady(true);
                  setMessage(
                    'Organization backup imported; existing entries replaced.',
                  );
                }
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          />
        </label>
      </div>
      <p>
        Import replaces organization entries. Export a backup first. Archiving
        hides a project from the active list without deleting its cloud data.
      </p>
      <p role="status">{message}</p>
    </section>
  );
}
