import { fromObject, footprint, overlaps, type Design } from './model';
export function alignUpper(design: Design, id: string): Design {
  const item = design.items.find((i) => i.id === id);
  if (!item || item.elevation < 40 || item.rotation % 90 !== 0) return design;
  const base = design.items
    .filter(
      (i) =>
        ['cabinet', 'custom_cabinet'].includes(i.kind) &&
        i.elevation === 0 &&
        i.rotation === item.rotation,
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x - item.x, a.y - item.y) -
        Math.hypot(b.x - item.x, b.y - item.y),
    )[0];
  if (!base) return design;
  const a = footprint(item),
    b = footprint(base),
    horizontal = item.rotation % 180 === 0;
  const patch = horizontal
    ? {
        x: base.x + (b.width - a.width) / 2,
        y: item.rotation === 180 ? base.y + b.depth - a.depth : base.y,
      }
    : {
        y: base.y + (b.depth - a.depth) / 2,
        x: item.rotation === 90 ? base.x + b.width - a.width : base.x,
      };
  return {
    ...design,
    items: design.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
  };
}
export function fillerSuggestions(design: Design) {
  const cabinets = design.items.filter(
    (i) =>
      ['cabinet', 'custom_cabinet', 'filler'].includes(i.kind) &&
      i.rotation % 90 === 0,
  );
  const suggestions: ReturnType<typeof fromObject>[] = [];
  for (const a of cabinets) {
    const af = footprint(a),
      horizontal = a.rotation % 180 === 0;
    const end = horizontal ? a.x + af.width : a.y + af.depth;
    const peers = cabinets.filter(
      (b) =>
        b.id !== a.id &&
        b.rotation === a.rotation &&
        Math.abs(b.elevation - a.elevation) < 0.1 &&
        Math.abs((horizontal ? b.y : b.x) - (horizontal ? a.y : a.x)) < 0.1 &&
        (horizontal ? b.x : b.y) > end,
    );
    const next = peers.sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y))[0];
    if (!next) continue;
    const gap = (horizontal ? next.x : next.y) - end;
    if (gap < 0.5 || gap > 6) continue;
    const filler = {
      ...fromObject('filler'),
      id: `suggest-${a.id}-${next.id}`,
      sku: `DEMO-FILLER-${gap.toFixed(2)}`,
      width: gap,
      depth: a.depth,
      height: Math.min(a.height, next.height),
      elevation: a.elevation,
      rotation: a.rotation,
      x: horizontal ? end : a.x,
      y: horizontal ? a.y : end,
      finish: a.finish ?? design.finish,
    };
    if (!design.items.some((i) => overlaps(filler, i)))
      suggestions.push(filler);
  }
  return suggestions;
}
