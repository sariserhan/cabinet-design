# Realistic views and presentation scenes

Open **Designer → Render**.

- **Lighting & scene:** choose Garden HDR daylight or Studio. Detailed PBR materials use local color, roughness and normal maps for oak cabinetry, wood/tile floors and marble worktops. Auto balance view estimates exposure and a neutral white balance; Reset image balance returns both to their defaults.
- **Export image:** photo rendering uses bounced light and reflections. Automatic photo exposure and white balance are enabled by default. Refine noisy regions compares successive progressive images in four regions, then renders the changing regions at the selected sample count. An overlapping border protects the noise filter at region edges. Quiet regions retain the initial samples. This is a heuristic and is not guaranteed to be faster for uniformly noisy scenes.
- **Presentation scenes:** save up to six views with camera position/target, lens, lighting, environment, material preview, exposure, white balance, ceiling, cutaway and photo settings. Load a scene or update it from the current view. Export settings to JSON, or export all scenes as preview/photo PNGs in a ZIP. Photo batches use the selected sample count and PNG width, capped at 1920 px; preview batches use 640 px and 8 samples. The current viewport determines aspect ratio. Cancellation discards an incomplete batch and restores the previous view.

Scenes are owner-scoped browser data. They are included in complete project backups and restored copies; they do not sync through cloud/shared-project records. A plain design JSON export does not include them. Scene-setting imports must belong to the same design; use a complete backup to transfer a project to a restored copy.

Materials and the outdoor panorama are illustrative. They are not manufacturer-certified samples, appliance CAD, or the project site's actual surroundings. Fixtures use dimensioned generic geometry, with a CC0 decorative stool. Full asset provenance and checksums are in `public/render-assets/manifest.json`; license links are in `CREDITS.md` beside it. Assets are bundled locally, with generated-material/studio fallback if loading fails.

Photo rendering requires floating-point WebGL support. It can take several minutes, particularly on software graphics. Individual exports support larger widths subject to the graphics device's texture limit. Changing the design cancels a batch; settings are captured per scene, and geometry/textures are owned by each in-flight image.

## Engine and conventions

The Render view keeps the fast raster preview. In **Lighting & scene**, High quality shadows & room reflections adds contact shading and a 128 px room reflection probe. The probe captures the room when the scene is built; it is an approximation from one position, not a separate reflection for every object. Final photo rendering calculates the actual ray intersections instead.

Windows contribute broad area lights. The main sunlight follows the first window for daylight/warm presets, with studio and task modes retaining their respective lighting intent. Glazing admits sunlight in the editing preview. Final rendering computes transmission, shadows and up to six light bounces. Preview fill lights approximate indirect illumination.

Materials use separate pigment and surface-detail maps. Cabinet rails run across the wood grain while stiles run vertically. Stone and backsplash mapping use inches, preserving scale across countertop cutout rectangles. Marble has broad mineral bands and branching veins. Door and drawer reveals are 1/8 inch; toe boards are recessed and use the cabinet finish. These are visual conventions, not fabrication specifications.

**Camera & walk** offers 28, 35, 45 and 60 mm lenses and a Level interior preset when there is clear standing space at the preferred location. The level preset keeps verticals straight with a horizontal sightline. Lens and exposure settings are session controls and are used by exports. Saved camera positions still use the existing position/target format.

## Final photo export

1. Choose a camera and lens. For an enclosed interior, enable Show ceiling; choose the desired cutaway walls.
2. Open **Export image** and choose **Preview photo render** for a 640 px, 8-sample draft.
3. Select the PNG width and 32, 64 or 128 samples, then choose **Render final photo**. Higher sample counts reduce noise and take longer.
4. Progress and Cancel remain available during sampling. Changes that rebuild the scene cancel a running job. Download photo PNG or use the completed photo in the presentation.

The photo engine (`three-gpu-pathtracer` 0.0.24, MIT) loads only when requested. It runs locally with WebGL2 floating-point targets. A separate renderer and cloned geometry/material/texture snapshot isolate the job from edits. Resources are disposed after completion, cancellation or failure. The live preview remains available; no images or designs are sent to a service.

Photo rendering traces room reflections, transmission and indirect light. Procedural materials remain illustrative rather than measured manufacturer finishes. The 8-sample preview can be visibly noisy. GPU speed and scene complexity determine final-render duration; the normal PNG export remains available on devices without float render targets. Photo lighting uses a neutral sky environment instead of the editing view's studio reflection environment. A photo captures the visible scene and camera at the time the job starts; later edits do not change a completed image.

Primary implementation reference: https://github.com/gkjohnson/three-gpu-pathtracer/blob/main/README.md

## Validation

Automated coverage checks snapshot independence, hidden-object pruning, resource cleanup on cancellation, standing-camera placement and window-light direction. Browser validation uses the furnished kitchen fixture, lens and camera selection, a completed low-sample preview, cancellation, room reflections, final PNG generation/download and a 390 px mobile viewport. Browser plugin is not available in this environment, so validation uses Playwright Chromium with software WebGL; hardware GPU performance and other browsers are not benchmarked.

Photo surface-height maps are converted to tangent normal maps so the path tracer can use grain and grout relief. **Reduce photo noise** applies an optional edge-aware finishing filter; it may soften very fine texture, so it can be disabled. Completed photos remain downloadable after edits, but adding one to a presentation is disabled if the design has changed since it was rendered.
