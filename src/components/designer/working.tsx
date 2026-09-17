'use client';

import { useCallback, useState } from 'react';

/**
 * Waits for a frame the browser has actually put on screen.
 *
 * One `requestAnimationFrame` runs before the paint, not after it, so a
 * heavy task started there still beats the pixels to the screen and the
 * person sees nothing until it finishes. Two frames is the wait that makes
 * a "working" line appear before the work blocks the page.
 */
export function painted() {
  return new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

/**
 * Says the app is busy, in a way that survives the app being busy.
 *
 * The spin is a transform rather than anything that needs a script or a
 * layout, so the browser can keep it on the compositor and away from the
 * blocked main thread. Whether it truly keeps turning through a long
 * block could not be measured here: a screenshot of the page needs that
 * same main thread, so the capture stalls with everything else. What is
 * measured is the part that matters most - the line reaches the screen
 * about 100ms after the click, before the work starts.
 */
export function Working({ label }: { label: string }) {
  return (
    <p className="working" role="status" aria-live="polite">
      <span className="working-spinner" aria-hidden="true" />
      {label}
    </p>
  );
}

/**
 * Runs a task that will block, with a line on screen saying so first.
 *
 * The label is set, a painted frame is waited for, and only then does the
 * work start; a task that throws still clears the line.
 */
export function useWorking() {
  const [working, setWorking] = useState<string | null>(null);
  const run = useCallback(
    async (label: string, task: () => void | Promise<void>) => {
      setWorking(label);
      await painted();
      try {
        await task();
      } finally {
        setWorking(null);
      }
    },
    [],
  );
  return { working, run };
}
