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

This is the agreed kitchen-planning demo, not full 2020 Design parity. The 3D view shows dimensionally sized cabinet boxes with illustrative fronts and finishes. It does not provide photorealistic manufacturer models, curved walls, manufacturer-specific appliance models, live manufacturer pricing, or automated code/clearance/compatibility certification. Layout checks cover geometry; catalog review remains available in the existing screens. Catalog dimensions are not silently resized or invented. No new AI API credits are required to use the designer.

## Run on the server

```sh
npm run dev -- --port 3000
```

## Validation

- `npm run check`: lint, TypeScript, 98 core tests, 15 backend tests, and benchmark artifact integrity.
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

Object QA: all nine types, resizing, door swing, wall attachment and sill elevation, island sink, countertop cutouts, save/reload, JSON export/import, and 2D/3D desktop/mobile views passed. The complete suite now contains 113 automated tests.

## Custom rooms, assemblies, and print packages

- **Room shape:** expand this section under Properties. Choose Rectangle, L shape, or U shape. Draw outline starts a new sequence of corners on a 6-inch grid; clicks create straight segments at any angle. Apply room shape closes and validates the outline. Do not repeat the first corner. You can also edit the X, Y coordinate list (4–24 corners). Self-crossing outlines are rejected; angled walls are supported. Changing room width/depth scales the outline.
- **Wall numbers:** both views and the print package use numbered wall segments. Door/window attachment lists each segment, including internal walls of L/U rooms. Cabinet snapping and boundary checks use the actual room outline.
- **Assemblies:** adding a countertop to a selected base/island or a sink to a selected surface automatically groups them. For manual grouping, select an item, expand Group into an assembly, check the members, and choose Create assembly. Moving or rotating a member carries the group. Turn off Move entire assembly to adjust one member; Ungroup separates them. Assemblies do not change source product dimensions.
- **Cabinet fronts:** selected catalog cabinets offer Auto, Single, Double, Drawers, and Glass preview styles. Auto uses a simple SKU/width heuristic. These are illustrative fronts, not manufacturer geometry or availability guarantees.
- **Print / PDF:** opens the browser print dialog. Choose Save as PDF to export a floor plan, wall elevations, numbered placement schedule, quantities, source references, and current layout warnings. These drawings support design discussion and are not approved installation documents.

Validation also covers custom outline entry/drawing, invalid outline rejection, concave-room boundary checks, internal-wall openings, assembly translation/rotation, individual adjustments, legacy saves, and PDF generation. Cloud synchronization, curved walls, photorealistic manufacturer assets, live manufacturer pricing/ordering, and construction certification remain outside this demo.

### Render a design

Choose **Render** beside **3D preview** for the WebGL view. It uses the current room outline, openings, cabinet dimensions, assemblies, and finish, with lighting and shadows. Drag to orbit, right-drag to pan, and scroll to zoom (two fingers pan/zoom on touch screens). **Reset camera** fits the room; **Cutaway walls** hides walls facing away from the room interior so the layout stays visible. **Download PNG** exports the current camera view at the canvas resolution.

Rendering runs locally in the browser with no API key or paid service. WebGL2 is required; the 2D plan and SVG 3D preview remain available on unsupported devices. Models and finishes are illustrative, not photorealistic manufacturer assets.


## Expanded demo: materials, architecture, detailing, and quotes

- **Architecture & materials** in Properties selects a flat ceiling or a slope along room width/depth. The main ceiling height is the near end; far-end ceiling height sets the other end. Render, wall elevations, and ceiling checks use that plane. **Show ceiling** in Render makes the plane visible.
- Wood cabinetry and flooring have locally generated grain maps. Choose quartz, marble, or granite countertops, and daylight, warm, or studio lighting. Reflections and detailed appliance fronts improve the render without a paid rendering service. These remain illustrative procedural materials and generic models.
- Objects now includes corner cabinets, fillers, trim panels, crown molding, toe kicks, columns, beams, and partition walls. Their dimensions/elevations are editable. Doors and windows attach to angled perimeter segments; partitions are separate solid objects, not hosts for openings.
- Select a cabinet/island/corner, then open **Detailing, clearances & price**. Set shelf/tray count, shelves/pull-outs/Lazy Susan, toe kick height, and crown molding. Corner presets offer diagonal, blind-left, or blind-right fronts. **Show interiors** in Render removes fronts to inspect storage. Corner collision checks conservatively reserve their full rectangular envelope. Catalog cabinet dimensions stay fixed.
- Non-opening objects accept arbitrary **Rotation (degrees)**. Openings inherit their wall angle. Existing quarter-turn buttons remain available. Automatic wall snapping is for axis-aligned segments; use position/rotation controls beside angled walls.
- Layout checks include front operating envelopes, appliance side/rear gaps, range overhead clearance, sloped-ceiling conflicts, oversized wall openings, and a dishwasher-to-sink service-distance reminder. Clearances are editable per item; zero disables a check. Defaults are explicitly demo assumptions, not installation manuals or code certification. Checks do not verify utility connections, ventilation, or appliance-specific combustible clearances.
- **Quote / order** lists one priced line per placement, with USD demo prices. Override any item price in its detailing panel. Add a customer reference, merchandise discount, tax, installation, and delivery. Tax applies only to discounted merchandise; this is demo arithmetic, not jurisdiction-specific tax handling.
- **Export quote** downloads JSON. **Print quote / PDF** includes the quote in the drawing package. **Create demo order** saves an immutable snapshot of the quote and configuration with this design; **Download order** exports it. No payment is collected and no supplier order is submitted. Save/export the design to back up orders; storage is local to the browser. Up to 20 orders fit within the overall 500 KB design limit.

Expanded validation: angled polygon containment and SAT object collisions; sloped wall clipping and ceiling checks; editable clearance envelopes; integer-cent quote arithmetic; invalid-price/order rejection. Browser flow covered 14 placed objects, angled window attachment, custom interiors, material/lighting changes, ceiling visibility, PNG export, quote and order export, retained order snapshots after reload, PDF output, and mobile layout without console errors.

Pricing source note: Fabuwood describes live pricing and order management through its [EZ Pricing dealer portal](https://www.fabuwood.com/become-a-dealer). This demo has no dealer-account integration or verified configured quote, so all displayed prices use the explicit demo schedule rather than claiming to be manufacturer prices.
