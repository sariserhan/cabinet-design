# Human verification protocol

These are AI-drafted annotations, not independently verified ground truth. The read-only HTML packet pairs each selected source page with expandable records and evidence. Open full-size page images when needed. Human verification is an explicit prerequisite from the accepted benchmark-first requirements.

Review against the pinned PDF, not against the generated page text alone. First verify each product-page SKU inventory, including symbols and multiword accessory SKUs. Then review every semantic field, rule scope/condition/constraint, footnote marker and source relationship. Validate all numeric units and diagram associations. A text match proves location only, not interpretation.

Prioritize:

1. PDF 22: W2421/W3021 diamond distinction and single-star/double-star meanings.
2. PDF 51: B09FD no-shelf exception versus common family shelf attributes.
3. PDF 92: overlay filler nominal versus actual widths/heights and combined symbols.
4. PDF 104: SK W39 missing dimensions; do not fill with extrapolated values.
5. PDF 79 + 51: MLU-B18 is limited to B18FD; host width is not drawer/accessory width.
6. PDF 116 + 114 + 76: conditional CUT-ROD association.
7. PDF 60 and 97: opening versus exterior dimensions and molding diagram geometry.
8. All remaining entries, including easy tables; difficult cases do not replace complete verification.

Record decisions in a separate `human-review.jsonl` file, one JSON object per decision, with:

- `draftSnapshotSha256`: SHA-256 of draft-snapshot.json.
- `recordId` and `fieldPath` (or explicit whole-record scope).
- `decision`: approve, correct, reject, or source_ambiguous.
- `reviewer`: actual human identity; never populate this with the assistant identity.
- `reviewedAt`: actual ISO timestamp.
- `originalValue`, `correctedValue` when applicable, evidence references, and reason.

No review file is created with invented approvals. Keep original drafts intact. A future importer must verify hashes, record completeness and audit metadata before promoting records to a distinct verified fixture. A general acknowledgement of the project plan is not factual verification of these annotations.

Some draft rules have top-level evidence pending operand-level annotation; some SKU-derived dimensions need corroborating evidence and versioned derivations. Repeated or multiline evidence matches require human region association. Accessories/moldings require category-specific dimension profiles. These limitations must be resolved before a verified fixture or approval-eligibility claim.

There is no requirement to approve uncertain values: confirm the uncertainty, its evidence and expected blocker. For SK W39, review may establish that dimensions are unresolved within this source subset. Publication must then remain blocked unless the missing information is resolved, the record is explicitly rejected with coverage consequences, or the required-field policy is legitimately revised with audit evidence.
