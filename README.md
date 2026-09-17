# Cabinet Design

One repository, two products that share a catalog, an account and a Convex backend.

| | **Catalog Compiler** | **Kitchen Studio** |
| --- | --- | --- |
| What it does | Turns manufacturer PDFs into source-linked, reviewable catalog records | Plans a kitchen from those records, then prices, presents and hands it off |
| Routes | `/documents` `/catalog` `/review` `/rules` `/versions` `/benchmarks` `/readiness` | `/designer` `/projects` `/selections` `/client-review` `/installer` |
| Code | `convex/` `src/catalog/` `src/ingestion/` `tools/` | `src/designer/` `src/components/designer/` |
| Status | **Draft import works. No trustworthy compiled catalog exists yet.** | Working demo; outputs are coordination drafts, not approvals |
| Guide | [catalog status](docs/catalog-status.md) · [architecture](docs/application.md) · [semantic core](docs/semantic-core.md) | [kitchen studio](docs/kitchen-studio.md) · [rendering](docs/rendering.md) · [trade workspaces](docs/trade-workspaces.md) |

The two meet at one boundary: Kitchen Studio places catalog records that have known width, depth and height. Draft records stay visibly unverified until a human approves them, and cannot be ordered against.

## Run locally

Requires Node.js 24 and Python 3. Private credentials live in the ignored `.env.local`; see [.env.example](.env.example).

```sh
npm ci
python3 -m pip install --target .local/pdf-tools -r tools/requirements-benchmark.txt
npm run dev -- --port 3001
```

In another terminal, for catalog ingestion only:

```sh
npm run worker
```

Open http://localhost:3001 and create an account. Note that Next 16 allows only one dev server per project directory.

For a fresh deployment, run `npx convex dev`, configure Convex Auth with `npx @convex-dev/auth --skip-git-check --web-server-url http://localhost:3001`, and set matching `CATALOG_WORKER_SECRET` values locally and in Convex. `SITE_URL` must be set on the Convex deployment and match the browser origin — without it the HTTP routes refuse requests rather than falling back to a development origin. Never commit actual secrets.

To run model extraction, configure `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in `.env.local`, restart the worker, and choose that provider and a supported model ID in Documents. Model IDs and token prices are explicit configuration. No prices or extraction results are fabricated when configuration is absent.

## Catalog Compiler

Use **Documents → Load Allure draft benchmark** to load the pinned public PDF and draft annotations into your private workspace. This is explicitly a draft import, not a model extraction result. The worker must be running to process queued jobs.

- Review products, rules, footnotes, families/options/modifications and difficult cases against individual field evidence. Private page images highlight the selected source region; printed labels remain separate from physical PDF positions.
- Edit, approve, reject, mark ambiguity, resolve blockers, split or merge records. Changes retain audit history and invalidate stale benchmark/publication results. Reprocessing preserves audited corrections.
- Versions shows publication failures, source reprocessing, audited non-catalog exclusions, geometry policies, diffs, immutable export and creation of editable revisions.
- Benchmarks compares an independent compiler candidate with a separately human-verified draft.

A human must verify the development truth: 150–200 products, 30+ rules, 30+ footnotes and difficult cases. The existing fixture contains **189 products, 58 footnotes, 32 rules, 8 cases and 431 evidence snippets, all unverified**. Automated QA accounts cannot create human-verification attestations, and completing processing alone cannot authorize publication.

The selected subset cannot stand in for the complete Allure catalog. Full-book processing is held behind Milestone 1. A separate random audit of 600 auto-approved decisions with zero critical errors is required before the final reliability claim. Current model output remains unreviewed; confidence is capped below the auto-approval threshold pending calibration.

Future product consumers use `src/catalog/api.ts` with an authenticated immutable published export, rather than reading mutable extraction records.

## Kitchen Studio

The entry point is `/designer`. Work through **Room → Cabinets → Design → Quote → Present**; approvals, orders, installation and aftercare live under Project tools. See the [kitchen studio guide](docs/kitchen-studio.md) for the full walkthrough and the [pilot worksheet](docs/pilot.md) for running a real project through it.

Designs are stored as JSON per project: up to 400 objects and 6 MB, with anything above ~100 KB split across chunk rows so a large kitchen is not capped by Convex's single-document limit. Those bounds are defined once, as `MAX_DESIGN_ITEMS` and `MAX_DESIGN_TEXT` in [`src/designer/model.ts`](src/designer/model.ts), and reused by the schema, the file importer and the cloud store.

Drawing packages, dealer CSVs and quotes are coordination drafts. Verify site measurements, appliance specifications, service locations, manufacturer options and source records before ordering or installation.

## What is next

[docs/todo.md](docs/todo.md) holds the backlog: account email through Resend and the verification and recovery that depend on it; the engineering gaps, led by the fact that nothing reports a runtime error today; what is left on rendering; the catalog dimension work and why it is held; and the three items blocked on a person rather than on code.

## Validation

```sh
npm run check     # lint, TypeScript, semantic tests, backend tests, artifact integrity
npm run build
npm run test:e2e  # Playwright; see below
```

`npm run check` covers 301 semantic tests, 31 backend ownership/concurrency/audit tests, mocked provider contract tests, TypeScript, lint and draft-artifact integrity. `npm run test:e2e` adds 36 browser tests, which CI does not yet run. These are software checks, not measured manufacturer-data accuracy.

CI runs `npm run check` and the production build on every push and pull request ([.github/workflows/ci.yml](.github/workflows/ci.yml)). This repository is public, so GitHub-hosted runners do not consume the account's included minutes. The browser specs are not run there: they need a live Convex deployment to sign in against, which would mean putting deployment credentials in CI for a public repository.

The same checks also run locally through git hooks, which catch problems before a commit rather than after a push. Install them once per clone:

```sh
npm run hooks:install
```

`pre-commit` runs `npm run check` (about 9s) and `pre-push` runs `npm run verify` (check plus the production build, about 13s), then the browser tests if an app is already serving on port 3000. Bypass either with `--no-verify` when you mean to.

`npm run test:e2e` drives the app in a browser: the signed-out surfaces (installer workspace, public catalog route, client-review token handling) and, signed in, that the 2D plan, 3D preview and WebGL render view all draw, that the enlarged canvas grows the stage, and that a 12 MB source PDF uploads whole. It runs against a running app. It attaches to a dev server already on port 3000, or starts one if none is up; set `E2E_BASE_URL` to test a deployment instead. Signed-in specs use one throwaway account per Playwright worker (`e2e-automation+wN@example.test`), created on first run in whichever Convex deployment the app points at, so point e2e at a development deployment.

The static [review packet](tests/fixtures/fabuwood-allure/review-packet.html) and [verification protocol](tests/fixtures/fabuwood-allure/VERIFICATION.md) remain available. The app stores human decisions separately from those original AI draft files.
