# Catalog Compiler V1 — Fabuwood Allure Benchmark

> Implementation starts with a benchmark and semantic model, followed by a 20–40-page vertical slice. The accepted requirements in [benchmark-first-requirements.md](docs/benchmark-first-requirements.md) are normative and supersede any conflicting illustrative schema or workflow below. See [semantic-model.md](docs/semantic-model.md) and [benchmark plan](tests/fixtures/fabuwood-allure/README.md).

## 1. Mission

Build a prototype that converts a real cabinet-manufacturer specification book into a **structured, source-linked, validated, versioned digital catalog**.

The first benchmark catalog is:

```text
Manufacturer: Fabuwood
Series: Allure
Source: Public Allure Spec Book
Version: V.02.26.26
```

Do NOT build the kitchen designer yet.

The purpose of V1 is to answer one question:

> Can we reliably turn a large real-world cabinet specification book into structured software-ready catalog data with minimal human review?

---

# 2. Core Product

Input:

```text
Manufacturer specification PDF
```

Output:

```text
Structured Catalog
│
├── Product families
├── SKUs
├── Categories
├── Dimensions
├── Attributes
├── Options
├── Styles / finishes where specified
├── Modifications
├── Restrictions
├── Notes / footnotes
├── Compatibility rules
├── Accessories
├── Source references
├── Confidence scores
└── Review status
```

Every extracted fact must be traceable back to its source.

Example:

```json
{
  "sku": "W3018",
  "category": "wall_cabinet",
  "widthIn": 30,
  "heightIn": 18,
  "depthIn": 12,

  "attributes": {
    "doors": 2
  },

  "source": {
    "documentId": "fabuwood-allure-2026-02-26",
    "page": 1,
    "section": "12-27 High Wall Cabinets"
  },

  "confidence": 0.997,

  "reviewStatus": "auto_approved"
}
```

---

# 3. Non-Goals

Do NOT implement yet:

```text
Kitchen editor
3D rendering
Room drawing
Quoting
Dealer pricing
Live inventory
Fabuwood ordering
Customer CRM
Manufacturer portal integration
AI kitchen generation
Cut lists
Production/CNC
```

V1 is exclusively:

> **documents → validated catalog**

---

# 4. Technology Stack

Use:

```text
Frontend
Next.js
TypeScript
Tailwind
shadcn/ui

Backend / persistent state
Convex

Local editor state
React / Zustand if necessary

File storage
Convex Storage or existing project object storage

Catalog processing
Dedicated ingestion worker/module

Structured validation
Zod

AI
Provider abstraction supporting at least:
OpenAI
Anthropic
```

Do not couple extraction permanently to one AI provider.

---

# 5. Processing Architecture

```text
PDF
 ↓
DOCUMENT INGESTION
 ↓
PAGE CLASSIFICATION
 ↓
STRUCTURE DETECTION
 ↓
TABLE / TEXT / DIAGRAM EXTRACTION
 ↓
SEMANTIC NORMALIZATION
 ↓
PRODUCT / RULE EXTRACTION
 ↓
DETERMINISTIC VALIDATION
 ↓
CROSS-SOURCE VALIDATION
 ↓
CONFIDENCE SCORING
 ↓
REVIEW QUEUE
 ↓
APPROVED CATALOG
 ↓
VERSIONED EXPORT
```

AI is used to interpret information.

AI must NOT be the final authority.

The system must validate extracted data independently wherever possible.

---

# 6. Document Ingestion

Admin uploads a manufacturer document.

For V1, support:

```text
PDF
```

Architecture should allow later:

```text
XLSX
CSV
DOCX
images
ZIP bundles
```

Document record:

```ts
type CatalogDocument = {
  manufacturerId: Id<"manufacturers">;

  name: string;
  sourceType: "pdf";

  sourceFilename: string;

  documentVersion?: string;

  sha256: string;

  pageCount: number;

  status:
    | "uploaded"
    | "processing"
    | "processed"
    | "failed";

  createdAt: number;
};
```

Calculate SHA-256 of source document so the exact input is permanently identifiable.

---

# 7. Page Extraction

Each PDF page must become an independent processing unit.

Store:

```ts
type CatalogPage = {
  documentId: Id<"catalogDocuments">;

  pageNumber: number;

  text: string;

  pageType?: string;

  processingStatus: string;

  extractionConfidence?: number;
};
```

