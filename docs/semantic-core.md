# Semantic core: implemented behavior and integration contract

The current code is a pure TypeScript/Zod module. It can validate candidates, evaluate rules, explain approval failures and prepare a frozen publication snapshot. It does not process source PDFs, persist records or authenticate reviewers.

## Evidence and candidate facts

`factSchema` supports known, unknown, explicitly absent and conflicting values. Known semantic leaves are scalar facts; nested attributes must be represented as separate field paths. Arrays or objects cannot be smuggled into an unevidenced attribute. Candidate facts may have no provenance so the review queue can represent the error; publication rejects approved fields without evidence. Optional approved attributes are subject to the same evidence requirement.

Source references bind document ID, SHA-256, physical page and separately preserved printed label. A reference either names a normalized source region or explicitly explains full-page scope. Bounding boxes use the displayed, rotated page coordinates specified in the design contract. Raw PDF geometry transforms belong to the later page-ingestion model; this core only accepts normalized geometry.

Derived facts require versioned derivation rules and input fact IDs. Publication checks missing inputs, unresolved inputs and graph cycles. It does not prove the arithmetic or correctness of a derivation; versioned deterministic derivation validators still need implementation.

## Rule semantics

The rule vocabulary and condition fields are closed unions. Text, numeric and boolean operands cannot be mixed. Each scope target, comparison value, constraint value/bound and target identity has source evidence. Original rule language is preserved without trimming.

Conditions implement three-valued logic. Missing input is unknown, a known empty selection is empty, and a false condition makes a rule not applicable. No applicable rules yields not_applicable, not a blanket availability approval. A valid result concerns only the supplied constraints; a future designer must use the approved catalog API to obtain the complete applicable rule set.

When a selected modification is both explicitly allowed and explicitly forbidden by applicable rules, evaluation preserves invalidity and returns an unresolved-conflict diagnostic. No generic specificity/precedence rule is assumed. General cross-rule satisfiability, source conflict discovery and manufacturer exception modeling remain part of later deterministic/cross-source validation; the runtime evaluator is not a proof that every configuration is consistent.

The runtime evaluator accepts only approved or eligible auto-approved rule labels. It does not authenticate the label; the eventual API must supply rules from an immutable approved snapshot. Unknown family/product/category context cannot silently skip potentially applicable rules.

## Approval and publication

Approval confidence is currently an input; aggregate confidence calculation and calibration are not implemented. Tests use explicit synthetic values. A score cannot override any of the ten required blockers.

Publication checks the declared scope and exact source hashes, including cross-page dependencies. Full-document coverage expands to every page. Only audited non-catalog pages can be ignored, and ignored pages cannot support an approved fact. An unknown page classification blocks publication.

Cabinet profiles require width, height and depth; panel/filler profiles require width, height and thickness; molding profiles require length and profile dimensions. Accessory/hardware/other categories need explicit, audited numeric-geometry profiles. Additional profiles cannot weaken mandatory fields. These profiles are server-owned policy, not model output; final manufacturer/category profiles still require benchmark review.

A publication candidate must exclude rejected records, retain coverage consequences in validation, and resolve required facts. Family-scoped rules currently block publication because the family registry is not implemented. Product and host-SKU rule targets must exist in the snapshot. Options and modification registries and their full reference checks remain to be implemented.

Benchmark and validation receipts bind the complete candidate content hash and revision. Benchmark receipts separately record product, field, rule and footnote pass results and require human-verified fixture status. The core verifies the receipt's binding and declared outcome; it does not create those outcomes or authenticate their issuer. The later trusted benchmark runner must calculate thresholds from actual verified truth. Synthetic receipts in unit tests are not factual attestations about Allure.

Finding resolutions must match the candidate revision and current validation run. Review actions, finding severity, category-profile changes and receipt issuance must be authorized server-side. A client must not be permitted to set these fields directly.

`preparePublishedSnapshot` recomputes the gate, rejects stale content/receipt revisions, returns a deep clone and recursively freezes it. The original candidate remains unchanged. Database immutability and concurrency still require a transaction that compares stored revision/content hash and inserts a new snapshot exactly once; an in-memory freeze does not implement that transaction. Published corrections require a new version.

Canonical JSON sorts object keys, preserves array order and rejects non-JSON values. This is a hashing primitive, not the completed catalog export API. The later export layer must explicitly sort entity collections by stable identities and preserve the coverage and provenance envelope.

## Validation completed

`npm run check` passes 63 synthetic behavior tests, lint, TypeScript and draft packet integrity. Tests cover malformed model output, rule exclusions, unknown conditions, source dependencies, all mandatory blockers, duplicate SKUs, missing/invalid dimensions, derivation cycles, benchmark truth status, stale receipts and in-memory immutability.

No Allure compilation has run and no extraction accuracy has been measured. The next work is audited human review, remaining semantic registries, the representative-subset worker and measured benchmark execution.
