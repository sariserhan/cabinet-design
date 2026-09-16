# Backlog

Ordered by what unblocks the most. Each item says what "done" means and what
it depends on. Nothing here is a claim that the work has started; see
[catalog status](catalog-status.md) for what exists today.

## Email

Account email is the gap behind several of these: there is one Password
provider, no verification, no recovery, and no way for the app to send a
client anything.

- [ ] **Add Resend as the email service.** `resend/resend-email` is the
      messaging product in the Vercel Marketplace, and `vercel integration add`
      provisions it into a linked Vercel project. Note where the key actually
      has to live: auth mail is sent from the Convex deployment, not from
      Next, so `AUTH_RESEND_KEY` belongs on Convex (`npx convex env set`)
      alongside `SITE_URL` and `CATALOG_WORKER_SECRET`. This repository is not
      linked to Vercel today, so decide first whether the app is deploying
      there or whether the key is set on Convex directly.
- [ ] **Verify a sender domain.** Resend needs DNS records on whatever domain
      the mail claims to come from; until then mail can only go to the account
      that owns the Resend key. This is the long-pole dependency for every
      other email item, so start it first.
- [ ] **Email verification on sign-up.** `Password()` in
      [convex/auth.ts](../convex/auth.ts) takes a `verify:` provider, and
      `@auth/core/providers/resend` is already installed as a dependency, so
      this is configuration plus the states around it rather than a new
      integration. Decisions to make: a magic link or a numeric code; whether
      an unverified account can open the workspace or only sign in; where the
      "resend the email" control lives; and how long a link stays valid.
- [ ] **Keep the browser tests signing in.** The signed-in Playwright specs
      create `e2e-automation+wN@example.test` accounts on first run against a
      real deployment. Verification will lock every one of them out, so it
      needs a deliberate path — a verification bypass for a test deployment, a
      seeded pre-verified account, or reading the code back out of Convex —
      decided as part of the verification work, not after it breaks.
- [ ] **Password reset.** The same provider takes a `reset:` slot. Right now a
      forgotten password means a lost workspace, and the reset flow reuses
      whatever the verification work builds.
- [ ] **Basic throttling on the auth endpoints.** Sign-up is open to anyone
      and sending mail costs money; verification turns a sign-up spike into a
      mail spike. Worth a limit per address and per IP once mail is wired.
- [ ] **Email a client review link.** Review links are capability URLs that
      expire and can be revoked ([convex/projects.ts](../convex/projects.ts)),
      and today they are copied and pasted by hand. Sending one is the first
      non-auth use of Resend and the first thing a real pilot would want.

## Truth-up and coverage

- [ ] **Correct the stale test counts.** [README](../README.md) says 252
      semantic tests, [catalog status](catalog-status.md) says 71 core and 10
      backend, [kitchen studio](kitchen-studio.md) says 111 and 15, and the
      [CI workflow](../.github/workflows/ci.yml) comment says 252. The run
      today is 275 core and 31 backend. In a repository whose rule is to state
      only what was actually run, these are the exact claim that should not
      drift — so correct them and add a check that fails when they do, rather
      than correcting them by hand again next month.
- [ ] **Run the signed-out browser specs in CI.** CI runs no browser coverage,
      on the stated grounds that the specs need a Convex sign-in. That is true
      only of the two `*.auth.spec.ts` files: `public-catalog`, `installer` and
      `client-review` need no account and would give the public surfaces
      continuous coverage.
- [ ] **Fix the shared sign-in flakiness.** The signed-in specs bounce back to
      the sign-in screen when several workers reuse one account, which took
      three attempts to get a clean full-suite run today. A per-run identity or
      a reused `storageState` would remove the race.

## Blocked on you, not on code

- [ ] **Provider credit for a real extraction run.** Re-checked today with a
      one-token call: the OpenAI key is accepted and the account returns
      `429 insufficient_quota`, `credit_balance_exhausted`. Either add credit
      or set `ANTHROPIC_API_KEY`, and the worker can run an actual extraction.
      Extraction accuracy stays unmeasured until then.
- [ ] **Human verification of the benchmark truth.** Milestone 1 needs a
      person to verify the 189 draft products, 32 rules, 58 footnotes and 8
      cases. No automated identity can create that attestation, by design, so
      this cannot be delegated to the assistant or to CI.
- [ ] **A real room and a real price list for the pilot.** The
      [pilot worksheet](pilot.md) is ready and every stage of it is exercised
      with synthetic data. What it has never seen is one actual kitchen with a
      current supplier list, which is the only thing that will show which parts
      of the workflow are wrong.
