# Kitchen Studio demo

A browser-based kitchen planner using the existing Allure catalog. The entry page is `/designer`; sign in with your existing account. Your expanded catalog contains 311 products. Cabinets with known width, depth, and height can be placed. Other records remain available in Catalog and Review.

## Everyday kitchen workflow

Use the primary steps **Room → Cabinets → Design → Quote → Present**. Supporting approvals, orders, installation and aftercare are under **Project tools**. Examples and presentation shortcuts are in the header disclosure.

- **Room:** record and verify the room survey.
- **Cabinets:** choose a catalog and place products. Draft catalog records require verification before ordering.
- **More canvas room:** above the workspace, **Hide library** and **Hide properties** widen the canvas one panel at a time, **Focus canvas** hides both, and **Enlarge canvas** fills the browser window with the workspace. The enlarged view keeps the toolbars, library and properties available, so it is for working rather than presenting; press Escape or **Exit full canvas** to return. The 2D plan, 3D preview and Render stages all grow to the new height.
- **Design:** use **Quick edits · move, repeat & finish** to find items, move a selection by exact offsets, repeat a run with a gap, or change cabinet finishes. Linked items move together. Preview changes before applying; each application is one Undo step. New boundary/overlap/ceiling/sink conflicts block the edit.
- **Quote:** select a supplier price list and review its coverage and validity.
- **Present:** enter the drawing reference, revision, author and issue date in **Drawings & item list**. Export the drawing package, dealer CSV and matching design snapshot from the same unchanged design.

The drawing package is standalone HTML with a **Print / save PDF** button. Use A3 landscape, 100% / actual size, and check the 100 mm calibration line. Select a smaller scale if the drawing exceeds a sheet. Plans, straight-wall elevations and schedules share item marks and a design fingerprint. CSV dimensions are always inches. Curved-wall elevations are omitted and identified in the wall schedule.

Outputs are coordination drafts: verify site measurements, appliance specifications, service locations, manufacturer options and source records before ordering or installation. Mirrored fronts do not establish manufacturer handing. Real dealer and installer review is still required.

## Additional Fabuwood catalogs

In **Cabinets**, use **Catalog source** to choose the workspace catalog or the public Allure, Illume and Ovela reference drafts. Search product codes, filter by category, or select **Placeable cabinets only**. Each entry links to its exact physical page in the pinned February 2026 PDF.

The public library has 1,190 Allure, 605 Illume and 602 Ovela reference entries, including accessories, samples and modification codes. Of these, 145 / 16 / 16 respectively have cabinet dimensions supported for draft placement. Other records remain reference-only. Counts are extracted entries, not proof of complete manufacturer coverage. See [the catalog expansion notes](artifacts/public-catalogs/README.md) for provenance and limitations.

These source books warn of missing updates. Verify current specifications, finish choices and prices with the supplier. Public-catalog price requests include series/version identity in the configuration field; retain it when returning prices.

## Flooring, painting, countertops and tile

Open **Trade workspaces · countertops, flooring, painting & tile** below the main kitchen steps. Each workspace calculates quantities and a separate estimate with your own rates. Flooring/tile round to boxes, painting calculates coats and gallons, and countertops provide rectangular slab packing and proposed splits with a cut-list export. Save each estimate before exporting; design or settings changes flag it for recalculation. Complete backups include these browser-local settings.

See [trade workspaces](trade-workspaces.md) for formulas, scope, exports and field-validation limits.

## Connect from your laptop

The demo runs on the remote machine at `127.0.0.1:3000`.

```sh
ssh -N -L 127.0.0.1:4001:127.0.0.1:3000 headless
```

Open http://localhost:4001/designer. Keep the SSH terminal open. If you already have a working tunnel to remote port 3000, keep using it.

## Five-minute walkthrough

1. Select **Load example kitchen** to start with seven real Allure cabinets in an L-shaped arrangement. Or select **New room** to start empty.
2. Set room width, depth, and ceiling height in inches under Properties. Toggle the four rectangular room walls as needed.
3. Search the cabinet library by SKU or choose base, wall, pantry, or oven cabinets. Select **Add**. A free location is chosen automatically.
4. Drag cabinets in the **2D plan** or the **3D preview**; a 3D drag slides an item across its own level, so a wall cabinet stays at its elevation. Wall snapping is enabled by default. For precise placement, edit X/Y coordinates or use arrow keys (1 inch; Shift + arrow moves 6 inches). With an item selected in the 2D plan or 3D view, **R** rotates 90°, **Shift + R** turns 180°, and **Delete** or **Backspace** removes it; all three are undoable, and a locked item refuses the change and says so. These keys act only on those two editing views, so they do not take over the arrow keys elsewhere.

   The toolbar above the canvas reads left to right as: which view you are in, undo and redo, the tools, zoom, and the panel toggles at the far end. Teal means "this is the current choice" - the view you are in and the tool you are holding - and nothing else.

   **Help** beside the title opens a how-to guide over the workspace - the five stages, placing and selecting items, the keyboard, the views, what to do when something refuses to move, and how saving works. **?** opens it from anywhere in the designer and **Escape** closes it.

   To work on several items at once, **Shift + drag** across empty floor in the 2D plan to sweep a band over them, or **Shift + click** items one at a time in either the 2D plan or the 3D view. Dragging any member then moves the whole selection, and the arrow keys, **R** and **Delete** apply to all of it: a turn rotates the selection about its own centre, so a run of cabinets stays a run. Items linked to a selected one - its countertop, a mounted sink, the rest of its assembly - come along, one locked member refuses the change for the whole group, and a move or turn that would push something out of the room is reported instead of applied. Click empty floor to clear the selection, or click a single member to reduce the selection to it. Wall openings are not swept up by a band; the room tools move those.

   The 3D view starts with **Items locked**, so orbiting a design cannot move it. Clicking still selects while locked, which is how finishes are changed, but dragging and the item shortcuts do nothing until you select **Items locked** to unlock. The choice is remembered per account in this browser. Individual items can also be locked from Properties, which refuses any change to their geometry from every route, including the keyboard. Use Rotate, Turn 180°, Flip left/right, Duplicate, or Delete in Properties. Flip left/right mirrors the illustrative door front and handle; it does not change catalog dimensions or establish manufacturer handing. Undo and Redo preserve editing history during the session.
5. Switch to **3D preview**, rotate the view, and try the illustrative finishes. Both views use the same cabinet positions and dimensions. Drag the 3D view to orbit, or choose its Pan tool. Zoom buttons and Fit control the view.
6. Watch **Layout checks** for overlapping cabinets, room boundary violations, and ceiling height conflicts. Wall cabinets start at an editable elevation of 54 inches. Vertically separated cabinets do not count as overlaps.
7. Name the project and select **Save design**. Create a new room, select your saved design, and press **Open** to restore it.
8. **Export** downloads the design as JSON; **Import** restores that file in another browser. **Export list** downloads cabinet quantities and dimensions as CSV. Source links lead to the existing PDF review screens.

## Storage and scope

Edits automatically save a draft in this browser, separately for each signed-in account. Save design keeps named copies, up to 200, in an IndexedDB database rather than localStorage, so the limit is disk space rather than a few megabytes. An existing list of saved designs migrates across on first load. If the browser refuses a database, saving falls back to localStorage and says so, because the much smaller quota then applies. JSON export remains the portable backup; browser storage still does not sync to other devices and can be removed by clearing site data. Designs support up to 800 items and polygonal rooms with outer dimensions from 36 to 600 inches. Above 400 items the 3D view draws plain fronts without hardware so the scene stays buildable; the 2D plan, quantities and drawings are unaffected.

Under **Properties · Materials**, **Door style** switches every front between shaker (recessed panel), slab (flat overlay) and raised panel. The choice is illustrative geometry only: it does not select a manufacturer door program, and it never changes catalog dimensions.

This is the agreed kitchen-planning demo, not full 2020 Design parity. The 3D view shows dimensionally sized cabinet boxes with illustrative fronts and finishes. It does not provide photorealistic manufacturer models, manufacturer-specific appliance meshes, live manufacturer pricing, or automated code/clearance/compatibility certification. Layout checks cover geometry; catalog review remains available in the existing screens. Catalog dimensions are not silently resized or invented. No new AI API credits are required to use the designer.

## Run on the server

```sh
npm run dev -- --port 3000
```

## Validation

- `npm run check`: lint, TypeScript, 111 core tests, 15 backend tests, and benchmark artifact integrity.
- `npm run build`: production build.
- Playwright Chromium, desktop 1536×1024 and mobile 390×844: example loading, cabinet addition, pointer dragging, keyboard movement, rotation, duplication/deletion, undo/redo, zoom/fit, room resizing, overlap/boundary warnings, 3D view rotation, finish selection, saving/opening, reload restoration, JSON export/import, and invalid import rejection. No browser runtime errors or horizontal page overflow.
- Browser plugin was unavailable, so local Playwright was used. Tests used the isolated QA account's own catalog; no real-user review status was changed.

## Pan, zoom, and flip controls

- In 2D, drag empty space to pan. To pan over cabinets, choose **Pan**, hold **Space** while dragging, or drag with the middle mouse button. Choose **Select** to move cabinets again.
- Use **− / +** to zoom from 50% to 400%. **Fit** resets zoom and recenters the room. Panning changes the view, not cabinet positions.
- Select a cabinet, then choose **Turn 180°** to reverse its facing direction. **Flip left/right** toggles the illustrative front's handle side; the plan dot and 3D handle show the result. Flips support undo/redo and persist through saving, import, and export.
- In 3D, drag to orbit or choose **Pan** to move the view. The **− / +** buttons zoom, and **Fit** restores the starting view.