Preserve:

```text
page number
text blocks
table boundaries
headings
footnotes
visual relationships where possible
```

Do not flatten the entire PDF into one massive text string.

---

# 8. Page Classification

Classify every page before detailed extraction.

Possible types:

```text
table_of_contents
product_table
product_detail
modification_rules
accessories
moldings
panels
style_finish
general_specification
diagram
index
other
```

One page may contain multiple regions/categories.

Store classification confidence.

---

# 9. Source Segmentation

Split pages into semantically meaningful regions.

Example:

```text
Page 1

Region A
"12–21 HIGH"
SKUs...

Region B
"24 HIGH DOUBLE DOOR"
SKUs...

Footnotes
* Single door cabinet
** Includes 1 shelf
♦ available only in specified finishes
```

Do NOT treat footnotes as unrelated page text.

Associate footnotes with affected products.

This is one of the key V1 challenges.

---

# 10. Catalog Hierarchy

Normalize manufacturer content into:

```text
Manufacturer
 ↓
Series
 ↓
Product Category
 ↓
Product Family
 ↓
Product / SKU
 ↓
Options / Modifications / Rules
```

Example:

```text
Fabuwood
└── Allure
    └── Wall Cabinets
        └── 12–21 High
            ├── W2412
            ├── W3012
            ├── W3312
            └── ...
```

---

# 11. Manufacturer Schema

```ts
type Manufacturer = {
  name: string;
  slug: string;

  website?: string;

  createdAt: number;
};
```

Initial:

```text
Fabuwood
```

---

# 12. Series Schema

```ts
type CatalogSeries = {
  manufacturerId: Id<"manufacturers">;

  name: string;

  constructionType?: string;

  sourceDocumentIds: Id<"catalogDocuments">[];

  createdAt: number;
};
```

Initial:

```text
Allure
```

---

# 13. Product Category

Use normalized categories.

Initial cabinet taxonomy should support:

```text
wall_cabinet
base_cabinet
tall_cabinet
vanity
corner_cabinet
oven_cabinet
refrigerator_cabinet
pantry
panel
filler
molding
accessory
hardware
other
```

Preserve the original manufacturer category name separately.

Example:

```json
{
  "normalizedCategory": "wall_cabinet",
  "manufacturerCategory": "12-21 High Wall Cabinets"
}
```

---

# 14. Product Model

Recommended core schema:

```ts
type CatalogProduct = {
  manufacturerId: Id<"manufacturers">;
  seriesId: Id<"catalogSeries">;
  catalogVersionId: Id<"catalogVersions">;

  sku: string;

  name?: string;

  normalizedCategory: string;
  manufacturerCategory?: string;

  widthIn?: number;
  heightIn?: number;
  depthIn?: number;

  dimensions?: {
    widthIn?: number;
    heightIn?: number;
    depthIn?: number;
  };

  attributes: Record<string, unknown>;

  notes?: string[];

  sourceRefs: SourceRef[];

  confidence: number;

  reviewStatus:
    | "auto_approved"
    | "needs_review"
    | "approved"
    | "rejected";

  createdAt: number;
  updatedAt: number;
};
```

---

# 15. Source Reference

Every meaningful field must retain provenance.

```ts
type SourceRef = {
  documentId: Id<"catalogDocuments">;

  pageNumber: number;

  section?: string;

  sourceText?: string;

  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  extractionMethod:
    | "text"
    | "table"
    | "vision"
    | "derived"
    | "human";
};
```

Provenance is mandatory at **field level** for every extracted or derived field, including nested attributes and rule operands. Product-level references are supplementary. Each field uses `ProvenancedValue<T>` as specified in the accepted requirements; scalar examples elsewhere are illustrative export views only.

Example:

```json
{
  "field": "widthIn",
  "value": 30,
  "source": {
    "pageNumber": 1,
    "sourceText": "W3018"
  }
}
```

---

# 16. SKU Intelligence

Use deterministic SKU parsing where patterns are reliable.

Example:

```text
W3018
```

may strongly imply:

```text
W = wall cabinet
30 = width
18 = height
```

But SKU-derived interpretation must be:

```text
derived evidence
```

not unquestioned truth.

If source table says:

