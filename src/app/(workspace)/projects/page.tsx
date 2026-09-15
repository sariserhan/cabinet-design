'use client';
import { useMemo, useState } from 'react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { useRouter } from 'next/navigation';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { parseDesign } from '@/designer/model';
const stages = {
  draft: 'Draft',
  awaiting_feedback: 'Awaiting feedback',
  approved: 'Approved',
  ordered: 'Ordered',
} as const;
type Stage = keyof typeof stages;
export default function ProjectsPage() {
  const projects = useQuery(api.projects.list, {}),
    viewer = useQuery(api.workspace.viewer, {}),
    client = useConvex(),
    router = useRouter();
  const [search, setSearch] = useState(''),
    [stage, setStage] = useState('all'),
    [message, setMessage] = useState('');
  const filtered = useMemo(
    () =>
      projects
        ?.filter(
          (p) =>
            (stage === 'all' || p.workflowStatus === stage) &&
            `${p.name} ${p.clientName}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [projects, search, stage],
  );
  async function open(id: Id<'projects'>) {
    if (!viewer) return;
    try {
      const project = await client.query(api.projects.get, { projectId: id });
      const design = parseDesign(project.designJson);
      // Keep the current local draft intact until the editor accepts this explicit open request.
      sessionStorage.setItem(
        `kitchen-open:${viewer.id}`,
        JSON.stringify({ design, projectId: id, revision: project.revision }),
      );
      router.push('/designer');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <div className="page-body">
      <h1>Client projects</h1>
      <p>
        Cloud projects, client names and progress in one place. Project stages
        are managed by you; review approvals remain tied to their shared
        revision.
      </p>
      <div className="business-grid">
        {Object.entries(stages).map(([key, label]) => (
          <button
            className="project-stage-card"
            key={key}
            aria-pressed={stage === key}
            onClick={() => setStage(stage === key ? 'all' : key)}
          >
            <strong>
              {projects?.filter((p) => p.workflowStatus === key).length ?? 0}
            </strong>
            <span>{label}</span>
          </button>
        ))}
      </div>
      <section className="business-panel">
        <div className="designer-row">
          <label>
            Find a project
            <input
              aria-label="Search projects"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Project or client name"
            />
          </label>
          <label>
            Project stage
            <select
              aria-label="Filter project stage"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              <option value="all">All stages</option>
              {Object.entries(stages).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {projects === undefined && <p>Loading projects…</p>}
        {filtered?.length === 0 && (
          <p>
            No matching cloud projects. Save a design to cloud in the designer
            to add it here.
          </p>
        )}
        <div className="business-grid">
          {filtered?.map((project) => (
            <ProjectCard
              key={`${project._id}:${project.metadataRevision}`}
              project={project}
              onOpen={() => void open(project._id)}
            />
          ))}
        </div>
        {message && <p role="alert">{message}</p>}
      </section>
    </div>
  );
}
function ProjectCard({
  project,
  onOpen,
}: {
  project: {
    _id: Id<'projects'>;
    name: string;
    clientName: string;
    workflowStatus: Stage;
    metadataRevision: number;
    revision: number;
    updatedAt: number;
  };
  onOpen: () => void;
}) {
  const [clientName, setClientName] = useState(project.clientName),
    [stage, setStage] = useState<Stage>(project.workflowStatus),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const update = useMutation(api.projects.updateMetadata);
  return (
    <article className="project-card">
      <h2>{project.name}</h2>
      <p>
        Revision {project.revision} ·{' '}
        {new Date(project.updatedAt).toLocaleDateString()}
      </p>
      <label>
        Client
        <input
          aria-label={`Client for ${project.name}`}
          maxLength={160}
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
        />
      </label>
      <label>
        Stage
        <select
          aria-label={`Stage for ${project.name}`}
          value={stage}
          onChange={(e) => setStage(e.target.value as Stage)}
        >
          {Object.entries(stages).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={
          busy ||
          (clientName === project.clientName &&
            stage === project.workflowStatus)
        }
        onClick={async () => {
          setBusy(true);
          try {
            await update({
              projectId: project._id,
              expectedMetadataRevision: project.metadataRevision,
              clientName,
              workflowStatus: stage,
            });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save project details
      </button>
      <button onClick={onOpen}>Open design</button>
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
