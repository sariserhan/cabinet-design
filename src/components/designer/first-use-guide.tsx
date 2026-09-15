'use client';
import { useEffect, useState } from 'react';
import type { Design } from '@/designer/model';
export function FirstUseGuide({
  ownerId,
  design,
  onDemo,
}: {
  ownerId: string;
  design: Design;
  onDemo: () => void;
}) {
  const key = `kitchen-first-use:${ownerId}`;
  const [visible, setVisible] = useState(false),
    [step, setStep] = useState(0),
    [message, setMessage] = useState('');
  useEffect(() => {
    try {
      setVisible(localStorage.getItem(key) !== 'done');
    } catch {
      setVisible(true);
    }
  }, [key]);
  const steps = [
    {
      title: 'Explore a sample kitchen',
      text: 'Try the sample gallery and walkthrough to learn placement, materials and presentation. Sample geometry and generic products are examples; they are not a verified room survey or a supplier offer.',
      action: 'Open sample walkthrough',
    },
    {
      title: 'Make it your room',
      text: 'Measure walls, ceiling, doors and windows. Confirm the survey, place products, then work through the source and layout checks.',
      action: 'Open room measurements',
    },
    {
      title: 'Price, approve and deliver',
      text: 'Import an actual supplier price list, share a saved design review, then prepare purchase drafts and track deliveries. Export design, history and purchasing backups to retain browser-only records.',
      action: 'Open ordering workspace',
    },
  ] as const;
  const current = steps[step] ?? steps[0];
  function openSection(label: string) {
    const section = Array.from(document.querySelectorAll('details')).find(
      (d) => d.querySelector(':scope > summary')?.textContent === label,
    );
    if (section) {
      section.open = true;
      section.scrollIntoView({ behavior: 'smooth' });
    }
  }
  return (
    <section className="first-use-guide" aria-label="Getting started">
      {visible ? (
        <>
          <small>GETTING STARTED · {step + 1} OF 3</small>
          <h2>{current.title}</h2>
          <p>{current.text}</p>
          <p>
            <strong>Next for this project:</strong>{' '}
            {!design.measurements
              ? 'Confirm your room measurements.'
              : !design.items.length
                ? 'Add products to the measured room.'
                : 'Review the readiness checklist before requesting approval.'}
          </p>
          <div className="designer-row">
            <button
              onClick={() =>
                step === 0
                  ? onDemo()
                  : openSection(
                      step === 1
                        ? 'Guided room measurements'
                        : 'Orders, changes & deliveries',
                    )
              }
            >
              {current.action}
            </button>
            {step > 0 && (
              <button onClick={() => setStep(step - 1)}>
                Previous guide step
              </button>
            )}
            {step < 2 ? (
              <button onClick={() => setStep(step + 1)}>Next guide step</button>
            ) : (
              <button
                onClick={() => {
                  try {
                    localStorage.setItem(key, 'done');
                    setVisible(false);
                  } catch {
                    setMessage(
                      'Browser storage is unavailable; this guide may appear again.',
                    );
                    setVisible(false);
                  }
                }}
              >
                Finish getting started
              </button>
            )}
            <button onClick={() => setVisible(false)}>
              Hide guide for now
            </button>
          </div>
        </>
      ) : (
        <button
          onClick={() => {
            setStep(0);
            setVisible(true);
          }}
        >
          Show getting-started guide
        </button>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
