'use client';
import type { DimensionAxes } from '@/designer/dimension-overlay';

/**
 * The dimensions switch and its three axes, shown under every view that can
 * draw them. Each axis is separate because a plan with three numbers on
 * every cabinet is unreadable, and usually one of them is the question.
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
      {(['x', 'y', 'z'] as const).map((axis) => (
        <label key={axis} hidden={!on}>
          <input
            type="checkbox"
            aria-label={`Show ${axis.toUpperCase()} dimensions`}
            checked={axes[axis]}
            onChange={(e) =>
              onChange({ axes: { ...axes, [axis]: e.target.checked } })
            }
          />{' '}
          {axis.toUpperCase()}
        </label>
      ))}
      {on && <span className="dimension-summary">{summary}</span>}
    </div>
  );
}
