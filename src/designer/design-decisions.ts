import {
  type Cabinet,
  type Design,
  type Product,
  designSchema,
  itemSchema,
  warnings,
  resolvedFront,
  containsFootprint,
} from './model';
import { profileFor } from './installation';
import {
  type PriceBook,
  itemConfiguration,
  supplierQuote,
} from './supplier-pricing';
import { defaultStorageProfile, type StorageProfile } from './decision-schema';

export type CatalogChoice = Product & {
  versionId: string;
  reviewStatus: string;
  truthVerified: boolean;
  blockers: string[];
};
export function sourceLink(item: Pick<Cabinet, 'recordId' | 'versionId'>) {
  return `/review?version=${encodeURIComponent(item.versionId)}&record=${encodeURIComponent(item.recordId)}`;
}
export function storageSummary(design: Design) {
  const cabinets = design.items.filter((i) =>
    ['cabinet', 'custom_cabinet', 'corner', 'island'].includes(i.kind),
  );
  return {
    cabinets: cabinets.length,
    drawerUnits: cabinets.filter(
      (i) =>
        resolvedFront(i) === 'drawers' || i.details?.interior === 'pullouts',
    ).length,
    accessibleUnits: cabinets.filter(
      (i) =>
        i.elevation < 40 &&
        (resolvedFront(i) === 'drawers' || i.details?.interior === 'pullouts'),
    ).length,
    pantryWidth: cabinets
      .filter((i) => i.category.includes('pantry') || i.height >= 80)
      .reduce((n, i) => n + i.width, 0),
    baseWidth: cabinets
      .filter((i) => i.elevation < 40 && i.height < 80)
      .reduce((n, i) => n + i.width, 0),
  };
}
export function storageRecommendations(
  design: Design,
  profile: StorageProfile = defaultStorageProfile,
) {
  const s = storageSummary(design),
    result: { title: string; reason: string; itemIds: string[] }[] = [];
  const lower = design.items.filter(
    (i) =>
      ['cabinet', 'custom_cabinet', 'corner', 'island'].includes(i.kind) &&
      i.elevation < 40,
  );
  const drawerTarget =
    profile.cookware === 'extensive'
      ? 3
      : profile.cookware === 'regular'
        ? 2
        : 1;
  if (
    s.drawerUnits < drawerTarget ||
    (profile.reach === 'low' && !s.accessibleUnits)
  )
    result.push({
      title: 'Bring everyday cookware into lower drawers',
      reason: `${s.drawerUnits} drawer/pull-out units shown; a planning target of ${drawerTarget} suits your ${profile.cookware} cookware collection. Lower pull-outs reduce reaching into deep shelves.`,
      itemIds: lower
        .filter((i) => resolvedFront(i) !== 'drawers')
        .map((i) => i.id),
    });
  const pantryTarget =
    profile.pantry === 'bulk' ? 36 : profile.pantry === 'weekly' ? 24 : 18;
  if (s.pantryWidth < pantryTarget)
    result.push({
      title: 'Reserve more dedicated pantry frontage',
      reason: `${s.pantryWidth} in of tall pantry frontage is shown; consider ${pantryTarget} in for ${profile.pantry} shopping. Verify usable internal shelves with the supplier.`,
      itemIds: lower.map((i) => i.id),
    });
  if (s.baseWidth < profile.household * 24)
    result.push({
      title: 'Check shared storage capacity',
      reason: `${s.baseWidth} in of lower cabinet frontage for ${profile.household} people. The planning target is ${profile.household * 24} in; list dishes and small appliances before choosing units.`,
      itemIds: lower.map((i) => i.id),
    });
  const sink = design.items.find((i) => i.kind === 'sink');
  if (sink)
    result.push({
      title: 'Keep cleaning supplies near the sink',
      reason:
        'Reserve a suitable nearby unit for cleaning supplies and waste sorting; confirm plumbing leaves enough usable space.',
      itemIds: lower
        .filter((i) => Math.hypot(i.x - sink.x, i.y - sink.y) < 60)
        .map((i) => i.id),
    });
  if (!result.length)
    result.push({
      title: 'Your storage mix meets the planning targets',
      reason:
        'Check your actual inventory, internal dimensions and reach in the showroom. These targets are preferences, not measured storage capacity.',
      itemIds: [],
    });
  return result;
}
function storageValue(item: Cabinet, profile: StorageProfile) {
  const drawers =
    resolvedFront(item) === 'drawers' || item.details?.interior === 'pullouts';
  return (
    (drawers ? (profile.priority === 'drawers' ? 8 : 4) : 0) +
    (drawers && item.elevation < 40 && profile.reach === 'low' ? 5 : 0) +
    (item.category.includes('pantry') || item.height >= 80
      ? profile.priority === 'pantry'
        ? 8
        : 2
      : 0)
  );
}
function replacementOptions(
  design: Design,
  item: Cabinet,
  book: PriceBook,
  catalog: CatalogChoice[],
  preserveDrawers: boolean,
) {
  if (
    !['cabinet', 'custom_cabinet'].includes(item.kind) ||
    item.locked ||
    (item.assemblyId &&
      design.items.some((i) => i.assemblyId === item.assemblyId && i.locked))
  )
    return [item];
  const options = [item];
  for (const line of book.lines) {
    if (
      line.width !== item.width ||
      line.depth !== item.depth ||
      line.height !== item.height ||
      !['linen', 'oak', 'slate'].includes(line.finish)
    )
      continue;
    const record =
      line.sku === item.sku
        ? null
        : catalog.find(
            (r) =>
              r.sku === line.sku &&
              r.versionId === item.versionId &&
              r.category === item.category &&
              r.width === line.width &&
              r.depth === line.depth &&
              r.height === line.height &&
              r.truthVerified &&
              r.reviewStatus === 'approved' &&
              !r.blockers.length,
          );
    if (line.sku !== item.sku && (!record || item.kind !== 'cabinet')) continue;
    let configuration: unknown;
    try {
      configuration =
        line.configuration === 'standard' ? {} : JSON.parse(line.configuration);
    } catch {
      continue;
    }
    const config = itemSchema
      .pick({
        details: true,
        surface: true,
        sinkStyle: true,
        refrigeratorStyle: true,
        frontStyle: true,
      })
      .partial()
      .strict()
      .safeParse(configuration);
    if (!config.success) continue;
    const {
      details: _d,
      surface: _s,
      sinkStyle: _ss,
      refrigeratorStyle: _r,
      ...base
    } = item;
    void _d;
    void _s;
    void _ss;
    void _r;
    const next = itemSchema.parse({
      ...base,
      frontStyle: 'auto',
      ...config.data,
      sku: line.sku,
      finish: line.finish,
      ...(record
        ? {
            recordId: record._id,
            versionId: record.versionId,
            pageNumber: record.pageNumber,
          }
        : {}),
    });
    if (itemConfiguration(next) !== line.configuration) continue;
    if (
      preserveDrawers &&
      (resolvedFront(item) === 'drawers' ||
        item.details?.interior === 'pullouts') &&
      !(
        resolvedFront(next) === 'drawers' ||
        next.details?.interior === 'pullouts'
      )
    )
      continue;
    if (!options.some((o) => JSON.stringify(o) === JSON.stringify(next)))
      options.push(next);
  }
  return options;
}
export function pricedProposals(
  design: Design,
  book: PriceBook,
  catalog: CatalogChoice[],
  settings: {
    target?: number;
    preserveDrawers: boolean;
    protectedIds: string[];
  },
  now = Date.now(),
) {
  const baseline = supplierQuote(design, book, now);
  if (baseline.total === null)
    throw Error(
      'Complete, current supplier prices for the existing design are required.',
    );
  const total = (d: Design) => {
    const value = supplierQuote(d, book, now).total;
    if (value === null)
      throw Error('A proposed configuration has no current supplier price.');
    return value;
  };
  const singlePrice = (i: Cabinet) =>
    supplierQuote({ ...design, items: [i] }, book, now).lines[0]?.unitCents ??
    Infinity;
  const profile = design.storageProfile ?? defaultStorageProfile;
  const choices = design.items.map((i) =>
    settings.protectedIds.includes(i.id)
      ? [i]
      : replacementOptions(design, i, book, catalog, settings.preserveDrawers),
  );
  const choose = (quality: boolean): Design => ({
    ...design,
    items: choices.map(
      (list, index) =>
        [...list].sort((a, b) =>
          quality
            ? storageValue(b, profile) - storageValue(a, profile) ||
              singlePrice(a) - singlePrice(b)
            : singlePrice(a) - singlePrice(b),
        )[0] ??
        (() => {
          throw Error(`No candidate for item ${index + 1}`);
        })(),
    ),
  });
  const cheapest = choose(false),
    best = choose(true);
  let budget = design;
  const savings = cheapest.items
    .map((item, index) => ({
      item,
      index,
      saving: singlePrice(design.items[index] ?? item) - singlePrice(item),
    }))
    .filter((s) => s.saving > 0)
    .sort((a, b) => b.saving - a.saving);
  for (const change of savings) {
    if (
      settings.target !== undefined &&
      (total(budget) ?? Infinity) <= settings.target
    )
      break;
    budget = {
      ...budget,
      items: budget.items.map((i, index) =>
        index === change.index ? change.item : i,
      ),
    };
  }
  const baselineWarnings = new Set(
    warnings(design).map((w) => w.id + ':' + w.message),
  );
  const options = [
    { name: 'Good · lowest price', design: cheapest },
    { name: 'Better · current design', design },
    { name: 'Best · storage priority', design: best },
  ];
  const seen = new Set<string>();
  const proposals = options
    .filter((o) => {
      const key = JSON.stringify(o.design.items);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .filter(
      (o) =>
        !warnings(o.design).some(
          (w) => !baselineWarnings.has(w.id + ':' + w.message),
        ),
    )
    .map((o) => ({
      ...o,
      total: total(o.design),
      storage: storageSummary(o.design),
      changes: changeImpact(design, o.design, book, now),
    }));
  if (
    warnings(budget).some((w) => !baselineWarnings.has(w.id + ':' + w.message))
  )
    budget = design;
  return {
    baseline: baseline.total,
    proposals,
    budget: designSchema.parse(budget),
    budgetTotal: total(budget),
    achieved:
      settings.target !== undefined &&
      (total(budget) ?? Infinity) <= settings.target,
  };
}
export function changeImpact(
  before: Design,
  after: Design,
  book?: PriceBook,
  now = Date.now(),
) {
  const changed = [
    ...new Set([
      ...before.items.map((i) => i.id),
      ...after.items.map((i) => i.id),
    ]),
  ].filter(
    (id) =>
      JSON.stringify(before.items.find((i) => i.id === id)) !==
      JSON.stringify(after.items.find((i) => i.id === id)),
  );
  const roomChanged =
    JSON.stringify(before.room) !== JSON.stringify(after.room);
  const finishChanged =
    before.finish !== after.finish ||
    JSON.stringify(before.appearance) !== JSON.stringify(after.appearance);
  const affected = new Set(changed);
  if (roomChanged || finishChanged)
    for (const i of after.items) affected.add(i.id);
  for (const d of [before, after])
    for (const id of changed) {
      const i = d.items.find((i) => i.id === id);
      if (!i) continue;
      for (const other of d.items)
        if (
          (i.assemblyId && other.assemblyId === i.assemblyId) ||
          other.sinkMount?.hostId === i.id ||
          i.sinkMount?.hostId === other.id ||
          other.opening?.hostId === i.id ||
          ((other.kind === 'countertop' || i.kind === 'countertop') &&
            (containsFootprint(other, i) || containsFootprint(i, other)))
        )
          affected.add(other.id);
    }
  const old = warnings(before),
    next = warnings(after),
    key = (w: ReturnType<typeof warnings>[number]) => w.id + ':' + w.message;
  const quoteBefore = book ? supplierQuote(before, book, now) : null,
    quoteAfter = book ? supplierQuote(after, book, now) : null;
  return {
    changed,
    affected: [...affected],
    roomChanged,
    finishChanged,
    added: next.filter((w) => !old.some((o) => key(o) === key(w))),
    resolved: old.filter((w) => !next.some((o) => key(o) === key(w))),
    quoteBefore: quoteBefore?.total ?? null,
    quoteAfter: quoteAfter?.total ?? null,
    missingPrices: quoteAfter?.missing.map((l) => l.sku) ?? [],
    needsReview: JSON.stringify(before) !== JSON.stringify(after),
  };
}
export function explainedChecks(design: Design) {
  return warnings(design).map((w) => {
    const items = design.items.filter((i) => w.itemIds.includes(i.id));
    const installation = w.id.startsWith('install-');
    const sources = items.flatMap((i) => {
      const p = installation ? profileFor(i) : null;
      return p ? [{ label: p.name, href: p.source, note: p.note }] : [];
    });
    let fix =
      'Review the affected dimensions and move or rotate the item, then rerun checks.';
    if (w.id.startsWith('sink-'))
      fix =
        'Align the sink with a supporting worktop, matching top elevation and containment.';
    else if (installation)
      fix =
        'Open installation details, record the missing site services, and compare them with the selected model’s source.';
    else if (w.id.startsWith('ceiling-'))
      fix =
        'Check room height, slope, item elevation and crown molding against measured site dimensions.';
    else if (w.id.includes('clearance') || w.id.startsWith('swing-'))
      fix =
        'Inspect the operating envelope and move the obstruction; confirm required clearances with the installation manual.';
    return {
      ...w,
      basis: installation
        ? 'Product profile and recorded site services'
        : 'Calculated from design geometry and entered clearance assumptions',
      sources,
      fix,
      items,
    };
  });
}