```text
W3018
width = 30
height = 18
```

confidence increases.

If extracted values conflict:

```text
SKU-derived width: 30
table width: 36
```

flag:

```text
CONFLICT
```

and send to review.

---

# 17. Product Family Model

Many SKUs belong to one parametric family.

Example:

```text
W1218
W1518
W1818
W2118
W2418
W2718
W3018
...
```

These should not necessarily become completely unrelated product definitions.

Create:

```ts
type ProductFamily = {
  name: string;

  normalizedCategory: string;

  commonAttributes: Record<string, unknown>;

  dimensionRules?: unknown;

  productIds: Id<"catalogProducts">[];

  sourceRefs: SourceRef[];
};
```

This will matter later when the design engine needs parametric cabinets.

---

# 18. Footnotes and Symbols

The compiler must understand manufacturer symbols.

Example source:

```text
* W1218
** W3021
♦ W3321
```

Then footnotes:

```text
* Single door cabinet
** Includes 1 shelf
♦ Available only for specified finishes
```

Create structured conditions.

Example:

```json
{
  "sku": "W1218",

  "attributes": {
    "doorCount": 1
  },

  "derivedFrom": {
    "symbol": "*",
    "footnote": "Single door cabinet"
  }
}
```

Do NOT leave important footnotes as plain text when they can be structured.

---

# 19. Rules Model

Create first-class catalog rules.

```ts
type CatalogRule = {
  catalogVersionId: Id<"catalogVersions">;

  ruleType:
    | "availability"
    | "compatibility"
    | "dimension"
    | "modification"
    | "requirement"
    | "exclusion"
    | "note";

  scope: {
    productIds?: Id<"catalogProducts">[];
    productFamilyIds?: Id<"productFamilies">[];
    categories?: string[];
    seriesId?: Id<"catalogSeries">;
  };

  condition?: unknown;

  effect: unknown;

  originalText: string;

  sourceRefs: SourceRef[];

  confidence: number;

  reviewStatus: string;
};
```

Example:

```json
{
  "ruleType": "availability",

  "scope": {
    "products": ["W2421", "W3321", "W3621"]
  },

  "condition": {
    "finish": {
      "in": [
        "Frost",
        "Dove",
        "Indigo",
        "Timber",
        "Desert Oak"
      ]
    }
  },

  "effect": {
    "available": true
  }
}
```

---

# 20. Preserve Original Language

Even when a rule is successfully structured, preserve:

```text
original manufacturer text
```

Never throw it away.

The future designer should be able to display:

> Source rule from manufacturer

and show the exact original language.

---

# 21. Confidence Model

Every extracted entity and rule receives:

```text
0.0 – 1.0
```

Suggested thresholds:

```ts
AUTO_APPROVE_THRESHOLD = 0.98;
REVIEW_THRESHOLD = 0.80;
```

Behavior:

```text
>= 0.98 AND no approval blockers
auto approved

Any approval blocker, regardless of score
needs review

0.80–0.9799
needs review

< 0.80
needs review / extraction warning
```

Do not automatically reject low-confidence records.

Send them to review.

---

# 22. Confidence Factors

Confidence should consider:

```text
clean table extraction
SKU-pattern agreement
repeated occurrence consistency
cross-page agreement
clear heading relationship
AI confidence
rule ambiguity
footnote association confidence
diagram dependency
conflicting sources
```

Do not let the LLM simply invent one arbitrary confidence number.

Calculate an aggregate score using structured signals. Confidence and approval eligibility are separate. No aggregate score may override a blocker. The complete mandatory blocker list is in the accepted requirements.

---

# 23. Validation Engine

Create deterministic validators.

Examples:

### Duplicate SKU

```text
same catalog version
same SKU
different dimensions
→ conflict
```

### Impossible dimension

```text
width <= 0
→ invalid
```

### SKU consistency

```text
W3018

derived width = 30
derived height = 18

extracted width = 30
extracted height = 18

→ strong agreement
```

### Family consistency

If every related product has:

```text
depth = 12"
```

except one extracted as:

```text
depth = 21"
```

flag it.

---

# 24. Cross-Source Validation

When multiple locations describe the same fact, compare them.

Example:

```text
product table
vs
dimension diagram
vs
modification section
```

Possible result:

```text
AGREEMENT
3 independent source references

confidence ↑
```

or:

```text
CONFLICT

page 42 says 30"
page 118 says 33"

requires review
```

---

# 25. Extraction Stages

Do not ask one giant AI prompt to understand the entire PDF.

Use specialized stages.

Recommended:

```text
Stage 1
Page classifier

Stage 2
Section detector

Stage 3
Product extractor

Stage 4
Footnote interpreter

Stage 5
Rule extractor

Stage 6
Normalizer

Stage 7
Validator

Stage 8
Critic / consistency checker
```

Each stage uses structured output.

---

# 26. Structured AI Output

All AI extraction must use strict schemas.

Example:

```ts
type ExtractedProductCandidate = {
  sku: string;

  category?: string;

  widthIn?: number;
  heightIn?: number;
  depthIn?: number;

  symbols?: string[];

  notes?: string[];

  sourceEvidence: string[];

  extractionConfidence: number;
};
```

Validate with Zod.

Malformed model output must never enter the approved catalog.

---

# 27. AI Critic

Run a second pass for difficult records.

Input:

```text
original page content
extracted product/rule
deterministic validation results
```

Ask:

```text
Did extraction misread the source?

Was a footnote applied to the wrong SKU?

Does the structured rule preserve the original meaning?

Is a dimension inferred without sufficient evidence?

Are multiple distinct products accidentally merged?
```

Use the critic to raise flags.

Do not automatically let it overwrite approved data.

---

# 28. Human Review UI

This is a core V1 feature.

Route:

```text
/review
```

Show review queue.

Example:

```text
REVIEW QUEUE

91 records require review

────────────────────

SKU
W3321

FIELD
Availability

EXTRACTED
Galaxy Frost
Galaxy Dove
Galaxy Indigo
Galaxy Timber
Galaxy Desert Oak

CONFIDENCE
87%

SOURCE
Page 1

[VIEW SOURCE]

[APPROVE]
[EDIT]
[REJECT]
```

---

# 29. Side-by-Side Review

Best review UX:

```text
┌────────────────────┬────────────────────┐
│ SOURCE             │ EXTRACTED          │
│                    │                    │
│ PDF PAGE           │ SKU: W3321         │
│ highlighted area   │ Width: 33          │
│                    │ Height: 21         │
│                    │                    │
│                    │ Rule: ...          │
│                    │                    │
│                    │ Confidence: 87%    │
├────────────────────┼────────────────────┤
│                    │ APPROVE            │
│                    │ EDIT               │
│                    │ REJECT             │
└────────────────────┴────────────────────┘
```

Human should not need to search manually through a 600-page PDF.

Clicking:

```text
VIEW SOURCE
```

must jump directly to the relevant page/region.

---

# 30. Review Actions

Support:

```text
Approve
Edit
Reject
Merge duplicate
Split incorrectly merged record
Mark source ambiguous
```

Every human change must record:

```text
who
when
original value
new value
reason optional
```

---

# 31. Catalog Versioning

Never mutate an active catalog invisibly.

Create:

```ts
type CatalogVersion = {
  manufacturerId: Id<"manufacturers">;
  seriesId: Id<"catalogSeries">;

  version: string;

  sourceDocumentIds: Id<"catalogDocuments">[];

  status:
    | "draft"
    | "review"
    | "published"
    | "superseded";

  createdAt: number;
  publishedAt?: number;
};
```

Initial:

```text
Fabuwood Allure
2026.02.26
```

---

# 32. Immutable Published Versions

Once:

```text
catalogVersion.status = published
```

do not silently modify it.

Corrections create:

```text
2026.02.26-r2
```

or another explicit revision.

This is necessary because future kitchen projects may need to stay pinned to the catalog version used when they were designed.

---

# 33. Future Catalog Diff

Architecture must prepare for:

```text
2026 catalog
vs
2027 catalog
```

Future output:

```text
NEW PRODUCTS             42
REMOVED PRODUCTS          9
PRICE CHANGES             -
DIMENSION CHANGES         3
RULE CHANGES              6
NEW MODIFICATIONS        17
```

Pricing comparison is unavailable until pricing documents are supplied.

V1 only needs the data model and basic entity-level diff capability.

---

# 34. Catalog Diff Engine

Implement basic comparison:

