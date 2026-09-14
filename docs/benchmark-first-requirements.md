# Accepted benchmark-first requirements

Agreed. Tighten those five areas before implementing the full-book pipeline.

Start with **benchmark + semantic data model + one complete vertical slice**, not full-document extraction.

### 1. Benchmark comes first

Create two benchmark levels.

**Development benchmark**

Build a deliberately representative manually verified fixture containing approximately:

```text
150–200 products
30+ footnote-derived facts
30+ rules/restrictions
multiple product families
at least one diagram-dependent case
at least one cross-page rule
at least several intentional ambiguous/conflicting cases
```

Include ordinary/easy cases AND difficult cases.

Do not select only clean tables.

This benchmark must exist before optimizing extraction.

**Final auto-approval validation benchmark**

The original 100-product fixture is not enough to support a 99.5% auto-approval reliability claim.

For final validation, manually verify at least:

```text
600 randomly sampled AUTO-APPROVED field/record decisions
```

with zero critical extraction errors before claiming approximately 99.5% auto-approval reliability.

Keep separate metrics for:

```text
products
individual fields
rules
footnotes
```

Do not hide rule errors inside an aggregate product-accuracy number.

---

### 2. Field-level provenance is mandatory

Agreed.

Product-level provenance alone is insufficient.

Every extracted/derived field must support its own evidence.

Conceptually:

```ts
type ProvenancedValue<T> = {
  value: T;

  confidence: number;

  provenance: SourceEvidence[];

  extractionMethod:
    | "table"
    | "text"
    | "vision"
    | "derived"
    | "human";

  reviewStatus:
    | "unreviewed"
    | "auto_approved"
    | "approved"
    | "rejected";
};
```

Example:

```ts
widthIn: {
  value: 30,
  confidence: 0.999,
  provenance: [
    {
      documentId,
      pageNumber: 42,
      boundingBox,
      sourceText: "W3018"
    }
  ]
}
```

A product may legitimately have:

```text
width → page 42
depth → page 43
finish restriction → page 188
modification rule → page 244
```

The UI must allow viewing the source for an individual field/rule, not just the overall product.

---

### 3. Define executable rule semantics now

Do not store important manufacturer restrictions only as prose.

Use normalized rule types that preserve both the explicit allowed state and the implied exclusion.

For example:

> Available only in Frost, Dove and Indigo.

must NOT become merely:

```json
{
  "available": true,
  "finishes": ["Frost", "Dove", "Indigo"]
}
```

Represent it as a constraint such as:

```json
{
  "type": "allowed_values",
  "field": "finish",
  "values": ["Frost", "Dove", "Indigo"],
  "outsideSet": "invalid"
}
```

Other initial rule primitives should support approximately:

```text
allowed_values
forbidden_values
requires
excludes
dimension_range
conditional_requirement
conditional_availability
modification_allowed
modification_forbidden
```

General structure:

```ts
type CatalogRule = {
  id: string;

  scope: RuleScope;

  when?: RuleCondition;

  constraint: RuleConstraint;

  sourceText: string;

  provenance: SourceEvidence[];

  confidence: number;

  reviewStatus: ReviewStatus;
};
```

Examples:

```text
IF finish = X
THEN modification Y unavailable
```

```text
IF width > 36
THEN configuration invalid
```

```text
Product family A
REQUIRES finished panel B
WHEN exposedSide = true
```

Keep the original manufacturer language alongside every normalized rule.

If the source cannot be represented safely in the current rule vocabulary, mark it:

```text
UNMODELED_RULE
```

and require review rather than inventing semantics.

---

### 4. Confidence and auto-approval eligibility are separate concepts

Agreed.

A record can have:

```text
confidence = 0.995
```

and still be prohibited from auto-approval.

Create explicit blocking conditions.

Conceptually:

```ts
type ApprovalEvaluation = {
  confidence: number;

  eligibleForAutoApproval: boolean;

  blockers: ApprovalBlocker[];
};
```

