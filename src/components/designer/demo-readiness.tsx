'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { type Design } from '@/designer/model';
import { roomEdges } from '@/designer/room';
import { fillWallRun, lightingVariants } from '@/designer/demo-readiness';
import { presentationViews } from '@/designer/render-planning';
import { MiniPlan } from './workflow-tools';
import { Working, painted } from './working';
import type { CameraView } from './render-view';
const RenderView = dynamic(() => import('./render-view'), { ssr: false });
export function WallRunBuilder({
  design,
  onChange,
}: {
  design: Design;
  onChange: (d: Design) => void;
}) {
  const edges = roomEdges(design.room).filter(
    (e) => !e.curved && design.room.walls[e.side],
  );
  const [wall, setWall] = useState(edges[0]?.index ?? 0),
    [finish, setFinish] = useState(true),
    [preview, setPreview] = useState<{ source: string; next: Design } | null>(
      null,
    ),
    [error, setError] = useState('');
  const valid = preview?.source === JSON.stringify(design) ? preview : null;
  return (
    <section className="wall-run-builder">
      <h3>Fill a wall with cabinets</h3>
      <label>
        Wall
        <select
          aria-label="Cabinet run wall"
          value={wall}
          onChange={(e) => {
            setWall(Number(e.target.value));
            setPreview(null);
          }}
        >
          {edges.map((e) => (
            <option key={e.index} value={e.index}>
              Wall {e.index + 1} · {e.side} · {e.length.toFixed(0)} in
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          aria-label="Include run finish parts"
          type="checkbox"
          checked={finish}
          onChange={(e) => {
            setFinish(e.target.checked);
            setPreview(null);
          }}
        />{' '}
        Include countertops, toe kicks and end panels where space permits
      </label>
      <p>
        Uses 9–36 inch demo base cabinets in available spaces. Existing objects
        and door/window openings are preserved. Preview before applying; Undo
        restores the room.
      </p>
      <button
        disabled={!edges.length}
        onClick={() => {
          try {
            setPreview({
              source: JSON.stringify(design),
              next: fillWallRun(design, wall, finish),
            });
            setError('');
          } catch (e) {
            setError((e as Error).message);
            setPreview(null);
          }
        }}
      >
        Preview wall run
      </button>
      {valid && (
        <>
          <MiniPlan design={valid.next} />
          <p>
            {valid.next.items.length - design.items.length} new parts · existing
            objects retained
          </p>
          <button
            onClick={() => {
              onChange(valid.next);
              setPreview(null);
            }}
          >
            Apply wall run
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function LightingComparison({ design }: { design: Design }) {
  // Three WebGL views, built one at a time.
  //
  // Mounting all three in one commit blocked the main thread for 29
  // seconds under software rendering, and a few on a GPU, with nothing on
  // screen to say why: the page simply stopped, which reads as a crash.
  // Each view now waits for a painted frame before the next one starts,
  // so the first is there to look at while the rest build and the count
  // says what is left.
  //
  // It is a trade, measured rather than assumed: one blocked stretch of
  // 29 seconds becomes three of about 24, because the views already built
  // are drawing while the next one builds. On a GPU, where drawing is
  // most of nothing, the penalty goes with it; under software rendering
  // it is real, and still better than a page that looks dead.
  const [built, setBuilt] = useState(0),
    [camera, setCamera] = useState<CameraView>(
      design.views?.[0] ??
        presentationViews(design)[0] ?? {
          position: [250, 160, 250],
          target: [90, 36, 60],
        },
    );
  const variants = lightingVariants(design);
  const open = built > 0;
  return (
    <section className="lighting-comparison">
      <h3>Compare lighting</h3>
      <p>
        Three views of this kitchen using the same camera. Your saved lighting
        stays unchanged.
      </p>
      <button
        onClick={() => {
          if (open) return setBuilt(0);
          void (async () => {
            for (let n = 1; n <= variants.length; n++) {
              setBuilt(n);
              await painted();
            }
          })();
        }}
      >
        {open
          ? 'Close lighting comparison'
          : 'Compare daytime, evening & task lighting'}
      </button>
      {open && built < variants.length && (
        <Working label={`Building view ${built + 1} of ${variants.length}…`} />
      )}
      {open && (
        <div className="lighting-grid">
          {variants.slice(0, built).map((v) => (
            <article key={v.name}>
              <h4>{v.name}</h4>
              <RenderView
                design={v.design}
                cameraView={camera}
                onCamera={setCamera}
                onChange={() => {}}
              />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
