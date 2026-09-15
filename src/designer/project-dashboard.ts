import { type ProjectBackup } from './project-backup';
import { measurementStatus, reviewContent } from './project-workflow';
import { deliverySummary, purchaseLines } from './purchasing';
import { parseDesign, warnings } from './model';
import { isClosed } from './closeout';
export function dashboardSummary(b: ProjectBackup, now = Date.now()) {
  const d = b.design,
    today = new Date(now).toISOString().slice(0, 10);
  const approval =
    b.history.some(
      (h) =>
        h.approval &&
        reviewContent(parseDesign(h.designJson)) === reviewContent(d),
    ) ||
    !!(
      b.purchasing.baseline &&
      reviewContent(parseDesign(b.purchasing.baseline.designJson)) ===
        reviewContent(d)
    ) ||
    b.purchasing.changes.some(
      (c) =>
        c.approval && reviewContent(parseDesign(c.after)) === reviewContent(d),
    );
  const awaitingChanges = b.purchasing.changes.filter(
    (c) => !c.approval,
  ).length;
  let pending = 0,
    shortages = 0,
    unconfirmed = 0,
    overdue = 0,
    substitutions = 0;
  for (const p of b.purchasing.purchases) {
    const receipts = deliverySummary(p);
    pending += receipts.pending;
    shortages += receipts.missing + receipts.damaged;
    for (const line of purchaseLines(parseDesign(p.designJson), p.book)) {
      const c = p.confirmation?.lines.find((l) => l.lineId === line.id);
      unconfirmed +=
        line.quantity -
        (p.confirmation?.reference.trim() && p.confirmation.confirmedOn
          ? (c?.confirmedQuantity ?? 0)
          : 0);
      if (
        c?.expectedDelivery &&
        c.expectedDelivery < today &&
        line.itemIds.some(
          (id) =>
            p.receipts.find((r) => r.itemId === id)?.status !== 'received',
        )
      )
        overdue++;
      if (c?.substitution === 'proposed' || c?.substitution === 'accepted')
        substitutions++;
    }
  }
  const site = d.siteTasks?.filter((t) => t.status !== 'resolved').length ?? 0,
    punch = b.closeout.tasks.filter((t) => t.status !== 'done').length;
  const rows = [
    {
      id: 'approval',
      title: 'Client approvals',
      count: (approval ? 0 : 1) + awaitingChanges,
      detail: approval
        ? 'Current design has a captured approval.'
        : 'Current design needs verified approval.',
      target: 'Cloud projects & client reviews',
    },
    {
      id: 'questions',
      title: 'Site and layout checks',
      count: site + warnings(d).length,
      detail: `${site} open site questions`,
      target: 'Design decisions · budget, checks & site handoff',
    },
    {
      id: 'supplier',
      title: 'Supplier confirmation',
      count: unconfirmed + substitutions,
      detail: `${unconfirmed} units unconfirmed · ${substitutions} substitutions need design review`,
      target: 'Orders, changes & deliveries',
    },
    {
      id: 'delivery',
      title: 'Delivery follow-up',
      count: shortages + pending,
      detail: `${shortages} missing/damaged · ${pending} pending · ${overdue} overdue lines`,
      target: 'Orders, changes & deliveries',
    },
    {
      id: 'closeout',
      title: 'Installation closeout',
      count: punch || (!isClosed(d, b.closeout) ? 1 : 0),
      detail: isClosed(d, b.closeout)
        ? 'Completion recorded for the current design.'
        : `${punch} unresolved checks; record completion after review.`,
      target: 'Installation closeout & handover',
    },
  ];
  const measure = measurementStatus(d);
  return {
    rows,
    next: measure
      ? { title: 'Confirm the room survey', target: 'Guided room measurements' }
      : !d.items.length
        ? { title: 'Add products to the room', target: 'canvas' }
        : (rows.find((r) => r.count > 0) ?? {
            title: 'Export the complete project and customer handover',
            target: 'Complete project backup',
          }),
  };
}
