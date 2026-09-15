# Kitchen Studio demo

A browser-based kitchen planner using the existing Allure catalog. The entry page is `/designer`; sign in with your existing account. Your expanded catalog contains 311 products. Cabinets with known width, depth, and height can be placed. Other records remain available in Catalog and Review.

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
4. Drag cabinets in the **2D plan**. Wall snapping is enabled by default. For precise placement, edit X/Y coordinates or use arrow keys (1 inch; Shift + arrow moves 6 inches). Use Rotate, Turn 180°, Flip left/right, Duplicate, or Delete in Properties. Flip left/right mirrors the illustrative door front and handle; it does not change catalog dimensions or establish manufacturer handing. Undo and Redo preserve editing history during the session.
5. Switch to **3D preview**, rotate the view, and try the illustrative finishes. Both views use the same cabinet positions and dimensions. Drag the 3D view to orbit, or choose its Pan tool. Zoom buttons and Fit control the view.
6. Watch **Layout checks** for overlapping cabinets, room boundary violations, and ceiling height conflicts. Wall cabinets start at an editable elevation of 54 inches. Vertically separated cabinets do not count as overlaps.
7. Name the project and select **Save design**. Create a new room, select your saved design, and press **Open** to restore it.
8. **Export** downloads the design as JSON; **Import** restores that file in another browser. **Export list** downloads cabinet quantities and dimensions as CSV. Source links lead to the existing PDF review screens.

## Storage and scope

Edits automatically save a draft in this browser, separately for each signed-in account. Save design keeps named copies (up to 20). JSON export is the portable backup; browser storage does not sync to other devices and can be removed by clearing site data. Designs support up to 100 items and polygonal rooms with outer dimensions from 36 to 600 inches.

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
- **Placement:** drag library cards into the 2D plan. Snapping includes nearby object edges as well as walls. Moving an object displays its dimensions and coordinates. Shift-click or use Selection tools to select multiple objects, then align or distribute them. Assemblies move as a unit.
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
- **Demo walkthrough** guides five steps: sample, style, placement, comparison and proposal. Starting it loads the sample with Undo available. Use Next step when ready, or close it to continue freely.

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
