import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';

export const recordKind = v.union(
  v.literal('product'),
  v.literal('rule'),
  v.literal('footnote'),
  v.literal('case'),
  v.literal('registry'),
);
export const reviewState = v.union(
  v.literal('unreviewed'),
  v.literal('auto_approved'),
  v.literal('approved'),
  v.literal('rejected'),
);
export const versionState = v.union(
  v.literal('draft'),
  v.literal('review'),
  v.literal('published'),
  v.literal('superseded'),
);
export const stats = v.object({
  products: v.number(),
  rules: v.number(),
  footnotes: v.number(),
  cases: v.number(),
  registries: v.optional(v.number()),
  unreviewed: v.number(),
  approved: v.number(),
  rejected: v.number(),
  autoApproved: v.number(),
});
export default defineSchema({
  ...authTables,
  documents: defineTable({
    ownerId: v.id('users'),
    name: v.string(),
    manufacturer: v.string(),
    series: v.string(),
    documentVersion: v.string(),
    storageId: v.id('_storage'),
    sha256: v.string(),
    byteLength: v.number(),
    pageCount: v.number(),
    status: v.union(
      v.literal('uploaded'),
      v.literal('processing'),
      v.literal('processed'),
      v.literal('failed'),
    ),
    createdAt: v.number(),
  })
    .index('by_ownerId', ['ownerId'])
    .index('by_ownerId_and_sha256', ['ownerId', 'sha256']),
  versions: defineTable({
    ownerId: v.id('users'),
    documentId: v.id('documents'),
    label: v.string(),
    status: versionState,
    revision: v.number(),
    coverageJson: v.string(),
    profilesJson: v.optional(v.string()),
    origin: v.union(
      v.literal('benchmark_draft'),
      v.literal('compiler'),
      v.literal('revision'),
    ),
    stats,
    compilerVersion: v.string(),
    schemaVersion: v.string(),
    createdAt: v.number(),
    publishedAt: v.optional(v.number()),
    exportStorageId: v.optional(v.id('_storage')),
    parentVersionId: v.optional(v.id('versions')),
    gateJson: v.optional(v.string()),
    gateRevision: v.optional(v.number()),
    gateContentHash: v.optional(v.string()),
    benchmarkJson: v.optional(v.string()),
    benchmarkRevision: v.optional(v.number()),
  })
    .index('by_ownerId', ['ownerId'])
    .index('by_documentId', ['documentId']),
  pages: defineTable({
    ownerId: v.id('users'),
    versionId: v.id('versions'),
    documentId: v.id('documents'),
    pageNumber: v.number(),
    printedLabel: v.string(),
    text: v.string(),
    layoutJson: v.string(),
    classification: v.string(),
    classificationConfidence: v.number(),
    imageStorageId: v.optional(v.id('_storage')),
    status: v.union(
      v.literal('pending'),
      v.literal('processed'),
      v.literal('failed'),
      v.literal('ignored'),
    ),
    error: v.optional(v.string()),
    ignoreReason: v.optional(v.string()),
    ignoredBy: v.optional(v.id('users')),
    ignoredAt: v.optional(v.number()),
  }).index('by_versionId_and_pageNumber', ['versionId', 'pageNumber']),
  records: defineTable({
    ownerId: v.id('users'),
    versionId: v.id('versions'),
    entityKey: v.string(),
    kind: recordKind,
    sku: v.string(),
    category: v.string(),
    family: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    depth: v.optional(v.number()),
    pageNumber: v.number(),
    payloadJson: v.string(),
    evidenceJson: v.string(),
    confidence: v.number(),
    reviewStatus: reviewState,
    blockers: v.array(v.string()),
    revision: v.number(),
    truthVerified: v.boolean(),
    searchText: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_versionId_and_entityKey', ['versionId', 'entityKey'])
    .index('by_versionId_and_kind', ['versionId', 'kind'])
    .index('by_versionId_and_reviewStatus', ['versionId', 'reviewStatus'])
    .index('by_versionId_and_pageNumber', ['versionId', 'pageNumber'])
    .searchIndex('search_records', {
      searchField: 'searchText',
      filterFields: ['ownerId', 'versionId', 'kind', 'reviewStatus'],
    }),
  audit: defineTable({
    ownerId: v.id('users'),
    versionId: v.id('versions'),
    recordId: v.optional(v.id('records')),
    actorId: v.id('users'),
    actorKind: v.union(v.literal('human'), v.literal('automation')),
    action: v.string(),
    beforeJson: v.string(),
    afterJson: v.string(),
    reason: v.string(),
    at: v.number(),
    candidateRevision: v.number(),
  })
    .index('by_versionId', ['versionId'])
    .index('by_recordId', ['recordId']),
  jobs: defineTable({
    ownerId: v.id('users'),
    versionId: v.id('versions'),
    documentId: v.id('documents'),
    mode: v.union(v.literal('benchmark_draft'), v.literal('compile')),
    status: v.union(
      v.literal('queued'),
      v.literal('running'),
      v.literal('completed'),
      v.literal('failed'),
      v.literal('cancelled'),
    ),
    selectedPages: v.array(v.number()),
    processedPages: v.array(v.number()),
    failedPages: v.array(v.number()),
    leaseToken: v.optional(v.string()),
    leaseUntil: v.optional(v.number()),
    error: v.optional(v.string()),
    provider: v.string(),
    model: v.string(),
    promptVersion: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    visionCalls: v.number(),
    estimatedCost: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_status', ['status'])
    .index('by_ownerId', ['ownerId'])
    .index('by_versionId', ['versionId']),
  reviewerProfiles: defineTable({
    userId: v.id('users'),
    actorKind: v.union(v.literal('human'), v.literal('automation')),
  }).index('by_userId', ['userId']),
});
