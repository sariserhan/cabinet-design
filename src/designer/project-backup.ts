import { tradesSchema, parseTrades, emptyTrades } from './trade-estimates';
import { z } from 'zod';
import {
  operationsSchema,
  emptyOperations,
  parseOperations,
} from './project-operations';
import {
  productSupportSchema,
  parseSupport,
  emptySupport,
} from './product-support';
import { designSchema, type Design, parseDesign } from './model';
import {
  type Milestone,
  milestoneSchema,
  parseMilestones,
} from './project-workflow';
import {
  purchasingSchema,
  parsePurchasing,
  emptyPurchasing,
  type Purchasing,
} from './purchasing';
import {
  closeoutSchema,
  emptyCloseout,
  parseCloseout,
  type Closeout,
} from './closeout';
import { directoryEntrySchema, type DirectoryEntry } from './project-directory';
import { priceBookSchema, type PriceBook } from './supplier-pricing';
export const projectBackupSchema = z.object({
  format: z.literal('kitchen-project-backup-v1'),
  createdAt: z.string().datetime(),
  design: designSchema,
  history: z.array(milestoneSchema).max(8),
  purchasing: purchasingSchema,
  closeout: closeoutSchema,
  organization: directoryEntrySchema,
  priceBook: priceBookSchema.optional(),
  support: productSupportSchema.optional(),
  operations: operationsSchema.optional(),
  trades: tradesSchema.optional(),
});
export type ProjectBackup = z.infer<typeof projectBackupSchema>;
export function parseProjectBackup(
  raw: string,
  trustedLocal = false,
): ProjectBackup {
  if (raw.length > 6000000) throw Error('Complete backup exceeds 6 MB.');
  const b = projectBackupSchema.parse(JSON.parse(raw));
  const id = b.design.id;
  b.history = parseMilestones(
    JSON.stringify({
      format: 'kitchen-milestones-v1',
      designId: id,
      entries: b.history,
    }),
    id,
    trustedLocal,
  );
  b.purchasing = parsePurchasing(
    JSON.stringify(b.purchasing),
    id,
    trustedLocal,
  );
  b.closeout = parseCloseout(JSON.stringify(b.closeout), id, trustedLocal);
  b.support = b.support
    ? parseSupport(JSON.stringify(b.support), id, trustedLocal)
    : emptySupport(id);
  b.operations = b.operations
    ? parseOperations(JSON.stringify(b.operations), id)
    : emptyOperations(id);
  b.trades = b.trades
    ? parseTrades(JSON.stringify(b.trades), id)
    : emptyTrades(id);
  return b;
}
export function collectProjectBackup(
  storage: Pick<Storage, 'getItem'>,
  ownerId: string,
  design: Design,
  priceBook?: PriceBook,
): ProjectBackup {
  const historyRaw = storage.getItem(
      `kitchen-project-history:${ownerId}:${design.id}`,
    ),
    purchaseRaw = storage.getItem(`kitchen-purchasing:${ownerId}:${design.id}`),
    closeoutRaw = storage.getItem(`kitchen-closeout:${ownerId}:${design.id}`);
  const binding = JSON.parse(
    storage.getItem(`kitchen-cloud:${ownerId}:${design.id}`) ?? 'null',
  );
  const directory = JSON.parse(
    storage.getItem(`kitchen-directory:${ownerId}`) ?? '{}',
  );
  const history: Milestone[] = historyRaw
    ? parseMilestones(historyRaw, design.id, true)
    : [];
  const purchasing: Purchasing = purchaseRaw
    ? parsePurchasing(purchaseRaw, design.id, true)
    : emptyPurchasing(design.id);
  const closeout: Closeout = closeoutRaw
    ? parseCloseout(closeoutRaw, design.id, true)
    : emptyCloseout(design.id);
  const organization: DirectoryEntry = directoryEntrySchema.parse(
    directory[binding?.projectId] ??
      directory[design.id] ?? { client: design.quote?.customer ?? '' },
  );
  const restored = storage.getItem(
    `kitchen-restored-price:${ownerId}:${design.id}`,
  );
  const supportRaw = storage.getItem(
    `kitchen-product-support:${ownerId}:${design.id}`,
  );
  const support = supportRaw
    ? parseSupport(supportRaw, design.id, true)
    : emptySupport(design.id);
  return parseProjectBackup(
    JSON.stringify({
      format: 'kitchen-project-backup-v1',
      createdAt: new Date().toISOString(),
      design,
      history,
      purchasing,
      closeout,
      organization,
      support,
      trades: parseTrades(
        storage.getItem(`kitchen-trades:${ownerId}:${design.id}`) ??
          JSON.stringify(emptyTrades(design.id)),
        design.id,
      ),
      operations: parseOperations(
        storage.getItem(`kitchen-operations:${ownerId}:${design.id}`) ??
          JSON.stringify(emptyOperations(design.id)),
        design.id,
      ),
      ...(restored && !design.supplierBookId
        ? { priceBook: JSON.parse(restored) }
        : priceBook
          ? { priceBook }
          : restored
            ? { priceBook: JSON.parse(restored) }
            : {}),
    }),
    true,
  );
}
export function restoreProjectCopy(
  input: ProjectBackup,
  newId: string = crypto.randomUUID(),
): ProjectBackup {
  const b = parseProjectBackup(JSON.stringify(input));
  const remap = (raw: string) => {
    const d = parseDesign(raw);
    delete d.supplierBookId;
    return JSON.stringify({ ...d, id: newId });
  };
  b.design = {
    ...b.design,
    id: newId,
    name: `${b.design.name.slice(0, 80)} (restored)`,
  };
  delete b.design.supplierBookId;
  b.history = b.history.map((e) => ({ ...e, designJson: remap(e.designJson) }));
  b.purchasing = {
    ...b.purchasing,
    designId: newId,
    changes: b.purchasing.changes.map((c) => ({
      ...c,
      before: remap(c.before),
      after: remap(c.after),
    })),
    purchases: b.purchasing.purchases.map((p) => ({
      ...p,
      designJson: remap(p.designJson),
    })),
  };
  if (b.purchasing.baselineReference)
    b.purchasing.baselineReference = remap(b.purchasing.baselineReference);
  b.closeout = { ...b.closeout, designId: newId };
  if (b.support) b.support = { ...b.support, designId: newId };
  if (b.operations) b.operations = { ...b.operations, designId: newId };
  if (b.trades) {
    b.trades = { ...b.trades, designId: newId };
    for (const state of Object.values(b.trades.trades)) delete state.saved;
  }
  b.organization = { ...b.organization, archived: false, status: 'draft' };
  delete b.organization.indexedRevision;
  return parseProjectBackup(JSON.stringify(b));
}
