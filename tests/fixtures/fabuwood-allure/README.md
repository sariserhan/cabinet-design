# Allure benchmark plan

Status: 32 pages visually inspected by the agent and selected for annotation. Draft packet contains 189 products, 58 footnote facts, 32 rules and 8 cases. **Human-verified records: 0. Accuracy: not measured.**

Open [review-packet.html](review-packet.html) locally to see source pages alongside expandable annotations and their evidence. Read [VERIFICATION.md](VERIFICATION.md) before recording review decisions.

## Source and selected coverage

The source has 139 physical PDF pages. [source-manifest.json](source-manifest.json) pins the exact PDF/hash. [page-selection.json](page-selection.json) records actual physical pages and printed labels; selection revision 2 replaces the original index-based proposal.

The index is stale: it labels Base Cabinets as page 27, while the body starts at printed 30 (physical PDF 51). Never resolve source links using index labels alone. The earlier provisional selection has been replaced, including the alignment section title page with an actual diagram page.

Product annotation pages (physical PDF positions): 22, 23, 25, 27, 51, 52, 55, 58, 60, 76, 79, 92, 97, 104. All listed SKU rows on these selected pages are included in the draft; a human must verify completeness. Other selected pages supply context, rule sources, and cross-page dependencies. They are not claimed as fully annotated product pages. This is a benchmark coverage boundary, not permission to ignore catalog content at publication.

Dependencies include the mixer-lift restriction on PDF 79 and host B18FD on PDF 51; CUT-ROD requirements on PDF 116 with drawer accessories on PDF 76 and depth modifications on PDF 114; required fillers on PDF 79 with source families on PDF 91–92. The source index/body mismatch and missing SK W39 dimensions are source issues. Injected dimensional and footnote errors are separately labeled synthetic tests.

## Draft artifacts and reproduction

- `draft-products.json`, `draft-footnotes.json`, `draft-rules.json`, `draft-cases.json`: AI proposals, never benchmark truth by default.
- `draft-evidence.json`: text matches, normalized boxes, physical pages and printed labels. Repeated/multiline matches require region review.
- `draft-summary.json`: draft counts only.
- `draft-snapshot.json`: file hashes tying human review to an exact draft revision.
- `pages/`: local images and page text. These are inspection assets, not a production ingestion output.

Preparation uses Python 3 with `PyMuPDF==1.28.2`: `python3 tools/prepare_benchmark.py` from the repository root. The temporary inspection install is `/tmp/cabinet-pdf-tools`, so this session uses `PYTHONPATH=/tmp/cabinet-pdf-tools`. The script only rewrites `draft-*` artifacts and the review packet/page selection; it does not write verified truth. The generator refreshes snapshot hashes. Integrity checks reject annotations changed without a matching snapshot; human attestations must match the exact snapshot hash.

Run `python3 tools/check_benchmark_packet.py` to check integrity and `python3 -m py_compile tools/prepare_benchmark.py tools/check_benchmark_packet.py` for syntax. Passing these checks does **not** establish factual accuracy.

## Development truth

Target 150–200 products, 30+ footnote-derived facts, 30+ rules, multiple families/categories, at least one diagram-dependent case, one cross-page rule, and several ambiguous/conflicting cases. Within selected product regions enumerate all products to establish recall; add regions rather than cherry-picking clean records.

Each truth entry needs stable ID, source hash, physical page/printed label, region, verbatim evidence, expected semantic values or explicit unknown/conflict, expected rule evaluation outcomes, expected blockers, and human verifier identity/date. Track draft and verified truth separately. AI-proposed annotations do not count as manually verified ground truth.

If actual source conflicts are absent, keep deliberate candidate corruptions as separately labeled synthetic negative tests. Never present injected errors as manufacturer statements. Include footnote attachment perturbations, dimension disagreement and missing diagram evidence. Genuine source ambiguity remains in the source benchmark.

## Metrics and completion

Measure discovery precision/recall, required dimension correctness, category correctness, provenance correctness, footnote scope, rule extraction and rule evaluation independently. Expose numerators, denominators, missing records, exclusions and unresolved cases. Required unknown facts cannot silently disappear from denominators. Development results are tuning results, not a held-out reliability estimate.

Milestone 1 requires all benchmark SKUs discovered and required basic dimensions correct, provenance for every approved field, correct selected footnotes/rules, appropriate approval blockers, audited review actions, enforced publication gates and deterministic export. No full-book extraction before it passes.

## Final independent audit

Freeze the compiler, prompts, schemas, thresholds and output population first. Define the decision unit, critical-error criteria, population and sampling seed before sampling. Manually verify at least 600 randomly sampled auto-approved decisions with zero critical errors; preserve sampled IDs and adjudications. Report products, fields, rules and footnotes separately. A combined sample does not prove 99.5% reliability for each subgroup. Correlated fields from the same record must not be presented as independent record trials.

For 600 independent Bernoulli decisions with zero observed errors, the one-sided 95% exact upper error bound is 1 - 0.05^(1/600), approximately 0.498%. This supports the approximate claim only for the sampled population and assumptions; it is not a guarantee. If fewer than 600 decisions are available, report the smaller audit without that claim. Any critical error fails the requested zero-error criterion; fix and run a fresh audit of the resulting frozen version. Do not reuse a sample consulted during tuning as held-out validation.
