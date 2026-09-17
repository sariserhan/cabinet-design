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

## Rendering

Antialiasing, texture anisotropy, the black-room bug in the quality path,
sample accumulation on a settled view, GTAO and supersampled stills are all
done. Hard edge steps in the reference frame are down 56% from where the day
started. What is left is ranked by how much it changes the picture.

- [x] **The tone curve.** Done on 2026-09-17: Khronos PBR Neutral, in both
      paths, from one constant so they cannot drift apart. Rendered three
      ways as the entry asked, against three fronts side by side under one
      light. Cream `#ece7dc` is painted with 16 points between red and blue
      and rendered with 29 under Neutral, 11 under AgX and 9 under ACES
      Filmic; navy `#414d57` rendered at an average of 80 under Neutral, 98
      under ACES and 109 under AgX, which is a different door. Highlights
      turned out not to be the trade: the scene clipped 0.01% of its pixels
      under all three, so the roll-off a filmic curve is chosen for had
      nothing to do here. A test now holds the choice in place.
- [ ] **Finish splitting the render effect.** Half of this is done as of
      2026-09-17: a click used to tear down the WebGL context, every
      texture, the sky PMREM and the room probe to draw one wire box, and
      now draws the box on the scene already there - one rebuild per click
      and about eleven seconds became none and about a third of a second.
      What is left is the other half of the same split. The effect that
      owns the renderer is 994 lines with ten dependencies, and eight of
      them - a design edit, an asset arriving, the environment, the
      cutaway, the ceiling, interiors - genuinely need a new scene but not
      a new WebGL context, a new set of textures or a new sky. Two need
      neither: `walking` only changes what the camera obeys, and `quality`
      only changes the passes and the probe size. Context and assets once,
      scene per design, passes per quality, camera per mode would leave
      the 2.1 second scene build where it is and take everything around it
      off the frequent path.
      The difficulty is the closure rather than the idea: the actions the
      controls call, the animation loop, the resize observer and the
      pointer handlers all close over the renderer, the composer and the
      scene, so each has to read a ref instead, and disposal has to learn
      which resource belongs to which lifetime. A leak or a stale
      reference shows up as a black view, which the browser tests catch.
      Call it a day's work with the suite as the net.
      A correction recorded while measuring this: the room probe does not
      cost the five minutes of a run I once attributed to it. It is 36.4
      seconds, 21% of build time and 4% of the run, and it does not care
      about its own resolution - a 32 pixel capture and a 128 pixel one
      cost the same 360 ms, because the cost is six traversals of the
      scene rather than the pixels they land on. There is no cheap cut
      inside the probe; the cut is fewer builds.
- [x] **Bevel the door and drawer edges.** Closed on 2026-09-17 as already
      done, and the entry was wrong twice over. No edge in the scene is a
      perfect 90 degrees: every box goes through `RoundedBoxGeometry` with
      a 0.1in radius, which is 2.5mm - the size the entry asks for - and
      shaker and raised fronts carry an explicit chamfer ring at the
      shoulder besides. Nor do those edges fail to catch a highlight:
      measured along one scanline across two slate slab doors under a
      window, the door edge reads 50 against a face of 30.
      The chamfer the entry proposes was then built and measured, and it
      is worse: replacing the rounded edge with a flat 45 degree one drops
      that same highlight from 50 to 32, because a curve sweeps its normal
      through ninety degrees and so always finds the light somewhere along
      its width, while a flat facet has one normal and in that view it
      pointed at something dark. Reverted. What did come out of the
      measurement is the lacquer: painted fronts were at a chalk-matte
      0.32 clearcoat roughness and are now a sprayed satin 0.14, which is
      what a kitchen door is actually finished in.
- [x] **Appliance and worktop materials.** Done on 2026-09-17, and the
      diagnosis was not what the note said. The room probe was built only for the high quality
      view, and there it came back as one flat colour, because PMREM's
      `fromCubemap` returns a flat colour on software WebGL; steel, which
      has no diffuse term, wore that colour as paint. Every view now
      captures the room and routes it through an equirectangular strip,
      which is the PMREM input that works, and the brushing carries a real
      range of roughness instead of a whisper. Left over: nothing nearby
      appears in a reflection, because there is one distant probe and no
      screen-space reflections - a bowl on a worktop casts no image in it.
      That is the next step for reflective surfaces, and its own piece of
      work.
- [x] **Look at the render on a real GPU.** Unblocked on 2026-09-17. The
      account is in the `render` group and Mesa's EGL and Intel Vulkan
      driver are installed, so headless Chromium reaches the Intel UHD
      instead of falling back to SwiftShader. Run the browser suite on it
      with `sg render -c "npx playwright test --project=gpu"`; the project
      is in `playwright.config.ts` and passes `--use-angle=vulkan`. All 29
      signed-in tests pass on hardware, in 3.9 minutes against 20 on
      software, which makes it the faster way to run them as well as the
      only way to see what hardware sees.
      First thing it showed: the glitter reported on appliance edges is
      not the broad steel panels - captured frames of a moving camera put
      the instability on thin metal silhouettes, the pulls, the tap and
      the edge of the dishwasher, where a highlight a pixel wide lands
      somewhere different each frame. Three material theories were tested
      against that and all three were wrong, which is recorded in the
      commits rather than in the material.