Additional Playwright checks: background pan, Pan tool over cabinets, Space-drag after toolbar focus, Fit reset, zoom, mirrored-front markers, 180-degree turning, undo/redo, mirror persistence after reload, 3D drag orbit/pan/zoom, and mobile layout. All passed with no browser errors.

## Doors, windows, appliances, islands, and countertops

Choose the **Objects** tab in the left library. Add Door, Window, Sink, Refrigerator, Dishwasher, Washing machine, Range, Island, or Countertop. These are generic demo objects with editable width, depth, height, and elevation; they are identified as demo objects in the exported item list.

- **Doors/windows:** choose an enabled wall under Attach to wall. X or Y moves the opening along that wall. Elevation sets the window sill; object height sets the opening height. Flip left/right mirrors the door swing. The plan shows the swing arc, and layout checks flag potential swing obstructions. The 3D room uses actual wall openings; front walls are hidden for the cutaway view.
- **Rooms in this job:** a design holds one room. A job collects several - a kitchen, an ensuite vanity, a laundry - so each keeps its own room, drawings and approval while the quote and the ordering list add up across them. Set it in **Rooms in this job** under the project tools. Each room keeps its own tax, discount and delivery and they are added as they stand rather than re-priced against another room's assumptions; the same product in two rooms becomes one ordering line naming both. Rooms appear in the list once they are saved, and changing room means opening that design.
- **Trim along the runs:** in the editing tools, one length of crown, light rail or toe kick per run of cabinets rather than one per cabinet. Cabinets count as one run when they sit on the same line, face the same way and meet end to end; a gap wider than a scribe starts a new run, because trim does not bridge a doorway. Where two runs meet square, each leg reaches out by the depth of its profile and the corner is counted as one mitre. The run, length and mitre counts are shown before it is applied, and applying it again replaces what the tool added rather than ordering it twice.
- **Services on the drawing:** water, drain, electric, gas and vent recorded in the measurement survey are drawn on the plan as marked points - W, D, E, G, V - and carried into the floor plan sheet with a service schedule giving each one's position, height and survey note. A service on a curved wall has no straight run to measure an offset along, so it is left out rather than placed somewhere plausible. Positions are as surveyed; confirm on site before first fix.
- **Handing and interiors:** a cabinet records which side it is hinged - left, right or a pair - separately from the mirrored front, which only flips the drawn picture. Drawer and rollout counts sit beside it. All three appear in the drawing configuration a supplier reads.
- **Leaders, angles and layers:** dragging with the **Note** tool gives the note a leader to whatever it points at; clicking alone leaves it where it is. **Angle** takes three clicks - the corner, then a point along each side - and reads the opening rather than the reflex outside it, so a square corner says 90°. Every note, dimension and angle carries a layer: every drawing, or design, installation or client only, chosen in Properties. A drawing issue picks the layer it carries and which sheets it contains - floor plan, upper plan, elevations, schedules - so a client pack can be the plan alone rather than the whole set.
- **Plan & elevations DXF:** beside the existing Layout DXF, an export carrying the plan and one frame for every straight wall, with placed notes and dimensions. Millimetres, as the header declares; a curved wall has no flat projection and is named as skipped rather than dropped.
- **Start from a DXF plan:** in the Room stage, **Start from a DXF plan** reads a room outline out of a drawing somebody else produced, in the units the file states, falling back to millimetres and saying so when it does not. The largest closed outline is taken as the room; where there is none, the extent of everything drawn becomes a rectangle and the import says that is a guess. An outline with more than 24 corners is simplified and says by how much, and a plan that reads as smaller than a metre or larger than the designer holds is refused rather than imported wrong. Nothing else in the file is read - furniture, text, hatching and title blocks belong to whoever drew them - and anything already placed stays where it is, which the layout checks will comment on if the new room no longer contains it.
- **Units:** **Units** at the top of Properties switches the whole designer between inches and millimetres. Geometry is stored in inches whatever it says, so switching changes what is typed and read, never the design: a 144 inch room reads 3658 mm, and typing 4000 there stores 157.48 inches. Field labels carry the unit, the plan and the dimension overlay follow it, and a drawing issue starts in the project's unit rather than asking again. Millimetres are shown whole; inches keep their eighths. Trade estimates and the machining exports keep their own units, which they already stated.
- **Dimensions:** the **Dimensions** switch under the canvas draws sizes on every item in the 2D plan, the 3D preview and the Render view, with **X**, **Y** and **Z** switched on and off separately - a plan carrying three numbers per cabinet is unreadable, and usually one axis is the question. With all three on a label reads as a product size, 24" × 24" × 34-1/2"; with fewer, each number is named, because 34-1/2" alone does not say which way it is measured. These are the item's own width, depth and height - what would be ordered - rather than the footprint it covers when turned. Beside the switch are the totals: the room, and the extent the placed items actually cover, which is rarely the same. Labels that would land on each other move apart, so a cabinet, its countertop and the wall cabinet above it each stay readable.
- **Notes and dimensions:** **Note** and **Dimension** beside Select and Pan mark the drawing itself rather than an item. Click to drop a note; drag to dimension between two points. A dimension with nothing typed shows what it measures, to the nearest eighth, and typed words replace that - so "Verify on site" reads as written. Click one on the plan to pick it up: **Delete** removes it, the arrow keys nudge it, and dragging moves it, the same as an item. Both are also listed in Properties for editing or removal, and both print on the plan sheets.
- **Soffits:** the Objects library has a soffit, 96 x 13 x 12 inches at 84 high to start, boxed in above the wall cabinets. It counts as architecture rather than furniture, so the repeat and walk-through tools treat it the way they treat beams, columns and partitions.
- **Appliances:** add, drag, rotate, and resize them like other items. The 3D view distinguishes refrigerator doors, washer glazing, dishwasher controls, and range burners. Dimensions are illustrative starting values, not certified product specifications.
- **Islands:** the Island preset is a generic freestanding unit with a countertop. To build a catalog-specific island, arrange real base cabinets away from walls and cover them with a countertop.
- **Countertops:** selecting a base cabinet before Add Countertop sizes and positions the surface to that cabinet. Edit its width/depth to cover a longer run. A standalone countertop starts at 34.5 inches elevation.
- **Sinks:** select an island or countertop, then Add Sink to center it on that surface. Matching top elevation and full containment produce a visible cutout. A separately placed sink can be resized and positioned manually. Surfaces and sinks added to a selected host form an assembly automatically. Turn off Move entire assembly for individual adjustments; support warnings identify a sink left outside its surface.

All object types support save/reload and JSON import/export. Layout checks cover object intersections, disabled attachment walls, sink support, and conservative door-swing clearance. They do not certify installation clearances or plumbing/electrical requirements.

Object QA: all nine types, resizing, door swing, wall attachment and sill elevation, island sink, countertop cutouts, save/reload, JSON export/import, and 2D/3D desktop/mobile views passed. The complete suite now contains 119 automated tests.

## Custom rooms, assemblies, and print packages

- **Room shape:** expand this section under Properties. Choose Rectangle, L shape, or U shape. Draw outline starts a new sequence of corners on a 6-inch grid; clicks create straight segments at any angle. Apply room shape closes and validates the outline. Do not repeat the first corner. You can also edit the X, Y coordinate list (4–24 corners). Self-crossing outlines are rejected; angled walls are supported. Changing room width/depth scales the outline.
- **Wall numbers:** both views and the print package use numbered wall segments. Door/window attachment lists each segment, including internal walls of L/U rooms. Cabinet snapping and boundary checks use the actual room outline.
- **Assemblies:** adding a countertop to a selected base/island or a sink to a selected surface automatically groups them. For manual grouping, select an item, expand Group into an assembly, check the members, and choose Create assembly. Moving or rotating a member carries the group. Turn off Move entire assembly to adjust one member; Ungroup separates them. Assemblies do not change source product dimensions.
- **Cabinet fronts:** selected catalog cabinets offer Auto, Single, Double, Drawers, and Glass preview styles. Auto uses a simple SKU/width heuristic. These are illustrative fronts, not manufacturer geometry or availability guarantees.
- **Print / PDF:** opens the browser print dialog. Choose Save as PDF to export a floor plan, wall elevations, numbered placement schedule, quantities, source references, and current layout warnings. These drawings support design discussion and are not approved installation documents.

Validation also covers custom outline entry/drawing, invalid outline rejection, concave-room boundary checks, internal-wall openings, assembly translation/rotation, individual adjustments, legacy saves, and PDF generation. Cloud synchronization, photorealistic manufacturer assets, live manufacturer pricing/ordering, and construction certification remain outside this demo.

### Render a design

Choose **Render** beside **3D preview** for the WebGL view. It uses the current room outline, openings, cabinet dimensions, assemblies, and finish, with lighting and shadows. Drag to orbit, right-drag to pan, and scroll to zoom (two fingers pan/zoom on touch screens). **Reset camera** fits the room; **Cutaway walls** hides walls facing away from the room interior so the layout stays visible. **Download PNG** exports the current camera view at the canvas resolution.

**Download 360 panorama** writes a 2048x1024 equirectangular PNG - the format a phone viewer, a VR headset or a web panorama player expects - so a client can look around the kitchen rather than at one framed view of it. It is taken from standing height in the most open floor of the room, not from wherever the orbit camera is parked, and falls back to the camera's own position only where nothing in the room is standable. It carries the exposure, white balance and tone curve of the view on screen. The image looks overhead as well as around, so turn **Show ceiling** on first unless an open roof is wanted; the panel says so while the ceiling is off.

Reflections come from the room itself. Every build of the scene captures it once from standing height and hands that to the reflective materials - appliance fronts, pulls, glass and stone - so a steel door shows the kitchen it stands in rather than the garden outside the windows. Metals take it at full strength, because a metal has no other source of light; polished surfaces at three quarters. Appliance fronts are brushed rather than polished, with the grain running across the panel. One limit worth knowing: the capture is a single distant probe, so a nearby object does not appear in a surface next to it - a bowl on a worktop casts no reflection in it.

