# Second review of unresolved products

Reviewed the 127 blocked products in **Allure — expanded AI working catalog (311 products)** against the source-page review and a whole-PDF text search for their identifiers and dimension guidance. The search found no additional dimension table establishing the remaining fields. No external API or manufacturer communication was used.

Saved 32 dimensional refinements across 13 panel products on PDF 103 / printed 82. Also added an explicit nominal-thickness explanation to seven sheet-stock records. Four products now have no deterministic blockers:

- IN PLY 1/2-2 SIDE
- IN PLY 3/4-2 SIDE
- PLY-1/2 48X120
- PLY-3/4 48X120

The other nine panel products received partial refinements. Unqualified PAN/PLY sheet heights remain unknown because the common drawing lists both 96 and 120 inches. Returned REP material thickness remains unknown; its return-face width is stored separately.

**123 products remain blocked.** These are grouped into eight manufacturer questions, with a complete CSV of SKUs and unresolved fields. Some questions concern missing mapping or interpretation, rather than a missing dimension label anywhere in the PDF. No dimensions were assigned solely by an unverified cabinet SKU convention.

All edits are audited as automation and remain unreviewed. No human-verification flags were added. The working catalog advanced from revision 1 to 14; the original benchmark stayed at revision 336.

## Files

- [Recovered fields](recovered-fields.json)
- [Manufacturer questions](manufacturer-questions.md) — draft only; not sent
- [Complete unresolved SKU list](remaining-products.csv)
- [Machine-readable unresolved list](remaining-products.json)

Verification: all 13 submitted records passed the existing record schema. A live readback matched every saved field, confirmed four blocker resolutions, counted 123 remaining blocked products, confirmed zero human-verification flags in the working catalog, and confirmed the parent benchmark revision was unchanged. No application code was changed in this review.