```text
SKU added
SKU removed
SKU changed
dimensions changed
attributes changed
rules added
rules removed
rules changed
```

Example:

```text
W3018

2026:
depth = 12

2027:
depth = 12

No change
```

---

# 35. Searchable Catalog Browser

Route:

```text
/catalog
```

Allow:

```text
search by SKU
category
dimensions
family
review status
confidence
```

Example:

```text
Search: W30

W3012
W3015
W3018
W3021
W3024
...
```

Selecting product displays:

```text
structured fields
rules
source evidence
catalog version
confidence
review history
```

---

# 36. Source Viewer

Route or component:

```text
/source/[document]/[page]
```

Allow reviewer to see:

```text
full PDF page
highlighted source region
associated extracted records
```

This source viewer is extremely important.

Do not build a compiler where extracted facts cannot be audited visually.

---

# 37. Catalog Export

Support export to:

```text
JSON
```

Example:

```json
{
  "manufacturer": "Fabuwood",
  "series": "Allure",
  "version": "2026.02.26",

  "products": [...],
  "families": [...],
  "rules": [...]
}
```

JSON must be deterministic enough for automated comparison/tests.

Later formats can include:

```text
CSV
API
database sync
```

Not required in V1.

---

# 38. Internal API

Expose catalog access through an internal typed API.

Examples:

```ts
getProductBySku("W3018");

searchProducts({
  category: "wall_cabinet",
  widthIn: 30
});

getApplicableRules(productId);

getProductSource(productId);
```

The future kitchen designer should consume this API.

Do not make the future designer read raw extraction tables directly.

---

# 39. Catalog Compiler Interface

Keep ingestion manufacturer-independent.

Do NOT create:

```ts
parseFabuwoodAllure()
```

as the entire architecture.

Use something like:

```ts
compileCatalog({
  manufacturer,
  series,
  documents
});
```

Fabuwood is the benchmark, not a hardcoded special case.

Manufacturer-specific parser hints are acceptable.

---

# 40. Parser Hints

Allow optional configuration:

```ts
type ManufacturerHints = {
  skuPatterns?: RegExp[];

  knownCategories?: string[];

  knownFootnoteSymbols?: string[];

  dimensionConventions?: unknown;
};
```

The compiler should still function without hints.

Hints improve precision.

---

# 41. Benchmark Dataset

Create a manually verified benchmark subset from the Allure PDF.

At minimum:

```text
150–200 manually verified product records
30+ rules/restrictions
30+ footnote-derived facts
multiple categories and families
diagram-dependent and cross-page cases
easy, difficult, ambiguous and conflicting cases
```

Manually establish correct ground truth.

Store under:

```text
tests/fixtures/fabuwood-allure/
```

This development benchmark must exist before extraction optimization. Separately, final validation requires at least 600 randomly sampled auto-approved decisions with zero critical errors. Report product, field, rule, and footnote metrics separately; this development fixture cannot establish the final reliability claim.

---

# 42. Metrics

Track:

```text
SKU precision
SKU recall

dimension accuracy

category accuracy

footnote association accuracy

rule extraction precision

rule extraction recall

source-reference accuracy

auto-approval precision

percentage requiring human review
```

Do not judge the project by “the AI output looked good.”

Measure it.

---

# 43. V1 Accuracy Targets

Minimum target:

```text
SKU precision:                  >= 99%
SKU recall:                     >= 95%

simple dimensions accuracy:     >= 99%

category accuracy:              >= 97%

source-reference accuracy:      >= 99%

auto-approved record accuracy:  >= 99.5%
```

For complex rules:

```text
rule extraction accuracy target: >= 90%
```

Lower-confidence rules may go to human review.

Most important:

> Auto-approved records must be extremely trustworthy.

It is better to send 20% to review than confidently publish incorrect cabinet data.

---

# 44. Human Review Target

Initial target:

```text
< 20% of extracted records require review
```

Long-term target:

```text
< 5%
```

Do NOT prematurely optimize toward lower review volume at the expense of accuracy.

---

# 45. Processing Report

After compilation, generate:

```text
FABUWOOD ALLURE

Document:
Allure Spec Book V.02.26.26

Pages processed:
XXX

Products discovered:
2,841

Auto-approved:
2,504

Needs review:
337

Rules extracted:
412

Conflicts:
27

Processing failures:
3
```

