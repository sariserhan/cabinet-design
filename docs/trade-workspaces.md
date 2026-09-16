# Trade workspaces

Open **Trade workspaces · countertops, flooring, painting & tile** below the main kitchen workflow. Each trade has independent material, supplier, price reference, measured scope, rates and notes. Units are inches, square feet, linear feet and USD. Material and labor prices start blank. Default coverage, slab sizes and waste allowances are editable planning assumptions, not manufacturer specifications.

## Countertops

- Uses rectangular countertop objects, including their modeled dimensions. Sink areas are not subtracted from raw slab purchases.
- Preview packs rectangles into slabs using edge trimming and saw kerf. Piece rotation is opt-in to preserve directional material assumptions. It uses a simple first-fit rectangular packing method, not an optimal nesting solver.
- Enter equal-width split counts when a piece needs proposed seams. Pieces that cannot fit prevent a priced total. The preview does not establish seam suitability, vein matching, supports, cutout clearance or fabrication tolerances.
- Enter slab price, fabrication/installation rate, exposed finished-edge length and profile, seam rate and cutout rate. Attached sink cutouts are counted; additional cutouts are entered separately.
- Export the printable estimate with slab previews and a separate CSV of all piece positions/dimensions. Coordinates are inches from the slab's upper-left corner. These are planning documents, not CNC files. Waterfall/upstand pieces require separate countertop objects.

Manufacturer guidance explains why slab size, design and seams need fabricator confirmation: [Cambria slab sizing](https://www.cambriausa.com/content/dam/cusa/sales-marketing-collateral/product-technical-information/slab-size-product-information.pdf).

## Flooring

- Start from the current polygonal room floor, or sum named measured rectangles.
- Enter excluded area explicitly; cabinets and overlapping rectangles are not automatically deducted. Where the design already knows the figure, the workspace offers it: the floor covered by everything standing on it for flooring and floor tile, and modelled doors and windows on the selected walls for painting. Selecting **Use N sq ft as the deduction** applies it. Nothing is deducted until you do, because whether flooring runs under cabinets, or a wall is painted behind them, is a job decision. The printed estimate records the derived figure and whether the entered deduction matches it.
- Boxes = ceiling(net area × (1 + waste percentage / 100) / coverage per box).
- Material charges use whole boxes; installation and preparation charges use net area. Transition lengths and charges are separate.
- Laying direction/pattern is recorded; it does not automatically establish waste or generate individual plank cuts.

## Painting

- Uses one interior face of selected enabled perimeter walls. Wall areas follow modeled ceiling heights; vaulted walls are split at the ridge. Optional ceiling area follows modeled slopes. Curved outlines use the room model's sampled geometry.
- Opening area is a suggestion. Enter applicable deductions for openings, cabinet coverage and other unpainted surfaces after reviewing the selected scope. Partition walls, trim and exterior faces are excluded.
- Finish gallons = ceiling(net area × coats × (1 + allowance / 100) / coverage per gallon per coat). Primer gallons are calculated separately, without the finish allowance.
- Installation rate is per net square foot for the complete entered coat scope, not per coat.
- In a polygonal room a side can carry more than one wall segment. An opening records the side it is on, not the segment, so a suggested opening deduction for such a side covers every segment on it and says so.

The initial 350 sq ft/gallon value is an editable starting assumption; product and surface conditions matter. [Sherwin-Williams coverage guidance](https://www.sherwin-williams.com/en-us/color/color-tools/paint-calculator).

## Tile and backsplash

- Enter non-overlapping rectangles for backsplash/wall areas, or choose the room floor.
- Tiles = ceiling(net area × (1 + waste percentage / 100) / tile face area); boxes = ceiling(tiles / tiles per box).
- Grout and adhesive bags round up separately using user-entered coverage; edge trim is priced by length.
- Patterns are scope notes. Coverage and cutting losses must be confirmed for the selected product and layout; this does not produce a tile-by-tile installation drawing.

## Saving, stale estimates and exports

**Save [trade] estimate** stores settings and fingerprints of the exact design and settings. Any design/settings change makes the saved estimate stale. Export buttons require a matching saved estimate. Missing material/labor rates allow an explicitly unpriced draft; zero rates are allowed. Invalid geometry or amounts never produce a priced total.

Select **Include [trade] in combined estimate**, then save it. The combined figure is available only when every included trade has a current, priced estimate. It excludes tax and the separate cabinet supplier quote. Check overlapping installation charges before combining documents.

Settings are local to the signed-in account and project in this browser. Other-tab changes block saving until explicitly reloaded. Export/import trade settings for transfer; imported settings require estimates to be saved again. Complete project backups include trades. Restoring a backup as a new project clears the prior saved-estimate fingerprints. Ordinary cloud design saves and shared-record publishing do not sync trade settings.

The HTML export opens independently and has a **Print / save PDF** button. CSV exports contain quantities and entered costs; countertop cut-list CSV additionally contains all slab placements. Retain the settings JSON and complete backup for recalculation.

## Field acceptance still required

Reconcile one real job per trade against an independent takeoff, supplier packaging/coverage and installer/fabricator quote. Confirm physical slab layout and cutting feasibility, selected wall deductions, overlapping zones, preparation scope and labor rates. Automated tests establish the implemented calculations and state handling; they do not certify those real-world inputs.

## Manufacturer material catalog

Each trade has a searchable starter catalog above the manual product fields:

| Trade | Profiles | Applied estimating data |
| --- | --- | --- |
| Countertops | Cambria Carrick, Brittanicca | Nominal 132 × 65.5 in slab |
| Flooring | COREtec Butterscotch Oak CR504_04069, Calypso Oak VV012_00761 | 17.8 and 23.64 sq ft per carton respectively |
| Painting | Benjamin Moore Regal Select Interior Matte N548 | 400 sq ft / gallon / coat (lower end of published 400–450 range) |
| Tile & backsplash | Daltile Rittenhouse Square plain 3 × 6 wall tile | 100 pieces / box; nominal 12.5 sq ft / box |

These six profiles are a starter selection, not complete manufacturer catalogs or live availability feeds. Primary manufacturer URLs and source-check dates (2026-09-15) are recorded in `src/designer/trade-material-catalog.ts` and shown in the picker. Daltile's linked sheet is dated 2019: confirm current availability and packaging. No manufacturer artwork is copied, and no dealer pricing is supplied.

Selecting a material applies only its listed measurement fields, records a source snapshot, and clears the previous material price and price reference. Job measurements, labor, supplier, waste and fabrication assumptions remain editable. Color/base, finish, thickness and order availability require supplier confirmation. These selections feed estimates; they do not change the 3D materials.

Edits to the selected product name or applied measurements are labeled customized. Wall-only tile blocks priced estimates for room floors or measured zones marked Floor. Use as custom material explicitly removes the catalog association while preserving entered measurements. Selecting any new product invalidates the previously saved estimate.

Source snapshots survive local saves, trade settings imports/exports and complete project backups. Printable estimates include source details and caveats; quantity CSV includes product, source, source date and customization status. Shared cloud publishing continues to exclude local trade settings.
