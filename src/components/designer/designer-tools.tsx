'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Download, Upload } from 'lucide-react';
import type { Design } from '@/designer/model';
import { newDesign } from '@/designer/model';
import { polishedSample } from '@/designer/sample';
import { AlternativeLayouts } from './business-tools';
import { CloudProjects } from './cloud-projects';
import { ShortcutHelp } from './demo-tools';
import { DesignDecisions } from './design-decisions';
import { DesignRecovery, SmartPlacement } from './experience-tools';
import { FirstUseGuide } from './first-use-guide';
import { JobWorkspace } from './job-workspace';
import { ProjectHub, openProjectTool } from './project-hub';
import { ProjectWorkflow } from './project-workflow';
import { PurchasingWorkspace } from './purchasing-workspace';
import { ObjectManager, ReadinessCheck, SampleStory } from './studio-panels';
import { TradeWorkspaces } from './trade-workspaces';
import { download } from './designer-widgets';
import type { History, ViewMode, WorkspaceStage } from './designer-state';

type Commit = (
  change: (current: Design) => Design,
  protectPlacement?: boolean,
) => void;

/**
 * The collapsed "more tools" drawer: everything outside the primary
 * Room -> Cabinets -> Design -> Quote -> Present path.
 */
export function DesignerMoreTools({
  design,
  ownerId,
  version,
  templateRaw,
  selected,
  setSelected,
  openId,
  setOpenId,
  saved,
  past,
  setHistory,
  selection,
  setSelection,
  setInspectorCollapsed,
  setMode,
  setBefore,
  setWorkspaceStage,
  recordsEpoch,
  setRecordsEpoch,
  setStatus,
  commit,
  example,
  open,
  importFile,
  walkthroughStep,
  file,
}: {
  design: Design;
  ownerId: string;
  version: { _id: string } | undefined;
  templateRaw: string | undefined;
  selected: string | null;
  setSelected: Dispatch<SetStateAction<string | null>>;
  openId: string;
  setOpenId: Dispatch<SetStateAction<string>>;
  saved: Design[];
  past: Design[];
  setHistory: Dispatch<SetStateAction<History | null>>;
  selection: string[];
  setSelection: Dispatch<SetStateAction<string[]>>;
  setInspectorCollapsed: Dispatch<SetStateAction<boolean>>;
  setMode: Dispatch<SetStateAction<ViewMode>>;
  setBefore: Dispatch<SetStateAction<Design | null>>;
  setWorkspaceStage: Dispatch<SetStateAction<WorkspaceStage>>;
  recordsEpoch: number;
  setRecordsEpoch: Dispatch<SetStateAction<number>>;
  setStatus: Dispatch<SetStateAction<string>>;
  commit: Commit;
  example: () => void;
  open: () => void;
  importFile: (imported: File) => Promise<void>;
  walkthroughStep: (step: number) => void;
  file: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <details className="workspace-more-tools">
      <summary>
        More tools{' '}
        <span>Files, job checks, other trades &amp; project management</span>
      </summary>
      <p className="tools-intro">
        Choose a section below. Your design stays open while you work.
      </p>
      <JobWorkspace
        key={`job:${design.id}:${recordsEpoch}`}
        design={design}
        ownerId={ownerId}
        onApply={(next) => commit(() => next)}
        onLocate={(id) => {
          setWorkspaceStage('Design');
          setSelected(id);
          setMode('2d');
        }}
      />
      <TradeWorkspaces
        key={`trades:${design.id}`}
        design={design}
        ownerId={ownerId}
      />
      <details className="studio-support">
        <summary>
          Project tools · approvals, orders, installation & aftercare
        </summary>
        <ProjectHub
          key={`hub:${design.id}:${recordsEpoch}`}
          selectedIds={
            selection.length ? selection : selected ? [selected] : []
          }
          onApply={(next) => commit(() => next, true)}
          onLocate={(id) => {
            setWorkspaceStage('Design');
            setSelected(id);
            setMode('2d');
            document
              .getElementById('design-workspace')
              ?.scrollIntoView({ behavior: 'smooth' });
          }}
          design={design}
          ownerId={ownerId}
          onSharedLoad={(next) => {
            setHistory({ past: [], current: next, future: [] });
            setSelected(null);
            setSelection([]);
            setBefore(next);
            setRecordsEpoch((v) => v + 1);
            setStatus('Shared project revision loaded locally.');
          }}
          onRestore={(next) => {
            setHistory({ past: [], current: next, future: [] });
            setSelected(null);
            setSelection([]);
            setBefore(next);
            setStatus('Complete project restored as a separate local copy.');
          }}
        />
        <FirstUseGuide
          ownerId={ownerId}
          design={design}
          onDemo={() => walkthroughStep(0)}
        />
        <PurchasingWorkspace
          key={`purchasing:${design.id}:${recordsEpoch}`}
          ownerId={ownerId}
          design={design}
          onLocate={(id) => {
            setWorkspaceStage('Design');
            setSelected(id);
            setMode('2d');
            document
              .querySelector('.canvas-panel-controls')
              ?.scrollIntoView({ behavior: 'smooth' });
          }}
        />
        <ProjectWorkflow
          key={`workflow:${design.id}:${recordsEpoch}`}
          design={design}
          ownerId={ownerId}
          onLocate={(id) => {
            setWorkspaceStage('Design');
            setSelected(id);
            setMode('2d');
            document
              .querySelector('.canvas-panel-controls')
              ?.scrollIntoView({ behavior: 'smooth' });
          }}
          onNavigate={(stage, target) => {
            if (stage === 'Design') {
              setMode('2d');
              document
                .querySelector('.canvas-panel-controls')
                ?.scrollIntoView({ behavior: 'smooth' });
              return;
            }
            const label =
              target === 'selections'
                ? 'Design decisions · budget, checks & site handoff'
                : stage === 'Measure'
                  ? 'Guided room measurements'
                  : stage === 'Price'
                    ? 'Supplier quotes'
                    : stage === 'Present'
                      ? 'Cloud projects & client reviews'
                      : 'Design decisions · budget, checks & site handoff';
            openProjectTool(label);
            const section = Array.from(
              document.querySelectorAll('details'),
            ).find(
              (d) => d.querySelector(':scope > summary')?.textContent === label,
            );
            if (section) {
              section.open = true;
              section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            if (
              target === 'selections' ||
              stage === 'Install' ||
              stage === 'Check'
            )
              setTimeout(() => {
                const name =
                  target === 'selections'
                    ? 'Client selections'
                    : stage === 'Install'
                      ? 'Installer handoff'
                      : 'Explain checks';
                Array.from(
                  section?.querySelectorAll<HTMLButtonElement>(
                    '[role="tab"]',
                  ) ?? [],
                )
                  .find((b) => b.textContent === name)
                  ?.click();
              }, 100);
          }}
        />
        <CloudProjects
          onLocate={(id) => {
            setWorkspaceStage('Design');
            setSelected(id);
            setMode('2d');
          }}
          key={`cloud:${design.id}`}
          design={design}
          ownerId={ownerId}
          onOpen={(next) => {
            setHistory((h) =>
              h
                ? {
                    past: [...h.past, h.current].slice(-60),
                    current: next,
                    future: [],
                  }
                : { past: [], current: next, future: [] },
            );
            setSelected(null);
            setBefore(next);
          }}
        />
        <AlternativeLayouts
          design={design}
          onChange={(next) => commit(() => next, true)}
        />
        <DesignDecisions
          design={design}
          versionId={version?._id}
          onChange={(next) => commit(() => next)}
          onLocate={(id) => {
            setWorkspaceStage('Design');
            setSelected(id);
            setMode('2d');
          }}
        />
        <ShortcutHelp />
      </details>
      <details className="project-controls">
        <summary>Project files & examples</summary>
        <div className="designer-projectbar">
          <span>Draft saves automatically in this browser</span>
          <div className="designer-row">
            <select
              id="saved-designs"
              aria-label="Saved designs"
              value={openId}
              onChange={(e) => setOpenId(e.target.value)}
            >
              <option value="">Choose a saved design</option>
              {saved.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.items.length} cabinets
                </option>
              ))}
            </select>
            <button disabled={!openId} onClick={open}>
              Open
            </button>
            <button
              onClick={() => {
                commit(() => newDesign());
                setSelected(null);
                setStatus(
                  'New room created. Undo restores the previous design.',
                );
              }}
            >
              New room
            </button>

            <button
              onClick={() => {
                commit(() => polishedSample());
                setSelected(null);
                setMode('render');
                setStatus(
                  'Presentation kitchen loaded. Undo restores your previous design.',
                );
              }}
            >
              Load presentation kitchen
            </button>
            <button disabled={!templateRaw} onClick={example}>
              Load example kitchen
            </button>
            <button
              onClick={() =>
                download(
                  JSON.stringify(design, null, 2),
                  `${design.name.replace(/[^a-z0-9-]/gi, '_')}.json`,
                  'application/json',
                )
              }
            >
              <Download size={14} /> Export
            </button>
            <button onClick={() => file.current?.click()}>
              <Upload size={14} /> Import
            </button>
            <input
              hidden
              ref={file}
              type="file"
              accept=".json,application/json"
              aria-label="Import design file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
              }}
            />
          </div>
        </div>
      </details>
      <details className="studio-support">
        <summary>Recovery & advanced placement</summary>
        <DesignRecovery
          key={`recovery-${design.id}`}
          design={design}
          ownerId={ownerId}
          past={past}
          onRestore={(next) => {
            setHistory((h) =>
              h
                ? {
                    past: [...h.past, h.current].slice(-60),
                    current: next,
                    future: [],
                  }
                : h,
            );
            setSelected(null);
            setSelection([]);
            setStatus('Design restored. Undo returns to the previous version.');
          }}
        />
        <SmartPlacement
          design={design}
          selected={selected}
          onChange={(next) => commit(() => next, true)}
        />
        <SampleStory design={design} onChange={(next) => commit(() => next)} />
        <ObjectManager
          design={design}
          onChange={(next) => commit(() => next)}
          onSelect={(id) => {
            setSelected(id);
            setInspectorCollapsed(false);
          }}
        />
        <ReadinessCheck
          design={design}
          onSelect={(id) => {
            setSelected(id);
            setMode('2d');
          }}
        />
      </details>
    </details>
  );
}
