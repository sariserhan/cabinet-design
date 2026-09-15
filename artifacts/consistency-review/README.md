# Working catalog consistency review

Reviewed version `ks7a3dvg5mw8z2vvh7398bw5e18edtr1`, revision 64: 311 products, 46 compatibility rules, 90 footnotes, eight cases, and 32 source pages.

## Results

- All 464 record payloads passed the record schema.
- All 659 distinct evidence IDs reference the expected document hash and a copied source page. No evidence ID was reused for differing evidence objects. These checks establish reference consistency, not independent correctness of every cited fact.
- Every product-scoped rule points to a product in this catalog.
- The existing cross-source checker found no conflicting scalar values between products and footnotes, or between footnotes. This does not prove that every possible combination of rule conditions is conflict-free.
- All 140 rule-logic scenarios passed on temporary, in-memory approved copies: allowed/forbidden values, missing inputs, dimension boundaries, and required selections. No approvals were saved.
- All eight existing cases passed on those temporary copies. On the actual unreviewed catalog, five pass and three compatibility cases remain unsatisfied because rules are not approved. This is the expected approval gate, not evidence that the source restrictions are wrong.

## Remaining publication blockers

**Nine modification references have been resolved with source-backed registry entries:** CHASE-BASE, CHASE-DBASE, CHASE-TALL, CHASE-WALL, CUT-BASE, CUT-DBASE, CUT-SBASE, CUT-WALL, and the CUT-ROD requirement target. The entries were saved with automation audits, remain unreviewed, and eliminate all unresolved-modification-scope and dangling-rule-target errors.

**549 derivation findings concern unapproved inputs.** The referenced input facts exist, but their review states make them unresolved to the publication validator. These findings should not be described as 549 missing facts or broken links. The draft transformation labels are `benchmark-draft-sku-or-heading` (427 fields) and `ai-review-category-map` (122 fields); this check does not certify those transformation assumptions, particularly SKU-derived measurements.

**145 products retain unresolved fields**, as documented in the manufacturer question list. Some reported gate counts repeat the same underlying issue across field, record and publication checks.

**Accessory geometry policy completed.** Positive overall width, height and depth are required. All missing-profile findings are resolved; 22 additional accessory products now explicitly retain unknown dimensions instead of silently omitting required geometry.

The catalog also requires record review, case/footnote review and a passing benchmark/validation receipt. The publication gate is correctly closed. The completion pass added nine registry records. No approvals, human-verification flags or benchmark records were changed.

## Artifacts

- [Detailed results and scenarios](results.json)
- [Manufacturer questions](../unresolved-review/manufacturer-questions.md)
- [Complete unresolved product list](../unresolved-review/remaining-products.csv)
- Script: `tools/audit_working_catalog.ts` (reads an exported snapshot; performs no database writes)

TypeScript checks passed after adding the audit script. Rule scenarios validate data behavior separately from live approval status; they are not an independent extraction-accuracy benchmark.
