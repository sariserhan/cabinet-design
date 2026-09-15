# Realistic views and presentation scenes

Open **Designer → Render**.

- **Lighting & scene:** choose Garden HDR daylight or Studio. Detailed PBR materials use local color, roughness and normal maps for oak cabinetry, wood/tile floors and marble worktops. Auto balance view estimates exposure and a neutral white balance; Reset image balance returns both to their defaults.
- **Export image:** photo rendering uses bounced light and reflections. Automatic photo exposure and white balance are enabled by default. Refine noisy regions compares successive progressive images in four regions, then renders the changing regions at the selected sample count. An overlapping border protects the noise filter at region edges. Quiet regions retain the initial samples. This is a heuristic and is not guaranteed to be faster for uniformly noisy scenes.
- **Presentation scenes:** save up to six views with camera position/target, lens, lighting, environment, material preview, exposure, white balance, ceiling, cutaway and photo settings. Load a scene or update it from the current view. Export settings to JSON, or export all scenes as preview/photo PNGs in a ZIP. Photo batches use the selected sample count and PNG width, capped at 1920 px; preview batches use 640 px and 8 samples. The current viewport determines aspect ratio. Cancellation discards an incomplete batch and restores the previous view.

Scenes are owner-scoped browser data. They are included in complete project backups and restored copies; they do not sync through cloud/shared-project records. A plain design JSON export does not include them. Scene-setting imports must belong to the same design; use a complete backup to transfer a project to a restored copy.

Materials and the outdoor panorama are illustrative. They are not manufacturer-certified samples, appliance CAD, or the project site's actual surroundings. Fixtures use dimensioned generic geometry, with a CC0 decorative stool. Full asset provenance and checksums are in `public/render-assets/manifest.json`; license links are in `CREDITS.md` beside it. Assets are bundled locally, with generated-material/studio fallback if loading fails.

Photo rendering requires floating-point WebGL support. It can take several minutes, particularly on software graphics. Individual exports support larger widths subject to the graphics device's texture limit. Changing the design cancels a batch; settings are captured per scene, and geometry/textures are owned by each in-flight image.
