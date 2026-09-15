'use client';
import { footprint, itemPolygon, type Design } from '@/designer/model';
import { roomOutline } from '@/designer/room';
export function ReviewPlan({
  design,
  selected,
  onSelect,
  comments,
}: {
  design: Design;
  selected: string | null;
  onSelect: (id: string) => void;
  comments: { itemId?: string }[];
}) {
  return (
    <svg
      aria-label="Select an item to pin feedback"
      viewBox={`-8 -8 ${design.room.width + 16} ${design.room.depth + 16}`}
      style={{ width: '100%', maxHeight: 450 }}
    >
      <polygon
        points={roomOutline(design.room)
          .map((p) => `${p.x},${p.y}`)
          .join(' ')}
        fill="#f1f4ef"
        stroke="#698076"
      />
      {design.items.map((item, index) => {
        if (item.hidden) return null;
        const f = footprint(item),
          count = comments.filter((c) => c.itemId === item.id).length;
        return (
          <g
            key={item.id}
            role="button"
            tabIndex={0}
            aria-label={`Pin feedback to ${index + 1}. ${item.sku}`}
            aria-pressed={selected === item.id}
            onClick={() => onSelect(item.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(item.id);
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <polygon
              points={itemPolygon(item)
                .map((p) => `${p.x},${p.y}`)
                .join(' ')}
              fill={
                selected === item.id
                  ? '#65b59f'
                  : item.elevation > 40
                    ? '#b8d8df'
                    : '#d3b98f'
              }
              fillOpacity=".75"
              stroke={selected === item.id ? '#064e3b' : '#536d62'}
              strokeWidth={selected === item.id ? 2 : 0.6}
            />
            <text
              x={item.x + f.width / 2}
              y={item.y + f.depth / 2}
              fontSize="5"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#18382e"
            >
              {index + 1}
            </text>
            {count > 0 && (
              <g>
                <circle
                  cx={item.x + f.width}
                  cy={item.y}
                  r="4"
                  fill="#18594a"
                />
                <text
                  x={item.x + f.width}
                  y={item.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize="4"
                >
                  {count}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