Numbers above are illustrative.

Never fabricate actual counts.

---

# 46. Error Handling

Compiler must survive individual-page failures.

Example:

```text
Page 118
vision extraction failed
```

should not fail the entire catalog.

Mark:

```text
PAGE_REQUIRES_REPROCESSING
```

and continue.

At end:

```text
Processing completed with warnings.
```

---

# 47. Reprocessing

Allow:

```text
reprocess page
reprocess section
reprocess record
reprocess entire document
```

Do not require deleting/re-uploading a catalog.

---

# 48. Idempotency

Running the same source document through the same compiler version should not produce uncontrolled duplicates.

Track:

```text
document hash
compiler version
model/provider
prompt version
schema version
```

Store:

```ts
compilerVersion: string;
```

---

# 49. Prompt Versioning

Every AI extraction should record:

```text
provider
model
promptVersion
schemaVersion
timestamp
```

This allows us to compare compiler performance after model/prompt upgrades.

---

# 50. Cost Tracking

Record:

```text
AI input tokens
AI output tokens
vision calls
processing time
estimated processing cost
```

Display per compilation.

Example:

```text
Compilation cost:
$4.82

Products:
2,841

Cost / product:
$0.0017
```

Do not assume extraction cost is irrelevant.

This matters if we later ingest hundreds of catalogs.

---

# 51. Admin Dashboard

Simple internal routes:

```text
/
Documents
Catalogs
Review
Products
Rules
Versions
Diffs
Benchmarks
```

This is initially an internal tool.

Do not spend excessive time on visual design.

The future kitchen-design application will have separate UX.

---

# 52. Security

Uploaded catalogs may eventually contain proprietary dealer information.

Therefore architecture should already support:

```text
private documents
access control
no public raw-file URLs
server-side processing
audit logs
```

The public Fabuwood benchmark itself is public, but do not assume future documents are public.

---

# 53. Pricing Data

V1 explicitly does NOT fabricate pricing.

Products may contain:

```ts
price?: undefined;
```

When dealer pricing becomes available later, create a separate pricing layer:

```text
Product definition
+
Dealer price book
+
Dealer discounts
+
Modifications
=
Calculated price
```

Do not bake dealer-specific pricing into the base manufacturer product definition.

---

# 54. Future Pricing Model

Prepare for:

```ts
type PriceRecord = {
  sku: string;

  priceType:
    | "list"
    | "dealer"
    | "msrp";

  amount: number;
  currency: string;

  effectiveFrom?: number;
  effectiveTo?: number;

  sourceRef: SourceRef;
};
```

Not required to populate in public Allure V1.

---

# 55. Future Rule Engine Compatibility

Structure extracted rules so the future kitchen designer can evaluate:

```ts
isProductAvailable({
  sku,
  style,
  finish,
  dimensions,
  modifications
});
```

and return:

```json
{
  "valid": false,

  "reasons": [
    "This cabinet is unavailable in selected finish."
  ],

  "sourceRefs": [...]
}
```

This future use should influence the schema now.

---

# 56. Important Principle

The catalog is NOT just:

```text
a searchable database
```

It is eventually an executable specification of what the manufacturer allows.

Therefore aim toward:

```text
PRODUCT DATA
+
CONSTRAINTS
+
OPTIONS
+
RULES
+
PROVENANCE
```

not merely:

```text
SKU + dimensions
```

---

# 57. V1 Benchmark Test

The final benchmark must include this workflow:

```text
1. Delete generated Fabuwood catalog.

2. Upload clean original public Allure PDF.

3. Run compiler from scratch.

4. Wait for processing.

5. Review processing report.

6. Compare automatically against benchmark ground truth.

7. Inspect review queue.

8. Correct flagged records.

9. Publish catalog version.

10. Export JSON.

11. Run validation suite.

12. Confirm every benchmark SKU/rule links to source evidence.
```

---

# 58. Success Criterion

V1 is successful if:

> A developer can upload the real Fabuwood Allure spec book and receive a structured, auditable catalog that is accurate enough to serve as the future source of truth for a professional kitchen-design application.

Specifically:

```text
high-confidence products are correct
SKUs are correctly discovered
basic dimensions are correct
footnotes are associated correctly
source pages are preserved
uncertain data is flagged
human review is fast
published versions are immutable
JSON/API is usable programmatically
```

