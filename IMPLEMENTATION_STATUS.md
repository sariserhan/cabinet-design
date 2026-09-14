# Implementation status

## Completed

- Source-pinned public Allure V.02.26.26 PDF: 139 physical pages; selected 32 representative pages and dependencies.
- Draft fixture: 189 products, 58 footnotes, 32 rules, 8 difficult cases, 431 evidence snippets; reproducible preparation and integrity checks.
- Strict field provenance, explicit unknown/conflicting states, rule vocabulary, three-valued execution, approval blockers and content-bound publication gates.
- Source-linked family, option and modification registries with reviewed membership and reference checks.
- Running authenticated Next.js/Convex development application with private documents, page images, source highlights, catalog filters, review, audit history, split/merge, page reprocessing, geometry policies and non-catalog exclusions.
- Dedicated leased worker, hash verification, PyMuPDF layout extraction, resumable pages, distinct draft import and provider extraction paths, OpenAI/Anthropic structured adapters, critic findings, usage and optional configured cost reporting.
- Server-side benchmark comparison, executable case definitions, cross-source dimension/footnote conflict checks, transactional publication/export, revision copying, diffs and typed published-catalog consumer API.
- Real draft import completed in an isolated QA workspace: all 32 selected pages and 287 records. Automated QA remains explicitly non-human.
- Production build, local checks and Convex development deployment completed.
- Browser checks: sign-in, import, exact source highlight, audited edits/approval, private-file denial, catalog search/navigation, blocked publication and mobile layout passed with no page errors.

## In Progress

- Obtaining a configured live model and human benchmark verification.

## Remaining

- Human verification of all proposed truth, region/operand associations, geometry policies and executable case expectations.
- A real provider extraction run and measured comparison against that independent verified truth; fix any discovered extraction errors.
- Complete actual Milestone 1: correct required dimensions and selected rules/footnotes, resolve blockers, publish the mini-catalog and validate its exported JSON.
- Only then scale beyond the explicit subset limits and conduct the independent 600-decision reliability audit.
- Confidence calibration and auto-approval enablement require measured evidence; current model output stays below the threshold and unreviewed.

## Known Issues

- Neither OPENAI_API_KEY nor ANTHROPIC_API_KEY is configured in the current worker environment. Provider tests use explicitly synthetic mocked responses; no live extraction success is claimed.
- Human-verified benchmark records: 0. The app and integrity checker never relabel automated annotations as human truth.
- Source index labels are stale, including Base Cabinets index 27 versus actual printed 30 / physical PDF 51.
- SK W39 lacks required skin dimensions in the draft; CM-1 lacks required profile geometry in the draft. These intentionally remain blocked pending source review.
- Draft SKU-derived dimensions need human validation of their actual source convention. The production extractor is instructed not to invent dimensions from SKU digits.
- Subset snapshots are limited to 40 pages / 2,000 records until the milestone passes. No full-book compilation or final reliability claim has occurred.

## Extraction Accuracy

Not measured. Software tests, draft self-comparisons and imported annotation counts are not extraction accuracy.

## Benchmark Results

70 core behavior tests and 10 backend/provider contract tests pass, together with lint and TypeScript. The production build succeeds. The artifact integrity check passes for all 32 selected pages and 431 evidence snippets. The real human-verified benchmark has not run and publication remains blocked.

## Architecture Decisions

- Original documents, AI drafts, human truth and compiler candidates remain distinct.
- Physical page positions and printed labels are independent; source indexes are not navigation truth.
- Every approved fact requires evidence. Confidence cannot override blockers.
- Human truth is recorded through authenticated attestations; automated test identities cannot verify it.
- Publication checks bind the exact candidate and truth revisions, then recheck transactionally.
- Published records and source images survive new revisions and reprocessing.
- Unknown cost and accuracy remain unknown; no fabricated success metrics or pricing.