Initial blockers should include:

```text
unresolved_conflict
missing_required_field
missing_provenance
ambiguous_footnote_scope
unmodeled_rule
failed_cross_source_validation
diagram_dependency_not_verified
page_processing_warning_affecting_record
duplicate_sku_conflict
invalid_dimension
```

Auto approval requires BOTH:

```text
confidence >= AUTO_APPROVE_THRESHOLD
AND
blockers.length === 0
```

No aggregate score may override a blocker.

This is important.

---

### 5. Define publication gates

Processing completion and catalog publication are separate states.

Use approximately:

```text
PROCESSING_COMPLETE
REVIEW_REQUIRED
PUBLISHABLE
PUBLISHED
```

A catalog version is **not publishable** merely because the pipeline completed.

For V1, publication requires:

```text
all pages processed OR deliberately marked ignored with audited reason

zero unresolved BLOCKING extraction failures

zero unresolved critical SKU conflicts

zero unresolved critical dimension conflicts

all required product fields have provenance

all auto-approved records satisfy approval eligibility

all low-confidence/blocking records reviewed

no unresolved ambiguous footnote affecting product validity

no unresolved UNMODELED_RULE classified as critical

benchmark thresholds pass

catalog validation suite passes
```

If a non-product page fails and is genuinely irrelevant, admin may mark it:

```text
IGNORED_NON_CATALOG_CONTENT
```

with reason.

But a failed page containing:

```text
products
dimensions
footnotes
rules
modifications
restrictions
```

must block publication until resolved.

Allow draft/incomplete catalogs internally.

Do NOT allow them to become the production source of truth.

---

### 6. Start with one complete vertical slice

Do this before processing the entire Allure book.

Select approximately:

```text
20–40 representative pages
```

covering:

```text
clean product table

multi-SKU product family

footnotes/symbols

dimension diagram

cross-page restriction

modification rule

accessory/panel/molding page

ambiguous case

conflicting-evidence case
```

Take this subset completely through:

```text
PDF
↓
page extraction
↓
classification
↓
segmentation
↓
product extraction
↓
field provenance
↓
rule extraction
↓
deterministic validation
↓
conflict detection
↓
confidence
↓
approval eligibility
↓
review UI
↓
human correction
↓
publication gate
↓
JSON export
```

Do not scale to the entire book until this vertical slice works end-to-end.

---

### 7. First working milestone

Define Milestone 1 as:

> Compile the representative Allure subset into a trustworthy mini-catalog that passes deterministic validation, review, provenance, publication gates, and export.

Acceptance criteria:

```text
all benchmark SKUs found

all required basic dimensions correct

every approved field has field-level provenance

footnote scope correctly represented

selected cross-page rule correctly represented

ambiguous/conflicting examples correctly BLOCK auto approval

reviewer can inspect exact source evidence

reviewer can edit/approve/reject

edits retain audit history

publication gate blocks unresolved critical issues

published mini-catalog exports deterministic JSON
```

Only after that succeeds should we run the full Allure document.

---

### 8. Implementation order

Start in this order:

```text
1. Select representative source pages
2. Create manually verified benchmark truth
3. Finalize semantic schemas
4. Implement field-level provenance
5. Implement rule vocabulary/semantics
6. Implement approval blockers/publication gates
7. Build extraction for representative subset
8. Build deterministic validators
9. Build review/source UI
10. Complete vertical-slice benchmark
11. Measure results
12. Fix architecture/extraction weaknesses
13. Scale to full Allure document
14. Build larger final validation sample
```

So the answer to your question is:

**Start with the benchmark and data model together, then build the first end-to-end vertical slice.**

Do not begin by trying to extract the entire Fabuwood book.

Once the representative subset can survive difficult footnotes, diagrams, restrictions, conflicts, review, and export correctly, scale the same architecture to the whole catalog.
