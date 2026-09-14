# Catalog Compiler

An internal manufacturer-document compiler, starting with the Fabuwood Allure V.02.26.26 benchmark. The current implementation is the semantic validation core and a draft benchmark review packet. It is not yet a running Next.js/Convex application or a working extraction pipeline.

## Run checks

Requires Node.js 24 and Python 3 for the packet integrity check.

```sh
npm ci
npm run check
```

This runs lint, strict TypeScript checking, synthetic semantic/gate tests, and draft-packet integrity checks. PDF preparation additionally requires `tools/requirements-benchmark.txt`; it is not needed for the standard checks.

## Review the source benchmark

Open [the local review packet](tests/fixtures/fabuwood-allure/review-packet.html) in a browser. It contains 189 draft products, 58 footnote-derived facts, 32 rules, and eight ambiguity/negative cases across 32 selected pages. **Human-verified records: zero.** These counts do not measure extraction accuracy.

[Verification instructions](tests/fixtures/fabuwood-allure/VERIFICATION.md) describe how to record human decisions against an exact draft snapshot without overwriting the AI draft.

## Semantic core

- `src/catalog/evidence.ts`: field states, provenance, geometry and versioned derivations.
- `src/catalog/rule-schema.ts`: strict rule vocabulary and typed condition operands.
- `src/catalog/rules.ts`: valid/invalid/unknown/not-applicable evaluation with evidence and conflicts.
- `src/catalog/approval.ts`: approval eligibility and all mandatory blockers.
- `src/catalog/publication.ts`: content-bound publication gates and immutable in-memory snapshots.
- `src/catalog/canonical.ts`: canonical JSON and SHA-256 content hashes.

See [implementation boundaries](docs/semantic-core.md) before integrating a persistence adapter. Benchmark and validation receipts must come from trusted server-side jobs, not an extraction model or client request.

## Next milestone

Connect the source/review interface to authenticated audit storage, complete human benchmark verification and required category/family semantics, then run the selected subset through extraction and validation. No full-book extraction or reliability claim until the respective benchmark gates pass.
