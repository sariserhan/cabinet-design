'use client';
import { useState } from 'react';
import type { Design } from '@/designer/model';
import { presentationViews } from '@/designer/render-planning';
import type { CameraView } from './render-view';
export function PresentationTour({
  design,
  onCamera,
  onExit,
}: {
  design: Design;
  onCamera: (c: CameraView) => void;
  onExit: () => void;
}) {
  const [step, setStep] = useState(-1);
  const views = design.views?.length ? design.views : presentationViews(design);
  const index = Math.max(0, Math.min(step, views.length - 1)),
    view = views[index];
  const captions = [
    'Start with the overall arrangement and how the room connects.',
    'Review the working space and storage around the island.',
    'Look at cabinet finishes, countertop choices and appliances.',
    'Check circulation and the relationship between each cabinet run.',
  ];
  function go(n: number) {
    const next = Math.max(0, Math.min(n, views.length - 1));
    setStep(next);
    const camera = views[next];
    if (camera) onCamera(camera);
  }
  return (
    <>
      <div className="presentation-bar">
        <strong>{design.name}</strong>
        <div className="designer-row">
          <button onClick={() => setStep(-1)}>Overview</button>
          <select
            aria-label="Tour saved viewpoint"
            value={step >= 0 ? (views[index]?.id ?? '') : ''}
            onChange={(e) =>
              go(views.findIndex((v) => v.id === e.target.value))
            }
          >
            <option value="">Saved viewpoints</option>
            {views.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <button onClick={onExit}>Exit presentation · Esc</button>
        </div>
      </div>
      {step === -1 ? (
        <section className="presentation-welcome">
          <span>Kitchen concept presentation</span>
          <h1>{design.name}</h1>
          <p>
            {design.room.width} × {design.room.depth} inches ·{' '}
            {design.items.length} design objects
          </p>
          <p>
            Explore the layout, materials and storage from the saved viewpoints.
          </p>
          <button onClick={() => go(0)}>Begin kitchen tour</button>
          <button onClick={() => setStep(-2)}>Explore freely</button>
        </section>
      ) : step >= 0 ? (
        <div className="presentation-tour-note">
          <strong>
            {index + 1} / {views.length} · {view?.name}
          </strong>
          <span>{captions[index % captions.length]}</span>
          <button disabled={index === 0} onClick={() => go(index - 1)}>
            Previous viewpoint
          </button>
          {index < views.length - 1 ? (
            <button onClick={() => go(index + 1)}>Next viewpoint</button>
          ) : (
            <button onClick={() => setStep(-2)}>Finish kitchen tour</button>
          )}
        </div>
      ) : null}
    </>
  );
}
