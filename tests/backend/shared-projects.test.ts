import { test, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import { newDesign } from '../../src/designer/model';
import { collectProjectBackup } from '../../src/designer/project-backup';
const modules = import.meta.glob('../../convex/**/*.{ts,js}');
function published(
  result:
    | {
        sharedId: import('../../convex/_generated/dataModel').Id<'sharedProjects'>;
        revision: number;
      }
    | { error: string },
) {
  if ('error' in result) throw Error(result.error);
  return result;
}
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    owner: await ctx.db.insert('users', {}),
    editor: await ctx.db.insert('users', {}),
    viewer: await ctx.db.insert('users', {}),
    other: await ctx.db.insert('users', {}),
  }));
  const account = (id: string) => t.withIdentity({ subject: id + '|test' });
  const backup = collectProjectBackup(
    { getItem: () => null },
    'owner',
    newDesign(),
  );
  return {
    t,
    ids,
    owner: account(ids.owner),
    editor: account(ids.editor),
    viewer: account(ids.viewer),
    other: account(ids.other),
    backup,
  };
}
test('shared records enforce authentication, membership, roles and revocation', async () => {
  const s = await setup(),
    args = { expectedRevision: 0, backupJson: JSON.stringify(s.backup) };
  await expect(
    s.t.mutation(api.sharedProjects.publish, args).then(published),
  ).rejects.toThrow('Sign in');
  const { sharedId } = await s.owner
    .mutation(api.sharedProjects.publish, args)
    .then(published);
  await expect(
    s.other.query(api.sharedProjects.get, { sharedId }),
  ).rejects.toThrow('not found');
  expect(await s.other.query(api.sharedProjects.list, {})).toEqual([]);
  await s.owner.mutation(api.sharedProjects.setMember, {
    sharedId,
    userId: s.ids.editor,
    role: 'editor',
  });
  await s.owner.mutation(api.sharedProjects.setMember, {
    sharedId,
    userId: s.ids.viewer,
    role: 'viewer',
  });
  expect(
    (await s.viewer.query(api.sharedProjects.get, { sharedId })).revision,
  ).toBe(1);
  await expect(
    s.viewer
      .mutation(api.sharedProjects.publish, {
        ...args,
        sharedId,
        expectedRevision: 1,
      })
      .then(published),
  ).rejects.toThrow('Viewers');
  await expect(
    s.editor.mutation(api.sharedProjects.setMember, {
      sharedId,
      userId: s.ids.other,
      role: 'editor',
    }),
  ).rejects.toThrow('Only the owner');
  await expect(
    s.owner.mutation(api.sharedProjects.setMember, {
      sharedId,
      userId: s.ids.owner,
      role: 'remove',
    }),
  ).rejects.toThrow('Owner access');
  await s.owner.mutation(api.sharedProjects.setMember, {
    sharedId,
    userId: s.ids.viewer,
    role: 'remove',
  });
  await expect(
    s.viewer.query(api.sharedProjects.get, { sharedId }),
  ).rejects.toThrow('not found');
});
test('editor revisions reject stale saves and different project identities atomically', async () => {
  const s = await setup(),
    args = { expectedRevision: 0, backupJson: JSON.stringify(s.backup) };
  const { sharedId } = await s.owner
    .mutation(api.sharedProjects.publish, args)
    .then(published);
  await s.owner.mutation(api.sharedProjects.setMember, {
    sharedId,
    userId: s.ids.editor,
    role: 'editor',
  });
  s.backup.closeout.care = 'Updated by editor';
  await s.editor
    .mutation(api.sharedProjects.publish, {
      sharedId,
      expectedRevision: 1,
      backupJson: JSON.stringify(s.backup),
    })
    .then(published);
  await expect(
    s.owner
      .mutation(api.sharedProjects.publish, {
        ...args,
        sharedId,
        expectedRevision: 1,
      })
      .then(published),
  ).rejects.toThrow('changed');
  const wrong = { ...s.backup, design: { ...s.backup.design, id: 'wrong' } };
  await expect(
    s.owner
      .mutation(api.sharedProjects.publish, {
        sharedId,
        expectedRevision: 2,
        backupJson: JSON.stringify(wrong),
      })
      .then(published),
  ).rejects.toThrow();
  const record = await s.owner.query(api.sharedProjects.get, { sharedId });
  expect(record.revision).toBe(2);
  expect(JSON.parse(record.backupJson).closeout.care).toBe('Updated by editor');
});
test('shared snapshots strip unverifiable claims, retain operations and chunk large unicode records', async () => {
  const s = await setup();
  s.backup.closeout.signoff = {
    name: 'Forged',
    at: new Date().toISOString(),
    content: 'fake',
  };
  s.backup.operations!.pilot.name = 'Real project not verified';
  s.backup.operations!.pilot.entries = Array.from({ length: 120 }, (_, i) => ({
    id: String(i),
    date: '2026-09-15',
    stage: 'Install' as const,
    minutes: 1,
    reworkMinutes: 1,
    quoteRevisions: 0,
    issues: 1,
    note: '木'.repeat(1800),
  }));
  const { sharedId } = await s.owner
    .mutation(api.sharedProjects.publish, {
      expectedRevision: 0,
      backupJson: JSON.stringify(s.backup),
    })
    .then(published);
  const record = await s.owner.query(api.sharedProjects.get, { sharedId }),
    b = JSON.parse(record.backupJson);
  expect(b.closeout.signoff).toBeUndefined();
  expect(b.operations.pilot.entries).toHaveLength(120);
  expect(b.operations.pilot.entries[119].note).toBe('木'.repeat(1800));
  const chunks = await s.t.run((ctx) =>
    ctx.db
      .query('sharedProjectChunks')
      .withIndex('by_sharedId_and_part', (q) => q.eq('sharedId', sharedId))
      .take(60),
  );
  expect(chunks.length).toBeGreaterThan(1);
  expect(
    chunks.every((c) => new TextEncoder().encode(c.content).length < 1000000),
  ).toBe(true);
});

test('expected conflicts and revoked publishing return messages without throwing server errors', async () => {
  const s = await setup();
  const args = { expectedRevision: 0, backupJson: JSON.stringify(s.backup) };
  const { sharedId } = published(
    await s.owner.mutation(api.sharedProjects.publish, args),
  );
  const conflict = await s.owner.mutation(api.sharedProjects.publish, {
    ...args,
    sharedId,
  });
  expect(conflict).toEqual({
    error:
      'Shared project changed. Load the latest revision before publishing.',
  });
  const denied = await s.other.mutation(api.sharedProjects.publish, {
    ...args,
    sharedId,
    expectedRevision: 1,
  });
  expect(denied).toEqual({ error: 'Shared project not found' });
  expect(
    (await s.owner.query(api.sharedProjects.get, { sharedId })).revision,
  ).toBe(1);
});