Every rendered image - the live view, the PNG, the panorama and the path-traced photo - uses the Khronos PBR Neutral tone curve rather than a filmic one, so a finish renders close to the colour it is. Measured on three fronts side by side, ACES Filmic lifted a navy door towards grey-blue and took most of the warmth out of a cream one; the scene clipped 0.01% of its pixels either way, so the gentler highlight roll-off a filmic curve is chosen for had nothing to do in a kitchen lit like a kitchen.

Rendering runs locally in the browser with no API key or paid service. WebGL2 is required; the 2D plan and SVG 3D preview remain available on unsupported devices. Models and finishes are illustrative, not photorealistic manufacturer assets.


## Expanded demo: materials, architecture, detailing, and quotes

- **Architecture & materials** in Properties selects a flat ceiling or a slope along room width/depth. The main ceiling height is the near end; far-end ceiling height sets the other end. Render, wall elevations, and ceiling checks use that plane. **Show ceiling** in Render makes the plane visible.
- Wood cabinetry and flooring have locally generated grain maps. Choose quartz, marble, or granite countertops, and daylight, warm, or studio lighting. Reflections and detailed appliance fronts improve the render without a paid rendering service. These remain illustrative procedural materials and generic models.
- Objects now includes corner cabinets, fillers, trim panels, crown molding, toe kicks, columns, beams, and partition walls. Their dimensions/elevations are editable. Doors and windows attach to angled perimeter segments; door/window openings can also attach to interior partitions through Opening host.
- Select a cabinet/island/corner, then open **Detailing, clearances & price**. Set shelf/tray count, shelves/pull-outs/Lazy Susan, toe kick height, and crown molding. Corner presets offer diagonal, blind-left, or blind-right fronts. **Show interiors** in Render removes fronts to inspect storage. Corner collision checks conservatively reserve their full rectangular envelope. Catalog cabinet dimensions stay fixed.
- Non-opening objects accept arbitrary **Rotation (degrees)**. Openings inherit their wall angle. Existing quarter-turn buttons remain available. Automatic wall snapping is for axis-aligned segments; use position/rotation controls beside angled walls.
- Layout checks include front operating envelopes, appliance side/rear gaps, range overhead clearance, sloped-ceiling conflicts, oversized wall openings, and a dishwasher-to-sink service-distance reminder. Clearances are editable per item; zero disables a check. Defaults are explicitly demo assumptions, not installation manuals or code certification. Checks do not verify utility connections, ventilation, or appliance-specific combustible clearances.
- **Quote / order** lists one priced line per placement, with USD demo prices. Override any item price in its detailing panel. Add a customer reference, merchandise discount, tax, installation, and delivery. Tax applies only to discounted merchandise; this is demo arithmetic, not jurisdiction-specific tax handling.
- **Export quote** downloads JSON. **Print quote / PDF** includes the quote in the drawing package. **Create demo order** saves an immutable snapshot of the quote and configuration with this design; **Download order** exports it. No payment is collected and no supplier order is submitted. Save/export the design to back up orders; storage is local to the browser. Up to 20 orders fit within the overall 500 KB design limit.

Expanded validation: angled polygon containment and SAT object collisions; sloped wall clipping and ceiling checks; editable clearance envelopes; integer-cent quote arithmetic; invalid-price/order rejection. Browser flow covered 14 placed objects, angled window attachment, custom interiors, material/lighting changes, ceiling visibility, PNG export, quote and order export, retained order snapshots after reload, PDF output, and mobile layout without console errors.

