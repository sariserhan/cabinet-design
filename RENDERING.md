# Kitchen rendering

## Editing and presentation

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
