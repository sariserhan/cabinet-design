# Catalog Compiler

An internal Next.js/Convex application for converting manufacturer PDFs into source-linked catalogs. The first milestone is a 32-page Fabuwood Allure subset. **The review application and draft import work; a trustworthy compiled catalog has not yet been established.** Live model extraction and human benchmark verification remain required before publication or full-book processing.

## Run locally

Requires Node.js 24 and Python 3. The current workspace has a configured Convex development deployment; private credentials are in ignored `.env.local`.

```sh
npm ci
python3 -m pip install --target .local/pdf-tools -r tools/requirements-benchmark.txt
npm run dev -- --port 3001
```

In another terminal:

```sh
npm run worker
```

Open http://localhost:3001 and create an account. Use **Documents → Load Allure draft benchmark** to load the exact public PDF and draft annotations into your private workspace. This is explicitly a draft import, not a model extraction result. The worker must be running to process queued jobs.

For a fresh deployment, run `npx convex dev`, configure Convex Auth with `npx @convex-dev/auth --skip-git-check --web-server-url http://localhost:3001`, and set matching `CATALOG_WORKER_SECRET` values locally and in Convex. See [.env.example](.env.example). `SITE_URL` in Convex must match the browser origin. Never commit the actual secrets.

To run model extraction, configure `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in `.env.local`, restart the worker, and choose that provider and a supported model ID in Documents. Model IDs and token prices are explicit configuration. No prices or successful extraction results are fabricated when configuration is absent.

## Review and publication

- Review products, rules, footnotes, families/options/modifications, and difficult cases against individual field evidence. Private page images highlight the selected source region; printed labels remain separate from physical PDF positions.
- Edit, approve, reject, mark ambiguity, resolve blockers, split, or merge records. Changes retain audit history and invalidate stale benchmark/publication results. Reprocessing preserves audited corrections.
- Catalog filters include SKU, category, family, dimensions, confidence, and review status.
- Versions shows publication failures, source reprocessing, audited non-catalog exclusions, geometry policies, diffs, immutable export, and creation of editable revisions.
- Benchmarks compares an independent compiler candidate with a separately human-verified draft. Products, fields, dimensions, categories, rules, footnotes, source references, and executable difficult cases are measured separately.

A human must verify the development truth: 150–200 products, 30+ rules, 30+ footnotes, and difficult cases. The existing fixture contains **189 products, 58 footnotes, 32 rules, 8 cases, and 431 evidence snippets, all unverified**. Automated QA accounts cannot create human-verification attestations. Completing processing alone cannot authorize publication.

The selected subset cannot stand in for the complete Allure catalog. Full-book processing is intentionally held behind Milestone 1. A separate random audit of 600 auto-approved decisions with zero critical errors is required before the final reliability claim. Current model output remains unreviewed; confidence is conservatively capped below the auto-approval threshold pending calibration.

## Validation

```sh
npm run check
npm run build
```

Checks include semantic tests, backend ownership/concurrency/audit tests, mocked provider contract tests, TypeScript, lint, and draft-artifact integrity. These are software checks, not measured manufacturer-data accuracy.

The static [review packet](tests/fixtures/fabuwood-allure/review-packet.html) and [verification protocol](tests/fixtures/fabuwood-allure/VERIFICATION.md) remain available. The app stores human decisions separately from those original AI draft files.

See [implementation status](IMPLEMENTATION_STATUS.md), [application architecture](docs/application.md), and [semantic core](docs/semantic-core.md). Future product consumers use `src/catalog/api.ts` with an authenticated immutable published export, rather than reading mutable extraction records.