- [ ] **Check the refinement gate on real hardware.** A still view refines
      itself only where a frame is cheap, decided by timing one attempt. That
      back-off is what software rendering hits; nobody has yet watched it
      make the opposite decision on a machine with a GPU, where it should
      refine every time the camera stops.

## Product features

Gaps in what the designer can express, rather than in how it runs. Each was
checked against the model on 2026-09-16.

- [x] **Clearance between runs, not just around items.** Done on 2026-09-16:
      `src/designer/spacing.ts` measures the floor between facing runs and
      the three work-centre legs, against project settings that carry their
      own source line, surfaced in Layout checks.
- [x] **More than one room in a project.** Done on 2026-09-16, deliberately
      not the way this entry imagined it. Making `design.room` plural would
      mean threading a room through every piece of geometry, drawing,
      estimate and export in the app - a migration with a long tail of
      half-converted behaviour. A design still holds exactly one room;
      several designs now share a _job_, so a kitchen, a vanity and a
      laundry keep their own drawings and approvals while their quotes and
      ordering list add up. Rooms in this job, in the project tools.
      Remaining: rooms appear there only once saved, and switching room
      still means opening that design.
- [x] **Annotations and designer-placed dimensions.** Done on 2026-09-16:
      Note and Dimension tools above the plan, edited or removed in
      Properties, printed on the plan sheets. A dimension with nothing typed
      shows what it measures; typed words replace it.
- [x] **Trim as runs rather than pieces.** Done on 2026-09-16: Trim along
      the runs, in the editing tools, groups cabinets into runs and adds one
      length each for crown, light rail or toe kick, mitred where two runs
      meet, with the run, length and mitre counts shown before applying.
      Fillers and scribes are still placed by hand - the existing filler
      suggestion covers the narrow-gap case.
- [x] **Soffits and bulkheads.** Done on 2026-09-16: a `soffit` kind with a
      96 x 13 x 12 preset at 84 inches, treated as architecture rather than
      furniture everywhere the other structural kinds are.
- [x] **A plan and elevation DXF.** Done on 2026-09-16, and the entry was
      half wrong when it was written: a plan DXF already existed and was
      already exposed. What was missing was elevations, which the export now
      includes - one frame per straight wall, curved walls named as skipped -
      along with the designer's own notes and dimensions.

## Design tool, still open

- [x] **Place the countertop seams, not just price them.** Done on
      2026-09-17, and the decision the entry was waiting on was made: the
      seams live on the design. A top carries the positions it is joined
      at, in inches from its left edge, so the plan draws them, the
      fabricator's sheet lists the piece widths and the slab packing cuts
      to them. The old equal-splits setting in the countertop trade
      estimate still answers for tops that carry no seams of their own,
      so saved estimates keep their numbers, but a design's own seams win.
      Positions rather than a count, because a join through a sink is the
      thing a designer is trying to avoid and a count cannot say where it
      falls - the plan warns when one passes within four inches of a sink
      or a hob, and leaves the decision to the fabricator.
- [x] **A lighting plan.** Done on 2026-09-17: circuits with a switch wall
      and a dimming flag, fittings that draw by the foot or by the fitting,
      under-cabinet runs read off the wall cabinets themselves, drivers
      sized at the 80% a continuous load is held to, and the warnings that
      fall out of it - a fitting on no circuit, a circuit with no switch, a
      driver too small. It prints as sheet L01 with the rest of the set.
      What it is not, and says so on the sheet: a certified electrical
      design. Placing fittings by hand on the plan, and drawing their
      symbols on it, is the next piece.
- [ ] **Two people in one design.** Shared projects handle conflicts
      between saves; they do not let two people work at once.
- [ ] **The 800-item ceiling, which is not the ceiling that binds.**
      Measured on 2026-09-17, generating rooms of plain cabinets rather
      than arguing from the constant: at 400 items a design is 127 KB and
      its checks take 31 ms; at 800, the current `MAX_DESIGN_ITEMS`, it is
      254 KB and 43 ms; at 1600 it is 509 KB and 110 ms. The item count is
      not what stops it. Three other limits are, in the order they bite:
      `parseDesign` refuses any design over 500 KB, which 1600 plain
      cabinets already exceed, so raising the count without raising that
      produces designs the app will not read back; the room maximum is 600
      inches a side, which is the real limit on a commercial job; and the
      drawing set throws at 1:100 on A3 once the extent is that large, so
      a bigger job has no sheet to print on. Raising the item ceiling
      alone would buy nothing - the work is the storage limit, a larger
      room, and a sheet size or scale beyond A3 at 1:100.