Pricing source note: Fabuwood describes live pricing and order management through its [EZ Pricing dealer portal](https://www.fabuwood.com/become-a-dealer). This demo has no dealer-account integration or verified configured quote, so all displayed prices use the explicit demo schedule rather than claiming to be manufacturer prices.


## Presentation kitchen, advanced architecture, and shop coordination

**Load presentation kitchen** opens The Oak House: 24 objects with wood cabinetry, marble counters, a working island layout, window, range/hood, source-profile appliances, a curved perimeter, vaulted ceiling, and an interior partition doorway. It uses explicitly named custom/demo cabinets; it does not invent manufacturer catalog records. Loading is undoable and never overwrites a named saved design.

- **Curved walls & vault ridge:** set a midpoint bow per perimeter wall. Curves are quadratic Bézier spans sampled into 32 chords for geometry and DXF. Positive bow bends into the room. Out-of-bounds and intersecting outlines are rejected. Doors/windows on curved perimeter spans are not supported; move them to straight walls first. Editing base room corners resets curves. Wall numbers stay stable.
- **Architecture & materials:** choose Vaulted, set the peak height, and use Vault slope axis / Ridge position to adjust the two roof planes. Render's Show ceiling reveals the ridge; wall clipping, sections and clearance checks use its heights.
- **Opening host:** select a placed door/window and choose a partition. Offset and sill are local to the partition. Host movement, rotation and resizing update its openings. Deleting a host creates a missing-host warning; oversize openings are flagged. Partition cutouts appear in both 3D views and in the drawing supplement.
- **Installation & utilities:** source-backed profiles are currently limited to Bosch SHP65CM5N and GE GTS22KGNRWW. Selecting a profile does not silently resize an appliance; Apply model dimensions & gaps does. Record supply voltage, circuit capacity, water/drain data, ventilation, service coordinates and notes. Missing data produces unresolved checks. Verified profile gaps cannot be reduced by setting demo clearances to zero. The app compares recorded values, not actual physical wiring or pipework, and does not certify installation.
- **Drawings & fabrication exports:** Print/PDF includes setting-out coordinates, a utility schedule with source links, partition opening elevations, a ceiling section, and custom panel schedule. Installation JSON retains coordinates, configurations and recorded utility information. Layout DXF uses millimeters and separates object kinds into layers.
- **Custom cabinet panel exports:** add Custom cabinet objects, then choose carcass stock, applied-back thickness, and door/shelf gaps. CSV and panel DXF generate rectangular raw blanks with configurable butt/rabbet joints, edge-banding allowances and generic drilling templates, using full-height sides, applied backs and full-overlay slab doors. They include only explicitly defined custom cabinets. Manufacturer cabinet internals are not inferred. Drawer boxes/fronts, purchased storage hardware, hardware-specific screw patterns, decorative molding, toe-platform framing, tool compensation and CNC toolpaths remain excluded. Review the construction assumptions, material and machine requirements with the fabricator before cutting. These are shop-coordination exports, not a claim of universal fabrication readiness.

Source profiles checked September 15, 2026:
- [Bosch SHP65CM5N specification sheet, April 2025](https://media3.bosch-home.com/Documents/20595186_SHP65CM5N%20Spec%20Sheet.pdf), pp. 1–3: model/niche dimensions, electrical rating, water pressure and drain high-loop limits. The 24-inch front operating envelope is explicitly a demo assumption.
- [GE GTS22KGNRWW specifications](https://products.geappliances.com/appliance/gea-compare/%26sku%3DGTS22KGNRWW): model dimensions, air gaps, open-door dimensions and electrical rating. Lateral door-swing geometry, optional ice-maker plumbing and installation-manual details still require review.

Validation: 104 core + 15 backend tests; desktop/mobile browser flow for sample loading, host movement, opening offsets, curves, ridge changes, electrical mismatch warnings, reload persistence, PNG and PDF exports. The 13-page PDF supplement was generated. Independent DXF parsing confirmed millimeter units, 25 closed layout outlines and 88 closed custom-panel outlines in the sample export. No actual fabrication or physical installation has been validated.


## Demo workflow improvements

- **Inspector tabs:** Design contains room and object editing; Materials contains finish/render settings; Installation contains product/service checks; Documents contains drawing and manufacturing tools.
- **Presentation:** click Present for a full-window render, then Escape to return. Save up to eight named camera views per design and export PNGs at 1920 or 3840 pixels wide. Cameras persist in local saves and design JSON.
- **Placement:** drag library cards into the 2D plan. Snapping includes nearby object edges as well as walls. Moving an object displays its dimensions and coordinates. Shift-click, sweep a Shift + drag band across empty floor, or use Selection tools to select multiple objects, then move, turn, delete, align or distribute them together. Assemblies move as a unit.
- **Clear floor and work centres:** Layout checks measures the floor between runs that face each other, and the legs between sink, hob and refrigerator. The distances are project settings shown beside what was measured, with their source named; they are not a code ruling, and a passing check is not a compliance statement. A gap between two cabinets standing in the same run is a filler to order rather than an aisle, and is not reported as one.
- **Warnings:** Show clearance zones displays access/install areas in the plan. Clicking a layout warning selects its affected object. Red clearance zones indicate clearance conflicts; service warnings do not imply a geometric collision.
- **Alternatives:** Compare options saves the current design and creates a separate alternative. Compare plans and demo quote totals side by side, then reopen either option. Copied alternatives start without order snapshots.
- **Manufacturing:** Documents → Joinery, drilling & sheet nesting configures butt/rabbet joints, band thickness, generic hinge-cup and shelf-pin patterns, sheet dimensions, kerf and rotation. Manufacturing CSV distinguishes finished dimensions from raw cut dimensions in millimeters. Drilling/joint DXF contains bore circles and rabbet outlines with depth layers; nested-sheet DXF contains placement outlines. The JSON report records machining details in inches, with explicitly named millimeter parameters.
- Nesting separates materials and thicknesses, preserves part orientation unless rotation is enabled, and lists oversized parts. It is a simple packing estimate, not an optimal cutting solver. Generic drilling templates require shop/hardware review; hinge mounting screws, handle holes, drawer-slide patterns and machine toolpaths are not generated.

Validation for this update: 111 core and 15 backend tests passed, along with lint, TypeScript, benchmark artifact integrity and the production build. Automated geometry, assembly alignment, drop payload, clearance, alternative-copy, machining and nesting tests; browser checks for all four inspector tabs, saved cameras, presentation, a verified 3840-pixel PNG, library drop, live drag dimensions and placement, clearance overlays, comparison, manufacturing downloads, reload persistence and mobile layout. Independent DXF parsing verified millimeter units and 918 bore circles matching the sample manufacturing report.

## Client demo and presentation flow

- **Start here** offers a furnished sample or a room-dimension form. New users see this guide automatically; existing drafts are retained. Starting another room is undoable.
- **Materials → Coordinated styles** applies Warm oak, Soft white or Dark modern to cabinet finish, countertop pattern and lighting together. These are illustrative combinations using the existing material library, not manufacturer finish codes.
- **Compare options → Compare rendered views** shows both alternatives with linked camera position and target. Orbit either view and both match when the gesture ends. Each design retains its own materials and lighting.
- **Client presentation / PDF** lets you orbit the current design, capture up to three actual rendered views, and print a client package with a floor plan, material selections, itemized demo estimate and totals. Select Save as PDF in the browser print dialog. Captures are temporary and clear when you leave the presentation or change the design, so old images are not reused with changed specifications.
- The **Objects** library supports search, result counts and an empty-state reset. **Controls & keyboard help** explains selection, movement, pan and recovery from placement problems.
- **Reset demo** restores the polished sample, camera and editing controls, clears object search and leaves named saves intact. Undo restores the previous working design.

QA: desktop and mobile browser checks cover the guided room dimensions, object filtering, style changes, linked rendered comparison, captured client PDF, reset and undo. PDF output is a concept proposal with demo pricing, not an order or construction approval.

## Canvas and client presentation polish

- **Focus canvas** collapses both side panels; Show library and Show properties control them independently. Compare options opens with more canvas space. File management and examples live under **Project files & examples**; Open design expands that section automatically.
- In **Render**, click an object to select it and open its properties. Dragging still orbits. The selected object has an outline; edit its dimensions under Design or its finish under Materials.
- **Individual materials** lets the selected object override the kitchen finish. Countertops and island objects can also override their stone pattern. For an island made from multiple custom cabinets and a separate countertop, select each component to customize it. JSON saves retain overrides; global presets retain them too. Choose Use kitchen to remove an override.
- Library dragging shows a translucent footprint before placement, dashed edge guides, and red collision/clearance feedback. Openings preview their straight-wall attachment. Moving existing items also displays alignment guides and a conflict outline. Conflicts remain editable rather than silently blocking placement.
- **Client presentation / PDF** now includes a client name, project notes, named captures, editable captions, remove-view controls and **Preview proposal**. Individual material overrides appear in the proposal. Details and images remain temporary until you print/save the PDF.
- **Guided tour** guides five steps: sample, style, placement, comparison and proposal. Starting it loads the sample with Undo available. Use Next step when ready, or close it to continue freely.

Validation: 113 core and 15 backend tests, including preview placement parity, wall attachment and per-object material persistence. Browser QA covers render selection versus orbit, panel collapse, material overrides, drag collision preview, proposal editing/printing, walkthrough navigation and mobile layout.

## More realistic kitchen demo

- **Show this kitchen** loads the polished sample, recalls its Kitchen hero camera and opens presentation mode. Escape returns to editing; Undo restores the previous design.
- Rendering now includes beveled edges, recessed framed cabinet fronts, metal bar pulls, separate appliance models, better sink clearance in the cabinet carcass, toned-down wood grain at consistent scale, finer floor planks, stronger shadow detail and less washed-out lighting.
- **Materials → Render styling** controls brushed steel/brass/black hardware, daylight/warm/studio lighting, back-wall subway tile or matching stone backsplash, and island pendants. Backsplash styling currently covers straight north-wall base runs; window/door holes remain open. Pendants and a decorative bowl are illustrative staging placed over a wide freestanding countertop or island; they are not added to the bill of materials.
- **Select whole assembly / island** highlights all linked parts and enables moving them together. **Whole assembly finish** updates the linked cabinet parts without changing the countertop, appliances or unrelated cabinets. The sample island contains three cabinet bodies and its countertop.
- The sample includes a saved hero camera, slate island, oak perimeter cabinetry, quartz worktops and brass hardware. These are improved real-time demo visuals, not manufacturer-exact models or a photorealistic offline rendering engine.

The live benchmark was rerun successfully against the expanded working catalog after the timeout fix. It produced and stored a report without timing out. Benchmark validation still fails: reference truth is not human-verified, SKU precision is about 60.8%, rule precision is about 69.6%, and 5 of 8 cases pass. This is a successful execution check, not a catalog accuracy certification.

## Rendering, walkthrough and storage demonstration

- **High quality shadows** enables soft shadow filtering and screen-space contact shading. It is optional and works with PNG export; standard mode is less demanding. Materials now include brushed-metal detail, subtle stone relief and transmissive window glass.
- **Kitchen styling** adds stools where the room and existing objects leave space, island end panels, a small countertop arrangement and decorative outlets. These are presentation objects, not priced or installation-validated equipment.
- Backsplash runs now follow matching straight perimeter walls, including rotated cabinets and angled straight walls, and retain door/window cutouts. Curved-wall runs remain unsupported.
- **Eye-level walkthrough** uses drag-to-look, WASD/arrow keys when the canvas is focused, and on-screen movement buttons. Eye height follows the ceiling. Held keys move continuously at the selected speed, with an approximate eight-inch body radius against room boundaries, closed design objects and solid partition panels. Doorway cutouts remain passable. Decorative staging and animated fronts are excluded from navigation checks.
- **Front opening (%)** opens the selected straight cabinet's doors or drawers; with no selected object it opens all straight cabinet fronts. Custom cabinets now expose their front style under Design. Corner fronts and appliance doors remain fixed. The obstruction message uses a conservative rectangular opening envelope; it is not an exact hinge-sweep or hardware certification.
- **Presentation camera angle** offers Entrance, Island, Sink detail (or countertop detail), and Overhead. The sample includes these four saved cameras plus its hero view. Capture these views in the client presentation or download PNGs directly.
- Openness, walkthrough and rendering quality are temporary view controls. Styling and saved cameras are included in design JSON.

QA includes scene-content checks for high-quality output (not just canvas presence), 1920-pixel export, opening fronts, camera presets, keyboard and button walking, styling toggles, mobile layout, and pure tests for rotated backsplash runs, window cutouts, room-boundary walking and approximate open-front conflicts.


## Presentation polish and demo rehearsal

- Render tools are grouped under **Camera & walk**, **Lighting & scene**, **Cabinet fronts**, **Compare materials**, and **Export image**. Saved cameras have their own expandable section outside presentation mode.
- The sample island has a 15-inch rear seating overhang, two tucked-in stools, coordinated pendant positions and countertop accessories. Decorative seating is illustrative; support engineering is not specified.
- Hold WASD or arrow keys on the focused canvas for continuous movement. Choose Slow, Normal or Fast. Releasing the key or leaving the canvas stops motion. Buttons remain available for touch navigation. Entry selection searches for clear standing space in irregular rooms.
- **Open fronts / Close fronts** animates straight cabinet doors and drawers; the slider sets the desired opening. The warnings explicitly describe their approximate scope. Corner fronts and appliance doors remain fixed.
- **Compare materials** previews warm oak/quartz, soft white/quartz or dark slate/marble without moving the camera or changing the saved design. **Show original** restores the original finishes; **Apply preview materials** commits the preview through the normal undo/autosave flow. These whole-kitchen previews replace individual cabinet and countertop material overrides when applied.
- Rehearsal: Show this kitchen → compare/apply materials → inspect cabinet fronts and walkthrough → export PNG → save and create an alternative → Client presentation / PDF → capture a view → preview/print proposal → Reset demo.

Validation: 118 core tests and 16 backend tests; lint, TypeScript, benchmark artifact integrity and production build. Browser rehearsal covers the flow above on desktop and the render menus on mobile, including nonblank rendered-image checks. Rendering remains an illustrative browser-based demo, not a photographic or manufacturer-certified simulation.

## Guided setup, placement and portable presentation

- **Start here** opens a three-step room guide: measurements, door/window wall offsets, then L-shaped, U-shaped, island or empty layouts. A plan preview shows the result before creating it. Small rooms can use the empty layout; the island starter requires 168 × 168 inches. Starter layouts contain demo cabinet runs; appliances and detailed corner solutions can be added from the library.
- Click a room measurement or the selected object's measurement in **2D plan** to type width/depth directly. Catalog cabinet dimensions remain fixed. Object resizing affects that item only; room resizing preserves object positions. Review layout checks afterward. Undo reverses the edit.
- **Placement suggestions** detects 0.5–6 inch gaps between aligned cabinets and offers individual demo fillers. Selected upper cabinets can align over the nearest base cabinet with the same quarter-turn rotation. Upper cabinets also snap to nearby base edges and centers across elevations.
- **Materials → Coordinated styles** now uses large wood, linen and slate swatches with countertop and lighting labels. Existing per-object overrides remain intact.
- **Client presentation / PDF → Download presentation package** creates a ZIP after capturing at least one view. Extract it and open `presentation.html` in a browser. It includes the presentation, separate render PNGs, an SVG floor plan, a demo quote CSV and editable design JSON. The presentation works offline and can be printed to PDF. All prices remain clearly labeled demo pricing.
- The visible save indicator reports saving, saved or storage failure. Drafts restore automatically when reopening this browser. **Restore last session** returns to the design loaded at the start of the current session, with Undo available. A previous valid draft is retained as recovery data; a corrupt latest draft falls back to it. Session recovery is local to the browser and account, not cloud synchronization.

Validation: 123 core and 16 backend tests, lint, TypeScript, benchmark artifact integrity and production build passed. Desktop/mobile browser checks cover guided setup, room/object measurements, filler insertion, style changes, reload and session restoration, and package download. ZIP integrity and an offline browser opening of the extracted presentation were also verified.

## Faster kitchen assembly and audience presentation

Open **2D plan → Build your kitchen faster**:

- **Quick layout:** preview L-shaped, U-shaped or island starter cabinets, then apply. Room measurements, architecture, doors and windows remain; furniture is replaced. Candidates that intersect architecture or leave the room are skipped. Undo restores the previous arrangement.
- **Complete selected cabinets:** select floor-level straight cabinets, including multiple selections, then add flush countertops and exposed ¾-inch end panels. Cabinet detailing gets a built-in four-inch toe kick. Parts join the host assembly and inherit its finish; stone uses the room countertop choice. Existing or obstructed parts are kept/skipped, and repeating the action does not duplicate them. Individual countertop sections are a demo assembly, not a fabrication seam plan.
- **Appliance package:** add missing refrigerator, range, hood, dishwasher and sink with generic demo dimensions. The sink gets a suitable custom sink cabinet and top where needed. Placement finds open floor positions while keeping existing furniture. Adjust positions and check utility/clearance requirements afterward. If the complete package cannot fit, the design is unchanged.
- **Corner options:** compare diagonal, blind-left and blind-right diagrams, choose a room corner, and place a rotated cabinet. The full 36 × 36-inch footprint must be clear. These are illustrative configurations, not manufacturer-specific corner or hinge calculations.

**Compare options → Before / after** compares your current design with a separate browser-saved snapshot. Starting a room or sample sets its initial snapshot. **Use current design as before** replaces it deliberately. Edits and undo do not modify it. Enable rendered comparison for matching cameras; switching a camera angle or orbiting a view updates both. **Saved alternatives** retains the existing named-design comparison workflow.

**Present** and **Show this kitchen** open an audience welcome screen. **Begin kitchen tour** steps through saved viewpoints (or built-in viewpoints when none are saved). Use Previous/Next, the saved-viewpoint selector, or **Explore freely**. Escape exits presentation. The mobile welcome title wraps, and render editing controls are hidden while the welcome or tour is shown.

Validation: 127 core and 16 backend tests, lint, TypeScript, benchmark artifact integrity and production build. Browser checks cover layout replacement, run completion, appliance insertion, corner placement, snapshot persistence after reload, nonblank linked comparison renders, tour navigation and mobile layout. All additions remain within the demo scope.

## Complete studio demo: examples, editing and presentation

**Choose a sample kitchen** opens three rendered previews:

- **Small apartment:** a compact light L-shaped kitchen with appliances, a sink, upper storage and under-cabinet lighting.
- **Family kitchen:** oak perimeter cabinets, contrasting island seating, pendants and a vaulted room.
- **Premium kitchen:** dark cabinetry, tall pantry storage, marble waterfall ends and warm lighting.

Each example includes four saved viewpoints, two finish alternatives, an illustrative estimate and a three-minute demonstration outline. Unchanged examples automatically load their prepared overview in **Client presentation / PDF**, so a ZIP presentation can be downloaded immediately. After design changes, capture a new render; prepared images are deliberately not reused for changed designs. Gallery PNGs are generated from the actual editable scenes.

Editing and review:

- Select a custom cabinet or countertop in **2D plan** and drag its teal corner handle. The opposite local corner stays fixed, including for rotated objects. Width/depth update live. Press Enter on the handle for numeric entry. Catalog dimensions remain fixed.
- **Objects & design notes** searches names, types and notes. Hide removes an object from plan/preview/render/elevation displays; it remains in pricing and physical checks. Lock protects movement, resizing and deletion, including changes through other controls. Unlock to edit its geometry. Notes appear as plan markers and readiness reminders.
- **Existing room photo** in Properties accepts JPEG, PNG or WebP up to 5 MB. A resized reference is stored locally for that browser/account/design. It is not uploaded or included in presentation packages. The photo is visible beside the design when the Properties panel is open.
- **Wall elevations** provides straight-on dimensioned views for straight walls, with SVG downloads. It shows visible objects within 36 inches of the selected wall. Use the existing installation documents for construction and complex roof geometry.
- **Countertops & island options** connects adjoining straight sections with matching depth, elevation and thickness, retaining sink cutouts. Linked countertop overhangs can be set relative to base cabinet footprints. Island seating side, waterfall ends and storage front configuration are editable. Waterfall ends and stools are illustrative, not structural/support or seating-clearance validation.
- **Materials** includes pendant dimming, under-cabinet lights, decorative outlet visibility, faucet finishes, handle styles and backsplash choices. Use daylight and warm lighting to compare day/evening appearance.
- **Compare options → Budget comparison** separates cabinet, countertop, appliance and other changes. Demo allowances use +8% for oak and +12% for slate cabinetry, and $65/$75/$85 per square foot for quartz/granite/marble tops. Waterfall ends add a stone-area allowance. Explicit item prices override these defaults. These are not manufacturer prices; lighting and decorative accessories are not independently priced unless included in an explicit item price.
- **Demo readiness** lists missing appliances, missing countertop coverage, pinned notes and existing layout/installation flags. It helps prepare a demonstration and does not certify installation readiness.

Validation: 134 core and 16 backend tests, lint, TypeScript, benchmark artifact integrity and production build pass. Browser checks cover all three prepared downloads and offline presentations, photo persistence, object search/hide/lock/notes, drag resizing, island overhang/seating/waterfall/storage, lighting and accessories, elevation SVG export, budget snapshots, material alternatives, stale-render invalidation and mobile gallery layout.

## Object styles and surface finishes

In **Objects**, use the option selector above Add (or drag the card) to choose:

- Refrigerators: single door, two side-by-side doors, French doors with a freezer drawer, or top freezer.
- Doors: 24, 28, 30, 32, 36 or 42 inches wide, at 80 inches high.
- Windows: 24 × 36, 36 × 36, 48 × 48, 60 × 42 or 72 × 48 inches.
- Sinks: single bowl, double bowl, white farmhouse apron, or compact prep bowl.
- Islands: 48 × 30, 72 × 36 or 96 × 42 inches to start. Edit width/depth/height numerically or drag the plan corner for width/depth; use the existing island controls for seating side, waterfall ends and storage.

Select a placed object and use **Size / style preset** to switch its variant. Custom dimensions remain available. Sink style changes preserve the rim height. The plan distinguishes double basins and refrigerator door divisions; Render shows appliance doors/handles, basin dividers, drains and farmhouse ceramic fronts.

**Materials → Flooring** offers light oak, walnut, porcelain tile and slate. Backsplash choices are none, subway, matching slab, sage mosaic and sand stacked tile. These procedural finishes render locally. Floor and backsplash supply/installation are excluded from the demo estimate. Refrigerator and sink variants carry explicit demo allowances; island allowances scale with footprint. Existing saved designs retain their previous defaults.

Validation: 138 core and 16 backend tests, lint, TypeScript, benchmark artifact integrity and production build pass. Playwright checks cover refrigerator style changes, door/window preset placement, custom island width, double/farmhouse/prep sinks, visible floor/backsplash render changes, persistence after reload and mobile layout without console errors. Opening placement now searches every enabled straight wall, and sink preset changes leave linked cabinetry in place.

Upper-cabinet door pulls and knobs sit near the bottom edge in Render; the 3D preview uses the same lower placement. This applies to catalog wall cabinets and elevated custom upper cabinets. Refreshed sample gallery/presentation images include this correction.

## Guided editing and review refinements

- Moves, rotations and drops reject new cabinet/appliance overlaps and placements outside the room; nearby cabinet edges snap together. Existing layout issues remain visible for correction.
- The toolbar above the canvas keeps the selected object's dimensions, finish, rotation, hinge and lock together. **Finish selected run** adds exposed side panels, countertops and toe kicks; **Join selected seams** merges compatible adjoining selected countertop sections.
- **Fit sink to surface** supports drop-in rims, undermount basins and farmhouse apron fronts. Choose the surface and horizontal offset, then Fit sink. Fitting respects rotated surfaces, checks room for the basin, preserves linked cabinet positions and creates the appropriate countertop opening. Apron fitting lowers host cabinet fronts below the basin. This is illustrative cabinetry, not fabrication-ready sink engineering.
- **Individual overhangs & seating** provides front/back/left/right values in the object's local orientation. Linked tops resize relative to their base cabinets and fitted sinks follow their surface. Standalone islands extend their rendered top while retaining the cabinet body. Dashed plan rectangles indicate 24-inch seating bays; the 12-inch knee-space suggestion is a demo guide.
- **Materials → Material palette** provides clickable cabinet, flooring, countertop and backsplash swatches. The renderer adds recessed appliance fronts and toe ventilation detail. Island top extensions add a demo stone-area allowance.
- **Compare options → Full-screen comparison** shows both rendered designs with linked cameras; Escape exits. Tours include sink/worktop and upper-cabinet close-ups. Viewpoint changes ease over 700 ms; reduced-motion preferences switch immediately. Direct camera interaction cancels the transition.

**Show this kitchen** presents the current design without replacing it. Use **Reset demo** or the sample gallery to load a different kitchen.

Validation: 144 core and 16 backend tests, lint, TypeScript, benchmark artifact integrity and production build pass. Browser rehearsal covers collision rejection, quick edit/lock controls, sink mounts, individual overhangs, material swatches, linked full-screen comparison, close-up tours, current-design preservation, reload persistence and mobile layout. The three sample images were regenerated from the updated renderer.

## Demo walkthrough, wall runs and presentation covers

- A fresh browser opens **Choose a sample kitchen** and the five-step **Demo walkthrough**. The walkthrough guides sample selection, a material change, object placement, before/after comparison and presentation export, with a suggested three-minute script. Reopening it preserves the current design until you choose another sample.
- While dragging in the plan, green means ready, amber means review a layout warning, and red means the move is blocked. An explanation appears before release; invalid cabinet/appliance moves remain rejected.
- **Build your kitchen faster → Fill a wall with cabinets** previews 9–36 inch base cabinets along a selected straight wall, reserving exterior door/window widths and avoiding existing objects. Optional countertops, toe kicks and exposed end panels are added where space permits. Apply is undoable and respects the 100-object demo limit.
- **Render → Compare daytime, evening & task lighting** shows three actual rendered previews with a shared camera. These comparisons do not change the saved lighting settings.
- **Client presentation / PDF** supports a project title, client name, description and uploaded PNG/JPEG/WebP logo. Cover details save locally per user and design. The downloaded ZIP includes an offline presentation with embedded imagery, a separate logo PNG, floor plan, demo quote and editable design. Capture an updated view after editing the kitchen.

Validation: 148 core and 16 backend tests, lint, TypeScript, benchmark integrity and production build. Browser rehearsal covers fresh-start walkthrough, material editing, wall-run preview/apply/Undo, blocked drag feedback, three distinct lighting previews without design mutation, branded export, cover persistence and mobile layout. The downloaded presentation was also opened offline with its logo and render intact.

## Direct editing, showroom and design recovery

- In **Render**, click a cabinet, countertop (including an island top), floor or backsplash to open its finish controls. Cabinet/worktop changes apply to the clicked object; floor and backsplash choices apply to the room. Other objects remain selectable for the inspector.
- **Open doors & drawers** animates the selected cabinet or refrigerator, or all supported fronts when nothing is selected. Refrigerators support single-door, side-by-side, French-door/freezer-drawer and top-freezer configurations, with visible shelves. Existing cabinet drawer/interior controls remain available. Opening warnings include refrigerator reach; checks are approximate against closed design objects, not a full moving-door sweep or manufacturer certification.
- **Smart placement** aligns a selected upper cabinet above a base, centers a sink beneath a matching window when a compatible worktop fits, or aligns an appliance's front with a nearby base cabinet. Linked parts follow, locked geometry is protected, and new overlaps/out-of-room placements are rejected. Undo reverses an alignment.
- **Best kitchen view** frames the occupied layout from the cabinet fronts and enables wall cutaway with the ceiling hidden. **Worktop close-up** selects a detail view. Manual orbit, pan and saved cameras remain available.
- **Open showroom** provides a large rendered view, finish swatches and a before/current toggle. The before view is read-only; finish choices update the current design. Escape returns to the editor. This is intended for presenting the demo, with editing controls hidden.
- **Design recovery & history** saves up to 12 named checkpoints locally per user/design, lists recent session history, and restores complete designs including locked geometry. Restoration itself can be undone. Named checkpoints survive reload; ordinary Undo history is session-only.

Validation: 152 core and 16 backend tests, lint, TypeScript, benchmark artifact integrity and production build pass. Browser checks cover ray-picked cabinet/worktop/floor/backsplash editing, showroom finishes and before/after, checkpoint reload/restore/Undo, smart upper alignment, refrigerator opening, composition after changing walls/ceiling, and mobile showroom rendering. Playwright was used because the Browser plugin was not available.

## Cloud projects, client reviews, layout alternatives and supplier quotes

These additions extend the earlier local-only demo scope:

- **Cloud projects & client reviews:** choose **Save to cloud** once to connect a design to your signed-in account. Subsequent edits autosave after a short pause. Open cloud projects on another device using the same account. Local draft/export remain available. Conflicting edits pause cloud saving; **Reload cloud version** opens the current cloud design, while **Save separate cloud copy** preserves an alternative. Each account supports 50 cloud projects of up to 6 MB each (400 objects per design), with the latest 20 prior revisions available in **Cloud backup history**. Restore saves a new revision.
- **Client review:** create a seven-day link after saving. It captures an immutable revision with plan, 3D preview, item dimensions and layout warnings. A recipient can comment or explicitly approve that revision without signing in. Entered names are self-reported; approval is a design review record. Owner feedback remains available after link revocation. Expiry invalidates open subscriptions. Links created on localhost require a hosted/reachable app address before external clients can use them; this change does not publish the frontend. No links or messages are sent automatically.
- **Alternative layouts:** generate up to three distinct, feasible arrangements of existing cabinets. Locked items, appliances, openings and assemblies containing sinks remain fixed. Whole assemblies move together, including worktop overhangs; sizes, quantities and catalog source links stay intact. A constrained room may yield fewer alternatives or explain why none fit. Preview/apply supports Undo. These are deterministic geometry proposals, not installation certification.
- **Supplier quotes:** download a JSON price request containing SKU, finish, dimensions and configuration; obtain supplier prices and fill the supplier name, source reference, USD currency and validity date. Import the completed list to your account. Exact matching avoids reusing a price after size, finish or configuration changes. Missing or expired prices block a final total and export. Installation/delivery are designer-entered charges; tax applies to discounted items. Quotes export as JSON with source and price-book revision. The existing illustrative demo quote remains separate. No real price list has been supplied or fabricated.
- **Readiness:** the new navigation page lists paginated products requiring source review, exports the loaded source-question set (marked partial until all pages are loaded), and records manufacturer evidence against the current record revision. Pending evidence appears in the existing source-review editor. Human corrections, source approval, independent benchmark and publication checks remain required. Evidence submission does not mutate facts or grant approval.

The previously recorded 145 products with unresolved fields and human benchmark sign-off remain dependent on authoritative manufacturer answers and reviewers. This implementation adds the evidence workflow; it does not declare the catalog production-ready.

Validation for these additions: lint, TypeScript, 156 core tests, 21 backend tests, benchmark artifact integrity and production build pass. Playwright used the isolated QA account at `http://localhost:3000` (Browser plugin unavailable), with desktop and 390-pixel mobile checks. Verified cloud save/autosave, second-browser open, conflict preservation/reload, backup restoration, alternative generation/apply/Undo, supplier request/import/quote export, unsigned client comments and explicit revision approval, live revocation, readiness submissions/source-review display, and responsive layout. Backend tests additionally cover scheduled expiry and account isolation. Supplier and manufacturer evidence used for QA was explicitly synthetic and did not approve catalog facts.


## Spreadsheet prices, branded quotes, and measured rooms

- **Import supplier CSV / Excel:** select a CSV or `.xlsx` file under 400 KB with headers in its first row. Choose the worksheet, map columns, enter the supplier, source reference and expiry, and choose inches, centimetres or millimetres for dimensions. Review the preview before saving. Prices must be USD; omitted configurations use “standard” and still must match the design exactly. Excel workbooks support up to 10 sheets, 1,000 price rows and 64 columns per sheet.
- **Branded quote / PDF:** enter company/contact details, client name, quote number, terms and an optional PNG/JPEG logo. Open the quote and use **Print / save PDF**. Matching lines are grouped with quantities. Export requires complete, current supplier prices; the quote expiry cannot exceed the supplier price expiry. Branding saves with the design.
- **Guided room measurements:** record all four walls and ceiling height in inches, centimetres or millimetres, then add doors/windows and utility locations. Review the plan and confirm the measurements before creating a new measured design; Undo restores the previous kitchen. Opposite walls differing by more than half an inch require rechecking or a custom outline. The survey and utility positions persist with the design and can be exported as a measurement record.

Validation on 2026-09-15: lint, TypeScript, 160 core tests, 24 backend tests, benchmark artifact integrity and the production build passed. This continuation has not repeated browser interaction checks for these three workflows.

## Measurement surveys and supplier documents

- **Guided room measurements** records rectangular wall dimensions, doors/windows, and utility locations in inches, centimeters, or millimeters. Opposite walls must agree within half an inch. Creating the room starts a new design and supports Undo; the original survey remains attached when the layout changes. Export the measurement record as JSON. Revisiting a survey step or editing final notes clears confirmation so the updated survey must be checked again.
- **Supplier quotes → Import supplier CSV / Excel** accepts CSV or XLSX spreadsheets with header mapping, dimension-unit conversion, source details, expiry, and a preview before saving. Prices remain subject to exact configuration matching.
- **Branded quote / PDF** adds company details, client name, logo, quote number, expiry, and terms to a printable supplier quote. Use the browser's Print / save PDF command. Missing or expired supplier prices block export; quote expiry cannot exceed the price-list expiry.

Validation on September 15, 2026: lint, TypeScript, 160 core tests, 24 backend tests, benchmark artifact integrity, and production build pass. These automated checks do not establish manufacturer accuracy or human catalog approval.

Browser follow-up: Playwright Chromium at `http://localhost:3000/designer` reached the sign-in form without captured console errors, but the isolated QA session did not advance into the designer. The new survey confirmation reset and spreadsheet preview remain unverified in-browser in this run. The local development server was restarted after it stopped responding. Browser plugin unavailable; existing local Playwright and browser libraries were used.

## Design decisions: checks, budget, proposals, storage and site handoff

Open **Design decisions · budget, checks & site handoff** below Supplier quotes.

- **Explain checks** describes the basis and next action for each geometry/installation warning, locates affected items, and links selected appliance profiles to their recorded sources. Catalog cabinets show source revisions, review status, human verification, blockers and dimensional mismatches, with links to the source-review screen. Source records load when the panel opens; use **Refresh source evidence** after review changes. Calculated geometry checks do not confer manufacturer approval.
- **Budget & proposals** compares exact supplier-priced variants. Set a total USD budget, preserve drawer/pull-out storage, and protect individual items. Appliances, islands, locked cabinets and cabinets in locked assemblies stay fixed. Same-SKU finishes/configurations must have matching supplier prices. Alternate SKUs require loaded, human-verified, approved catalog records with no blockers and matching catalog version, category and dimensions. Load catalog pages to broaden substitutions. The tool reports an unreachable target instead of inventing prices or removing inventory.
- **Good / better / best** compares lowest-price, current-design and storage-priority alternatives. Duplicate or infeasible tiers are omitted, so constrained projects may have fewer than three. Each card includes total, storage indicators and changes. **Download client comparison / PDF** produces a standalone HTML document with plans, item prices and totals; open it and print/save as PDF. JSON comparison export is also available. Apply a proposal before issuing its branded quote or creating a client review link.
- **Preview a change** stages an item position, rotation or illustrative front change. Assembly members follow. Current/proposed plans highlight affected items, including linked worktops; the preview shows changed items, new/resolved checks and quote differences or missing prices. Invalid placements and locked geometry cannot be applied. Apply supports Undo. Existing client approvals remain bound to their original snapshots; create a new review link for the revised design.
- **Storage planning** records household size, cookware volume, pantry habits, reach and storage priority. Suggestions explain the planning assumptions and identify relevant cabinets. Indicators use drawer/pull-out units and cabinet frontage, not measured internal capacity. Fronts are illustrative; physical availability and usable capacity need supplier confirmation.
- **Installer handoff** records up to 20 wall-specific questions with status, assignee, notes and up to four compressed photos. Export a handoff and open `/installer` on a phone or desktop without signing in. The installer imports the file, records findings, and downloads a site report to return. Import into the designer compares original, current and returned findings. Choose which version to keep for each change; changed geometry requires checking and confirming wall locations. Merging preserves current geometry. Installer edits remain in the tab until exported. Photos are compact JPEG previews rather than full-resolution site records.

Storage preferences, site tasks and client selection boards persist in local drafts, saved designs and JSON exports. The updated shared design schema was deployed to the configured development backend on 2026-09-15. Cloud saves read back these fields and pause with the local draft retained if an older backend drops them. The development backend deployment is approved and complete; no public frontend deployment or client communication was performed.

Validation: lint, TypeScript, 170 core tests, 25 backend tests, benchmark integrity and production build pass. Playwright Chromium at `http://localhost:3000`, desktop 1440 × 1000 and mobile 390 × 844, verified three priced tiers, budget success, client HTML comparison, preview/apply/Undo, linked worktops, invalid-placement blocking, household preferences, mobile anonymous handoff, wall photos, resolved site-report import, conflict rejection and reload persistence. Catalog source status, source-review links, evidence refresh and candidate pagination were also verified against the QA account’s existing catalog. Tests used the isolated QA account and explicitly synthetic prices. Browser plugin was unavailable; existing local Playwright libraries and fonts were used. Cloud field round-trip is covered by the local Convex test harness; the development backend is now deployed; see the live sharing validation below.

## Guided project flow, readiness and client decisions

- **From measurement to installation** at the top of the designer connects Measure → Design → Check → Price → Present → Install. Each stage shows its outstanding checks and opens the relevant tools. Present also opens the client selection board directly. Stages are navigable while work remains incomplete.
- **Project readiness checklist** derives its status from the current design: a confirmed survey matching the room/openings, placed items, layout/installation warnings, manufacturer source verification, current supplier prices, the captured client-approved revision and unresolved site findings. Generic fabricated products remain unverified. Refresh readiness after source review or price changes. Checklist completion describes recorded work, not installation certification.
- **Visual revision history** records named milestones with a required reason, plans, item/material differences and current-price comparisons. Complete quotes capture their amount, supplier, source and list revision. The current quote can be compared with that captured total; repricing both designs with the current list is labeled separately. Up to eight milestones are stored per signed-in account/project in this browser. Export the history for backup and import it into the same project; imported approval claims do not count as verified approval.
- **Capture client-approved revision** accepts an active review link only when its server-side activity includes an approval for the same design. It stores the exact reviewed snapshot with names and revision, so later layout or finish changes appear in history and readiness. Names remain self-reported. The original supplier quote total is not present in review snapshots and is not invented. Captured history remains a historical record even if a link later expires.
- **Client selections** under Design decisions supports up to eight named cabinetry/countertop/flooring/hardware combinations with visual previews, favorites and reasons. Export a board; clients can open it at `/selections` without signing in and return a preference file. Import verifies that the combination definitions still match. Preferences do not change the layout. Applying a look opens the existing change preview, supports Undo and reevaluates supplier-price coverage. Clients should compare physical samples; these finishes are illustrative.
- **Installer report reconciliation** now compares the original handoff, current site notes and returned findings. For each change, keep current, use the returned finding/deletion, or retain both as separate questions. If the room/items changed, compare both plans, assign incoming findings to current walls, and confirm those locations. Mid-review changes require refreshing the comparison. Merging changes only site findings, preserving current geometry.

The new selection board is included in the shared design schema and cloud readback checks. The shared schema is deployed to the development backend; cloud readback checks still pause saves if expected fields are not preserved. Visual milestone history is local to the browser and backed up through its own export.

See [the pilot worksheet](pilot.md) for a real-project pilot worksheet and acceptance criteria. The implementation walkthrough used a synthetic room survey and supplier prices, with real review/approval activity only in the isolated QA account. No real room or actual supplier list was provided for a field pilot.

Validation for the guided workflow: lint, TypeScript, 178 core tests, 25 backend tests, benchmark integrity and production build pass. Playwright Chromium at `http://localhost:3000`, desktop 1440 × 1000 and mobile 390 × 844, verified stage navigation, captured milestone prices, live QA approval capture, changes-since-approval readiness, visual diffs, unsigned client favorites/reasons and return-file import, material preview/apply, per-finding installer conflicts with wall remapping, and reload persistence. Page identity, meaningful content, framework-overlay absence, console health and responsive layout passed. Browser plugin was unavailable; the existing local Playwright setup was used. A mobile checkbox overflow was reproduced, fixed and retested.

## Ordering and delivery workspace

Open **Orders, changes & deliveries** in the designer:

1. In **Change orders**, paste an active client review link and verify the current design as the approved baseline. The link must contain an approval for this exact project and physical design. Names are self-reported.
2. Edit the design, enter the reason, and record a change order. Before/after plans, product specifications and price differences use immutable snapshots and the captured supplier list. Missing or expired prices suppress totals. Use a new client review link to verify approval of the revised snapshot. An approved change can become the next baseline.
3. In **Purchase drafts**, enter a purchase number and supplier instructions. Create a snapshot and export a printable HTML draft (open it and use Print / save PDF), or JSON. Identical SKU, material, configuration and dimensions are grouped into quantities. Room door/window openings are excluded. Purchase documents show the product subtotal; customer discounts, installation, supplier shipping and supplier taxes are excluded. Drafts show unresolved layout/site/price/approval checks and are never submitted automatically. Confirm manufacturer specifications, availability and commercial terms with the supplier.
4. In **Deliveries**, choose a purchase draft and mark each physical item pending, received, missing or damaged. Add notes and up to four compact JPEG photos per draft. The original item snapshot is retained when the current design changes. Export a delivery report or the complete purchasing backup.

Purchasing records live in this browser under the account and design ID, separate from design JSON/cloud sync. Export **purchasing-backup.json** for backup; importing replaces the project's purchasing records and removes approval claims until verified again through active review links. Limits: ten changes, ten drafts, 3.5 MB total. Concurrent edits from another browser tab are rejected until the panel is reopened. Captured design approval is historical evidence, not approval of supplier prices or a continuously checked review-link status.

### Project organization and first use

The cloud-project panel includes a directory for the latest 50 account projects. Search name, client, room, tags, workflow status and indexed SKU. **Refresh SKU search index** reads the current cloud snapshots; refresh after cloud edits to update SKU results. Archive/restore changes visibility without deleting cloud data. Organization metadata and archive choices are browser-local and have a separate export/import backup. Workflow labels are user-entered labels, not verified approvals.

The three-step getting-started guide opens the sample walkthrough, room measurements and ordering workspace. It distinguishes illustrative sample data from confirmed surveys and supplier offers, suggests the next project action, and remembers completion in this browser. Reopen it with **Show getting-started guide**.

## Project overview, complete backups and installation completion

The **Project overview** combines captured approvals, open site/layout questions, supplier confirmation gaps, delivery shortages and installation closeout. Its next-action button opens the relevant tools. Counts include every saved purchase draft; they are not a claim that an order has been placed. Supplier quantities count as confirmed once a reference and confirmation date are recorded. Overdue lines use the expected delivery date and outstanding item receipts. Proposed or accepted substitutions remain flagged for a revised design review.

### Complete backup and restore

**Complete project backup → Export complete project** downloads one validated JSON file containing the current design (including selections and site photos), local milestone history, purchasing snapshots, supplier confirmations, closeout and photos, organization, and a supplier price reference. It does not fetch cloud-only historical revisions or embed catalog PDFs. Maximum file size is 6 MB; available browser storage can be smaller.

Import validates before presenting a contents summary. **Restore as separate project** assigns a new design ID, remaps project snapshots, keeps original records, clears cloud binding, and rolls back local writes if storage fails. Imported approval/completion claims are removed; an imported approved baseline is retained as an unverified design reference. Organization is restored as an active draft and transfers to the cloud-project directory when that copy is saved. Export the bundled supplier list and import it in Supplier quotes to use it for new pricing. Restored copies do not inherit remote review links.

### Supplier confirmations

Inside a purchase draft, open **Supplier confirmations & lead times**. Record the supplier reference, contact, confirmation date, exact confirmed quantities, lead days, delivery dates, proposed substitute SKU, project-team decision, and line notes. Confirmed quantities cannot exceed the immutable draft quantity. An accepted substitution does not edit the design or represent client approval. Confirmation details appear in purchase JSON, printable purchase drafts and complete backups.

### Installation closeout and customer handover

Open **Installation closeout & handover** to start a five-item checklist, then add room-specific checklist items or punch-list findings. Record assignments, notes, statuses, and up to eight compact photos (60 tasks total). Add customer care, warranty and contact notes. All tasks must be done before recording completion under a self-reported name. Changes to the design, findings or care notes invalidate that completion. Export a printable customer handover with the item schedule and evidence; incomplete or changed projects are labelled DRAFT.

### Offline field mode

1. Download a **field package** from the project overview.
2. Open `/field/index.html` online and import it. Wait for **Ready offline**; the scoped service worker caches only the public field page assets, not account pages or cloud responses.
3. Up to three downloaded projects can remain on the device. Reopen the field page offline to view the item schedule, edit closeout checks, add room findings and attach compact photos. Changes save to local browser storage. Export before clearing browser data or removing a device copy.
4. Export a **field return report**. The page explicitly says that exporting has not yet transferred findings to the main project.
5. In the main project, import the report under **Offline field workspace**. It validates project identity, unchanged design and unchanged closeout baseline before applying findings. A stale report is rejected; export a current package and reconcile the findings. Completion must be recorded again after transfer.

Field reports transfer closeout data only; they do not edit design geometry or synchronize automatically to Convex. No network connection is required to export a report. Offline readiness depends on a successful initial visit, service-worker support, storage availability and retention. The installable manifest is provided, but OS-specific installation prompts have not been validated.

### Accessibility improvements

Designer skip links focus the overview, canvas or item controls. Tab lists support arrow keys plus Home/End with a single tab stop for the selected tab. Controls have visible focus outlines, larger touch targets, and reduced-motion styling. Dashboard text wraps at desktop and mobile widths. This is targeted accessibility work, not a full WCAG conformance audit.

## Product checks, reusable assemblies and aftercare

- **Manufacturer compatibility checks:** choose a cabinet and exact component SKU. Add documented rules with dimension ranges, optional finish/configuration constraints, source reference and revision. Record who checked the source before using the result. Missing or unreviewed rules remain unverified; matching rules cover only their recorded constraints. Import/export rule files; imported reviews must be repeated. No manufacturer catalog is bundled.
- **Installation tolerance checks:** select a run, record its measured start/span, uncertainty per end, wall unevenness and filler allowances. The result compares the projected item extent along a straight wall; overlapping countertops do not double-count width. A changed room or curved wall requires a new assessment. Depth, anchoring and actual site conditions still need separate checks.
- **Replacement comparisons:** inside a supplier confirmation, open **Compare replacement specifications**. Record proposed dimensions, finish, configuration, price and source. Compare plans, dimensional warnings, affected neighbors and product-price difference, then export the comparison. The purchase snapshot and design remain intact; update and review the actual design separately before accepting a changed installation.
- **Reusable assembly library:** select items and save a named template. Linked assembly peers and sink hosts are included. Preview placement in another project; boundary, overlap, ceiling and sink conflicts block applying it. Placement gives items fresh IDs, clears site service coordinates and supports Undo. Templates are shared within this browser/account; used templates also travel in complete project backups. Export the library separately to transfer all templates.
- **QR delivery labels:** select a purchase draft, enter a reachable app address and export printable labels. Print at 100%. Each label opens its exact project/order/item record in the field page. Export the matching field package and import it on each device while online; wait for Ready offline. QR records show the original ordered location and downloaded delivery status, not live updates. A localhost address works only on the device running the app. Wrong or missing packages never substitute a different item.
- **Aftercare, warranties & service visits:** record supplied warranty dates/terms, serials, contacts and replacement parts. Track assigned service requests, visit dates, status, notes and up to eight compact photos. Unresolved cases appear in Project overview. Export aftercare records or the complete project backup. Warranty dates describe entered records, not a determination of supplier coverage.

Product support records are browser-local and limited to 1 MB per project (100 rules, 20 measured runs, 100 warranties, 60 service cases, 20 attached assemblies). They are included in complete backups and restored under the new project ID; imported source-review claims are cleared. Shared assembly libraries allow 20 templates of up to 40 items. Field packages are capped at 2.3 MB; use **Export field package for these labels** for a single purchase if the full package is too large. These tools do not send supplier orders or synchronize support records to the cloud.

## Guided workflow, catalog changes and project operations

**Project workspace** provides Measure → Design → Approve → Order → Install → Aftercare navigation. Stage buttons show outstanding recorded checks and open the relevant tools, including nested panels. Design counts include saved catalog impacts; installation counts include unfinished tasks and completed tasks whose prerequisites now require rechecking. Counts do not establish manufacturer or installation certification.

### Catalog update impact

Download the snapshot template and prepare two source-backed JSON snapshots with the same `catalogKey` (manufacturer/series), their actual source revisions and references, and unique SKUs. Set the earlier `versionId` to the catalog version referenced by the design items. Each product records width, depth, height and a compatibility statement or rule revision. `complete: false` means an omitted SKU is unknown, not discontinued. Each snapshot is limited to 600 KB and 2,000 SKUs.

Import the earlier and updated snapshots, then save the comparison. It shows changed dimensions/compatibility, earlier and updated values, affected project/item identities, and a Locate button for the current design. **Scan saved cloud projects** includes up to the latest 50 account projects plus the current unsaved design; repeat the scan after cloud edits. The export records scan scope and source references. No catalog, design, rule, or approval is automatically changed. Imported specifications still require human source verification.

### Suggested layout fixes

Choose an overlap or outside-room warning and click **Find a suggested move**. A bounded search proposes a nearby translation, preserving dimensions, linked assemblies, and recorded utility positions. Locked objects, openings, columns, beams and partitions are not moved. A proposal must resolve the selected warning without introducing any new modeled warning. Unsupported or unsolved cases direct users to manual editing. Review both plans, then Apply; Undo restores the original. Design changes invalidate an outstanding preview. Recheck installer requirements and obtain revised design approval after changing the layout.

### Installation sequence

Add a named task with assignee, planned date, required delivered items, required site resolutions and earlier tasks. Missing, pending or damaged deliveries block completion. A prerequisite task must be completed with its own prerequisites satisfied; changing a delivery back to damaged flags completed work for recheck and blocks downstream work. The task shows the latest recorded expected delivery among selected items and whether the planned date is overdue. Dates do not imply an automatic scheduling promise. Remove dependent tasks first before removing their prerequisite. Export the sequence with its calculated readiness.

### Pilot outcomes

Name a pilot and label it Synthetic rehearsal or Real project observations. Record dated stage observations, work minutes excluding rework, separate rework minutes, quote revision counts, installation issue counts and feedback. Totals compare with an optional manually entered baseline; positive differences mean fewer minutes than that baseline. This is observational tracking, not a causal savings claim or human catalog verification. Export outcomes, or include them in the complete project backup. Limits: 200 observations and 60 installation tasks per project.

### Shared project records

The shared-records backend was deployed to `quick-anaconda-510.convex.cloud` with approval on 2026-09-15. Live owner/viewer/editor checks passed using synthetic records and separate browser sessions. To use it:

1. Export a local backup, then **Create shared project** to publish a complete snapshot. Up to 20 shared projects per owner, 6 MB UTF-8 per snapshot. Records are split into bounded database documents and committed atomically.
2. A teammate provides their account ID, shown in their shared-records panel. The owner grants Viewer or Editor access. Viewers can read/export; editors can publish; only the owner manages membership. No invitation message is sent.
3. On another device, **Refresh shared projects → Review shared revision → Load shared revision locally**. Review the target project before replacing its local records. Source-review, client-approval and completion claims are cleared on transfer and need re-verification. Shared supplier prices remain a reference; import/select an account supplier list for new quotes.
4. Edit locally, then **Publish local records**. Publishing requires the revision that was loaded. A stale save is rejected; export local work, load the new revision, reconcile, and publish again. Refreshing the list does not change the editing revision. Transfers are explicit; local work is never silently overwritten.
5. The owner can change or revoke member access. Revocation blocks subsequent server access but cannot recall copies already downloaded.

Shared snapshots include the design and project side records; they are separate from existing owner-only cloud design saves and review links. Shared loads refresh local purchasing/history panels. Shared membership and revision bindings are not included in portable backups. Project operations use a browser-local record capped at 1.5 MB, included in complete backups and remapped when restoring a separate copy. Export before clearing browser storage.

### Live sharing validation and expected errors

Live browser QA verified viewer restrictions, editor publishing, stale-save rejection without local overwrite, owner/editor record transfer, purchasing-panel refresh, mobile reload persistence and membership revocation. The teammate test account's access was revoked after testing. The production-mode frontend was tested locally at `http://localhost:3002` against the approved development backend. No public frontend was deployed.

The deployed backend rejects unauthorized and stale writes correctly. Its expected mutation rejections are logged as server errors by the Convex client, which can trigger Next.js's development overlay. A tested follow-up changes these expected publishing rejections to structured responses shown inside the shared-records panel; unexpected failures still throw. This follow-up is committed locally and awaits separate deployment approval.

### Material realism and exposure

Render now uses separate linear surface-detail maps for paint, wood, stone and brushed metal, satin cabinet coatings, polished nonmetallic stone and subtle floorboard color variation. Lighting & scene includes an Exposure slider and Reset exposure. Exposure is a session presentation control and applies to PNG exports; it does not change the saved design's finishes. High quality shadows adds softer shadows and contact shading, with the shading buffer preserving the viewport/export aspect ratio. Keep that option off for faster editing on slower devices.

These are real-time material approximations, not measured manufacturer finishes or a path-traced lighting simulation.

### Final photo rendering

Open Render → Export image → Preview photo render for a quick draft, or Render final photo for 32/64/128 samples. The completed image appears inline with Download photo PNG and, where available, Use photo in presentation. See [rendering](rendering.md) for lighting, camera lenses, room reflections, cancellation and device limits.