---

# 59. Failure Criterion

Do NOT declare V1 successful if it merely:

```text
extracts PDF text
creates embeddings
creates a chatbot over the catalog
summarizes pages
produces plausible-looking JSON
```

The goal is:

> **reliable structured manufacturer data**

not document search.

---

# 60. Development Sequence

Implement in this order:

1. Select 20–40 representative source pages, including dependencies.
2. Create manually verified benchmark truth.
3. Finalize semantic schemas.
4. Implement field-level provenance.
5. Implement executable rule vocabulary and semantics.
6. Implement approval blockers and publication gates.
7. Build extraction for the representative subset.
8. Build deterministic validators.
9. Build review/source UI.
10. Complete the vertical-slice benchmark, including review, publication and deterministic export.
11. Measure results separately for products, fields, rules and footnotes.
12. Fix architecture and extraction weaknesses.
13. Scale to the full Allure document only after Milestone 1 passes.
14. Build the larger final random validation sample.

Milestone 1: compile the representative Allure subset into a trustworthy mini-catalog. All benchmark SKUs must be found, required dimensions correct, approved fields evidenced, and selected footnotes/cross-page rules correctly represented. Ambiguities and conflicts must block auto approval. Review must support exact source inspection, edit/approve/reject and audit history. Publication must block unresolved critical issues; published JSON must be deterministic.

The mini-catalog declares its subset coverage explicitly and cannot stand in for a complete Allure catalog. Do not begin kitchen-designer functionality.

---

# 61. Development Rules

Maintain:

```text
IMPLEMENTATION_STATUS.md
```

Sections:

```text
Completed
In Progress
Remaining
Known Issues
Extraction Accuracy
Benchmark Results
Architecture Decisions
```

For every logical unit:

```text
implement
test
lint
typecheck
fix
commit
continue
```

Use small logical Git commits.

Do not leave placeholders for core V1 functionality.

---

# 62. Required Tests

At minimum:

```text
document hashing

page ordering

SKU extraction

SKU deduplication

dimension normalization

inch/fraction parsing

category normalization

symbol/footnote association

source-page references

duplicate/conflict detection

confidence scoring

review threshold

human edit audit history

catalog version immutability

JSON export determinism

catalog diff

benchmark precision/recall
```

---

# 63. Final Deliverables

V1 must produce:

```text
1. Catalog Compiler application

2. Fabuwood Allure compilation

3. Human review interface

4. Source-linked product browser

5. Versioned published catalog

6. Structured JSON export

7. Benchmark ground-truth dataset

8. Accuracy report

9. Catalog diff capability

10. Implementation documentation
```

---

# 64. Ultimate Direction

Do not build toward:

> “Fabuwood PDF reader.”

Build toward:

> **Upload virtually any cabinet manufacturer's documentation and turn it into a validated, executable digital catalog.**

Fabuwood Allure is simply the first proof.

If this benchmark succeeds, the next steps are:

```text
Allure
↓
Illume
↓
Ovela
↓
dealer price-book import
↓
second manufacturer
↓
catalog update compiler
↓
manufacturer-independent catalog platform
↓
browser kitchen designer
↓
design → validate → quote → order
```

The Catalog Compiler is the foundation.

The kitchen designer comes afterward.


# 65. Publication gates and approval eligibility (mandatory)

Apply the blocker list and publication checklist in the accepted requirements. Processing completion is not publication permission. Track processing state separately from review/publication readiness. Recompute gates against an exact immutable candidate revision; stale gate results cannot authorize publication. Human approval alone does not clear an unresolved blocker.

All in-scope pages must be processed or explicitly ignored as non-catalog content with actor, timestamp and reason. Failed product, dimension, footnote, rule, modification or restriction pages block publication. All required field provenance, eligibility checks, reviews, critical conflicts, footnote scope, critical unmodeled rules, benchmark thresholds and validation checks must pass. Draft/incomplete catalogs remain internal.

For Milestone 1, gates apply to the declared subset and its cross-page dependencies. Full-book publication applies to the entire source document. Out-of-scope catalog pages are never mislabeled as ignored non-catalog content. Final reliability claims additionally require the independent final validation benchmark.
