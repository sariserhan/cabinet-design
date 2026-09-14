# Semantic model decisions for Milestone 1

Status: design contract with an initial TypeScript/Zod core implemented and tested. See [semantic-core.md](semantic-core.md) for exact implementation boundaries and remaining integration requirements.

## Evidence and facts

Use `ProvenancedValue<T>` from the accepted requirements for every semantic leaf: SKU, category, dimensions, attributes, family facts, and normalized rule operands. IDs, timestamps and workflow metadata are not extracted facts. Keep one canonical dimension representation; do not store independently mutable top-level and nested dimensions.

`SourceEvidence` records document ID/hash, one-based physical PDF page, printed page label separately, region ID, exact source text, and optional normalized bounding box. Box coordinates use the displayed page after PDF rotation, top-left origin, each coordinate in [0,1]. Preserve raw extraction geometry and its transform. Exact visual inspection requires a box/region or a recorded full-page evidence scope; missing localization must not be disguised with invented coordinates.

Derived facts reference input fact IDs and a versioned derivation rule as well as source evidence. Human corrections retain original evidence and append actor, timestamp, previous/new values and reason. Human authorship alone is not source support. Repeated extraction of the same region is not independent corroboration.

Missing, explicitly absent, unknown and conflicting values are distinct states. Do not fill unknown dimensions from family majority or SKU heuristics without derived evidence. Define required fields per category: molding/accessory geometry need not match cabinet width/height/depth. SKU and category are required for all products; each category profile explicitly declares required dimensions.

## Rules

Implement a closed discriminated union, validated strictly, for `allowed_values`, `forbidden_values`, `requires`, `excludes`, `dimension_range`, `conditional_requirement`, `conditional_availability`, `modification_allowed`, and `modification_forbidden`.

Conditions support typed `eq`, `in`, numeric comparisons, `all`, `any`, and `not`. Field paths and value types come from a registry. No executable strings or arbitrary JavaScript. Finish and style use distinct stable IDs, preserving manufacturer labels. Rule scope references version-local product/family/category/series identities and retains its own evidence.

- `allowed_values`: values outside the set are invalid; missing input is unknown.
- `forbidden_values`: values inside the set are invalid; absence of a prohibition does not establish catalog-wide availability.
- `requires` / `excludes`: a scoped configuration must include / must not include the typed target product, option or modification.
- `dimension_range`: explicit unit, minimum/maximum, and inclusive/exclusive bounds; omitted limits do not imply manufacturer limits.
- Conditional primitives: apply the consequent only when the condition is true. A false condition means not applicable. An unknown condition yields unknown.
- Modification allowed/forbidden: preserve target and conditions; conflicting permission/prohibition is an unresolved conflict, not an automatic precedence choice.

Evaluation returns valid, invalid, unknown, or not_applicable, with rule IDs and evidence. Combine applicable constraints conjunctively; unknown never becomes valid by default. An invalid result can coexist with unresolved diagnostics. Do not assume a specific rule overrides a general rule unless the manufacturer explicitly establishes an exception and it is modeled with evidence.

Unsupported source meaning becomes `UNMODELED_RULE`, with original text, scope evidence, severity and review requirement. Unassessed severity defaults to blocking until reviewed. Rule-level provenance alone does not replace evidence for scope, condition and constraint operands. Original manufacturer language always survives normalization.

## Approval and publication

A fact/rule is eligible only when confidence meets threshold and the mandatory blocker list is empty. Entity eligibility also requires its required fields and validity-affecting rules to be resolved. Human review transitions cannot bypass deterministic invalidity: edits trigger validation again. Rejections require disposition of dependent entities and benchmark coverage.

Maintain blockers as identified findings with evidence, affected entities, severity, resolution actor/reason and revision. Editing a status enum does not resolve a finding. Reviewer edits invalidate affected approvals and gate results; reprocessing creates candidates without overwriting approved values.

Separate compilation attempts from catalog versions. A version has declared coverage (subset or full document), immutable source hashes, stable entity identities and a candidate revision. Gate reports record input revision, compiler/schema/prompt/model versions, benchmark revision, each check and reasons. Publication atomically verifies the report still applies and freezes the snapshot. Corrections require a new version.

JSON exports retain field/rule evidence, coverage, schema version and explicit revision. Sort entities by stable semantic identity and object keys consistently; exclude volatile generation timestamps from canonical comparison payloads. A flat convenience API may expose values, but must retain access to evidence and evaluated rules.
