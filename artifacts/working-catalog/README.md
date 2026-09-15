# Expanded AI working catalog

Created in the app as **Allure — expanded AI working catalog (311 products)**.

Version: `ks7a3dvg5mw8z2vvh7398bw5e18edtr1`.
Source sample: `ks7bv2m8w0bh0cc4qsfsnachq98ecp5w`, revision 336 (unchanged).

The version contains 311 products, 46 rules, 90 footnotes, eight cases, and 32 copied source pages/images. The additions are 122 products, 14 rules, and 32 footnotes. Every record has an automation audit entry. All 455 records start unreviewed and none is marked human verified; the original sample retains its four human-verification flags and previous approvals.

127 products have unresolved blockers: 13 inherited source gaps and 114 added products with at least one unknown dimension. This includes explicit per-SKU dimensions that the selected pages do not provide or that could only be assigned by an unverified SKU-decoding convention. Shared drawings and nominal host numbers are not treated as actual accessory/door dimensions. Existing draft dimensions in inherited products retain their original provenance and provisional status.

The added rules cover Galaxy/style/finish restrictions, required adjacent blind-cabinet fillers, and required filler/overlay combinations for wall spice pullouts. Additional source notes and options are stored as product fields; these are not an assertion that every source rule has been modeled.

Files:

- `additions.json`: validated import records with field-level source references.
- `import-result.json`: verified server counts and unchanged parent revision.
- `../../tools/prepare_working_catalog.py`: reproducible packaging of the directly reviewed source additions.

Validation: TypeScript and lint passed; 13 backend tests passed, including ownership, foreign-source rejection, duplicate identity rejection, stale revisions, and preservation of the source sample. Live checks confirmed all 122 added product identities, 455 unique records/audits, 32 source images, correct rule version references, and a searchable WBC2442 record with actual table width 24 in (not maximum installation width 27 in).

This is an AI-assisted expansion of a draft, not an independent extraction benchmark or a published catalog.
