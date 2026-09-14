import { internalMutation } from './_generated/server';
import { v } from 'convex/values';
// Administrative test setup cannot be called by browser clients.
export const markAutomation = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!args.email.endsWith('@catalog-qa.invalid'))
      throw new Error('Only isolated QA accounts');
    const user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', args.email))
      .unique();
    if (!user) throw new Error('QA account not found');
    const existing = await ctx.db
      .query('reviewerProfiles')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { actorKind: 'automation' });
    else
      await ctx.db.insert('reviewerProfiles', {
        userId: user._id,
        actorKind: 'automation',
      });
    return null;
  },
});