## Catalog — on hold

Held at the owner's request on 2026-09-16. Recorded so the findings are not
re-derived later.

Compiled products across the three public books: 2,397. Products Kitchen
Studio can actually place: 177. The rest carry `dimensionStatus:
unresolved`, and the reason is not the extractor being weak. Dimensions
exist today only where a person put them there: Allure has a hand-built
overlay from `artifacts/completion/working-catalog.json`, and Illume and
Ovela have sixteen hardcoded cases each - four page numbers apiece with
`assert` statements, in `tools/prepare_public_catalogs.py`.

The books do not print widths in their tables. A base cabinet row reads
`B12`, and the 12 is the width; the printed dimensions on those pages are
the depth and the door heights. So resolving the other 2,220 products means
reading the SKU, which this repository forbids until a person has validated
that convention against the source - correctly, on today's evidence: a
naive check across all three books, comparing a SKU's leading digits with a
dimension printed directly beneath it, agrees 38 times and disagrees 40.
Most of those disagreements look like the check pairing a height or a depth
rather than a width, which is exactly the point - a script cannot settle it.

- [ ] **Build the SKU convention review packet.** Group every place a SKU
      appears beside printed dimensions by SKU family (`B`, `W`, `WBC`,
      `MC`, `VSB` and the rest), with the page, the printed value and the
      drawing each came from, so the question becomes "does `B__` mean
      width in inches" answered per family with the proof in view, rather
      than a read of 139 pages. The assistant can build the packet; the
      ruling is a human attestation and the schema exists to keep it that
      way.
- [ ] **Resolve dimensions under the approved convention.** Only after the
      ruling, and recorded with the convention as its provenance rather than
      as a bare number.

## Documentation accuracy

- [x] **Correct the stale test counts.** Done on 2026-09-17, both halves.
      The four current claims now say 298 core, 31 backend and 35 browser,
      and `npm run check` ends with `tools/check_test_counts.py`, which
      fails when they drift again. The counts come from the runners rather
      than from counting `test(` in the files: `approval.test.ts` declares
      ten tests in a loop, so a static count is wrong by exactly the amount
      nobody notices. Records of what ran on a particular day are left
      alone and marked as such, because they were true when written.

## Engineering

Deferred by the owner on 2026-09-16 in favour of product features; recorded
so the survey does not have to be repeated. Measured on 2026-09-16. What is already sound and does not need work: no
dependency vulnerabilities, no `any` or `@ts-expect-error` escapes in the
source, and the accessibility basics hold - every one of 201 buttons has a
name, every one of 177 form controls has a label, no image lacks alt text.

- [ ] **Nothing watches production, because nothing reports.** There is no
      error tracking and no runtime logging of any kind: a component that
      throws in someone's browser, or a worker that dies mid-job, is
      invisible unless a person happens to be looking. This is the largest
      engineering gap on the list, and it gets worse the moment anyone other
      than the author uses the app.
- [ ] **No security headers on any response.** No Content-Security-Policy,
      X-Frame-Options, Referrer-Policy or Permissions-Policy. The app renders
      user-supplied names into printable exports and serves PDFs, and the
      export escaping is tested, so this is defence in depth rather than a
      known hole - but it is a few lines of configuration.
- [ ] **CI runs no browser coverage.** Eighteen specs exist and none of them
      run on a push. Only two of the five spec files need a Convex sign-in.
- [ ] **The signed-in specs bounce off their own sign-in.** Convex Auth
      rotates refresh tokens, so parallel workers sharing an account race and
      lose. It produced six false failures in one day of work here, which is
      the kind of flake that trains people to ignore a red run.
- [ ] **The Convex layer is tested in patches.** Four backend test files
      cover eleven of the twenty modules. The two absences that matter are
      `designBlob`, which is where customers' designs are actually stored and
      chunked, and `http`, whose routes refuse requests when `SITE_URL` is
      missing rather than falling back - both are load-bearing and neither is
      exercised.
- [ ] **Two components are past the size where they can be reviewed.**
      `designer.tsx` is 1,861 lines and `render-view.tsx` 1,460, both having
      grown again this week. They have been split before; the state and the
      effects inside them are what make each new change slower than the last.
- [ ] **Nothing keeps dependencies current.** No Dependabot or Renovate, and
      no audit step in CI. Today's audit is clean, which is the good moment
      to add the thing that tells you when it stops being.
- [ ] **`next-env.d.ts` flips between `next dev` and `next build`.** Whichever
      ran last leaves the file pointing at its own types directory, so the
      tree is dirty depending on what you did rather than what you changed.
- [ ] **No throttle anywhere.** Sign-up is open and no Convex function limits
      how often it can be called. Worth a limit per account and per address
      before the app is somewhere a stranger can reach it.

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
