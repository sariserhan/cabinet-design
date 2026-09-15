import { v } from 'convex/values';
import { ownedMutation, ownedVersion } from './access';
import { saveReviewed } from './recordHelpers';
import { crossSourceConflicts } from '../src/catalog/cross-source';
import {
  recordDataSchema,
  recordEvidence,
  deterministicRecordBlockers,
  setRecordStatus,
} from '../src/catalog/record-data';

// Administrative delegation: approval never attests individual source inspection.
export const approveUnverified = ownedMutation({
  args: {
    versionId: v.id('versions'),
    expectedRevision: v.number(),
    reason: v.string(),
  },
  returns: v.object({
    approved: v.number(),
    blocked: v.number(),
    unchanged: v.number(),
    revision: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = ctx.userId;
    let version = await ownedVersion(ctx, args.versionId, userId, true);
    if (version.revision !== args.expectedRevision)
      throw new Error('Version changed');
    if (!args.reason.trim()) throw new Error('Reason required');
    const jobs = await ctx.db
      .query('jobs')
      .withIndex('by_versionId', (q) => q.eq('versionId', args.versionId))
      .take(101);
    if (
      jobs.length > 100 ||
      jobs.some((j) => j.status === 'queued' || j.status === 'running')
    )
      throw new Error('Finish active processing before bulk approval');
    const rows = await ctx.db
      .query('records')
      .withIndex('by_versionId_and_entityKey', (q) =>
        q.eq('versionId', args.versionId),
      )
      .take(501);
    if (rows.length > 500)
      throw new Error('Bulk approval is limited to 500 subset records');
    const document = await ctx.db.get(version.documentId);
    if (!document) throw new Error('Source missing');
    const coverage = JSON.parse(version.coverageJson) as {
      pages: { pageNumber: number }[];
    };
    const payloads = rows.map((r) =>
      recordDataSchema.parse(JSON.parse(r.payloadJson)),
    );
    const conflicts = crossSourceConflicts(
      payloads.filter((p) => p.data.reviewStatus !== 'rejected'),
    );
    // A cross-record conflict needs individual resolution before any batch approval.
    if (conflicts.length)
      throw new Error('Resolve cross-source conflicts before bulk approval');
    const keys = new Set(rows.map((r) => r.entityKey));
    if (keys.size !== rows.length)
      throw new Error('Resolve duplicate records before bulk approval');
    let approved = 0,
      blocked = 0,
      unchanged = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i],
        payload = payloads[i];
      if (!row || !payload) throw new Error('Record missing');
      if (row.reviewStatus !== 'unreviewed' || row.truthVerified) {
        unchanged++;
        continue;
      }
      const invalidEvidence = recordEvidence(payload).some(
        (e) =>
          e.documentId !== document._id ||
          e.documentSha256 !== document.sha256 ||
          !coverage.pages.some((p) => p.pageNumber === e.pageNumber),
      );
      if (
        row.blockers.length ||
        deterministicRecordBlockers(payload).length ||
        invalidEvidence
      ) {
        blocked++;
        continue;
      }
      const next = setRecordStatus(payload, 'approved');
      const revision = await saveReviewed(ctx, version, row, next, [], false);
      await ctx.db.insert('audit', {
        ownerId: userId,
        versionId: version._id,
        recordId: row._id,
        actorId: userId,
        actorKind: 'automation',
        action: 'bulk_approve_unverified',
        beforeJson: row.payloadJson,
        afterJson: JSON.stringify(next),
        reason:
          args.reason +
          ' — Delegated bulk approval; no individual source verification.',
        at: Date.now(),
        candidateRevision: revision,
      });
      const current = await ctx.db.get(version._id);
      if (!current) throw new Error('Version missing');
      version = current;
      approved++;
    }
    return { approved, blocked, unchanged, revision: version.revision };
  },
});
