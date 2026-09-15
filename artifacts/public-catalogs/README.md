# Fabuwood public reference catalogs

The designer's **Cabinets → Catalog source** picker now includes pinned February 2026 Allure, Illume and Ovela books. These are separate public reference drafts, available alongside the existing account-owned workspace catalog. They do not replace or approve workspace records and do not enter the compiler publication pipeline.

| Series | PDF pages scanned | Distinct reference entries | Placeable cabinet drafts |
| --- | ---: | ---: | ---: |
| Allure | 139 | 1,190 | 145 |
| Illume | 92 | 605 | 16 |
| Ovela | 84 | 602 | 16 |

Entry counts include accessories, sample doors, sales tools, modification codes and source-listed finish variants. They are not counts of cabinet bodies or all possible configured products. The Allure entries include the existing 311 draft products, plus 879 additional reference identities. Parsing ITEM columns across all pages does not prove exhaustive extraction; formats outside those columns may be missed. The per-page coverage files identify scanned pages, item headers and extracted rows for further review.

## Source and dimensional evidence

`src/designer/public-catalog-manifest.json` pins URLs, local PDFs and SHA-256 hashes. Source links serve those exact PDFs and use physical PDF page numbers. The books warn that some information is outdated and direct users to the dealer portal; these are not asserted to be current ordering specifications.

`public/catalogs/*.json` stores row text and normalized source boxes where extracted, unknown dimensions, source page and unreviewed status. Allure retains existing known dimensional draft values and their field-level provenance from `artifacts/completion/working-catalog.json`. No dimensions are transferred between series.

For each new series, 12 blind wall cabinets use the actual-width table and same-page height/depth drawings. Four microwave cabinets use their individual dimensioned diagrams. Their notes retain required adjacent fillers/handing or appliance-cutout review. These dimensions were checked by the agent, not a human verifier. Generic renderings do not model their precise door/cutout/blind configuration. Other new dimensions remain unresolved; the designer blocks placement. No width is inferred from a product code.

## Integration

Catalog files load on selection. Search, category filters, a placeable-only filter and pagination apply within a series. Source identifiers are namespaced by series and PDF hash and remain in design saves and output schedules. Public records retain an unverified status and do not trigger database queries using synthetic record IDs.

Supplier price-request configuration includes the public catalog version so matching SKU/dimensions from different series cannot share a price accidentally. Existing non-public requests retain their prior configuration shape. Source notes survive both Add and drag/drop.

## Reproduction

```sh
PYTHONPATH=.local/pdf-tools python3 tools/prepare_public_catalogs.py
npm run check
npm run build
```

The generator requires PyMuPDF; the project already has a local installation. Source PDFs must match the checked-in manifest hashes. Generated files and PDFs are committed; temporary browser QA files stay outside the repository. No backend deployment or catalog publication is needed for this reference library.

## Remaining work

- Verify extraction completeness, unusual row formats and manufacturer category assignments.
- Resolve missing dimensions using explicit drawings or supplier clarification.
- Verify current styles, finishes, handing, accessories, modifications and installation rules.
- Obtain current dealer pricing and availability before preparing an order.
