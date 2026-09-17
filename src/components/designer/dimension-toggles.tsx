'use client';
import type { DimensionAxes } from '@/designer/dimension-overlay';

/**
 * The dimensions switch and its three sizes, shown under every view that
 * can draw them. Each is separate because a plan with three numbers on
 * every cabinet is unreadable, and usually one of them is the question.
 * They are named the way a cabinet is ordered - width, depth, height -
 * rather than after the room's axes.
 */
export function DimensionToggles({
  on,
  axes,
  onChange,
  summary,
}: {
  on: boolean;
  axes: DimensionAxes;
  onChange: (next: { on?: boolean; axes?: DimensionAxes }) => void;
  summary: string;
}) {
  return (
    <div className="dimension-toggles">
      <label>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange({ on: e.target.checked })}
        />{' '}
        Dimensions
      </label>
      {(
        [
          ['width', 'W'],
          ['depth', 'D'],
          ['height', 'H'],
        ] as const
      ).map(([axis, letter]) => (
        <label key={axis} hidden={!on}>
          <input
            type="checkbox"
            aria-label={`Show ${axis} dimensions`}
            checked={axes[axis]}
            onChange={(e) =>
              onChange({ axes: { ...axes, [axis]: e.target.checked } })
            }
          />{' '}
          {letter}
        </label>
      ))}
      {on && <span className="dimension-summary">{summary}</span>}
    </div>
  );
}
