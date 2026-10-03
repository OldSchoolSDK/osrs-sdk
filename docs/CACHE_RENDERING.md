# Cache rendering mechanics

This documents durable cache and renderer behavior that content authors need to
preserve. It intentionally omits discarded implementation experiments.

## Cache model payloads

- Extraction is Node-only. The browser receives decoded, versioned binary
  payloads; it never reads the raw OSRS cache.
- Player equipment is composed in SDK equipment-slot order. That order matters:
  animation vertex groups and source-vertex mappings are concatenated in the
  same order as the geometry.
- `sourceVertices` must remain local to each composed model component. Falling
  back to bind-pose coordinates globally can merge coincident vertices from
  different items and corrupt animation transforms.
- Standard sequences use frame-map transforms and are applied on the composed
  geometry. Animaya sequences use extracted skeleton matrices and per-vertex
  bone groups.

## Authored click geometry

- Cache face alpha `254` is effectively invisible. `rs-map-viewer` converts it
  to alpha `1 / 255` and skips the face; the SDK renderer likewise discards it.
- Invisible faces are still ordinary model vertices, so Animaya deformation
  will move them unless they are extracted from the visual payload.
- Sol Heredit has an isolated, axis-aligned 12-face alpha-254 box. Its
  `CACHE_ASSETS.npcs.solHeredit.clickboxFilter` marks that geometry as
  `geometryClickbox`: it is removed from the visual mesh and rendered as a
  separate root-level picking proxy, which follows actor placement/yaw but not
  body-bone animation.
- Do not infer click geometry from alpha alone for other models. There is no
  documented cache-wide clickbox marker; preserve transparent faces unless a
  model's data establishes the same intentional convention.

## Animation and timing

- Cache sequence frame lengths are in 20 ms units; renderer clocks are seconds,
  so lengths are divided by 50.
- Actor pose animations loop. Attack and other explicitly attached spotanims
  are one-shot effects and must not wrap with modulo arithmetic.
- Spotanim-only renderables start their own animation clock when their payload
  is ready. Starting the clock while assets are loading can consume a short
  effect before its mesh is visible.
- CPU frame transforms are currently required for frame-map and Animaya data.
  Synchronized repeated actors/effects can share one transformed geometry and
  use per-instance matrices.

## Spotanims

- A spotanim definition supplies a model, sequence, scale, and cache rotation.
  Gameplay supplies actor-specific height, delay, offset, and optional colour
  replacement.
- `GraphicsObject` is the reusable SDK entity for a standalone world instance
  of one definition. It owns an independent animation clock and removes itself
  when its one-shot sequence ends.
- Spotanims attached with `Unit.addSpotAnim(...)` instead inherit the actor's
  position and facing, matching the client's `ActorSpotAnim`.
- Spotanims may be rendered without base geometry via
  `CacheRenderReferences.spotAnim(...)`.
- Spotanim face alpha is distinct from vertex colour. Preserve alpha groups and
  apply them as material alpha/discard data; dropping or misaligning them makes
  transparent cache faces opaque.

## Coordinate conventions

- SDK world coordinates use X east and Y north. Three.js uses X east and Z
  south, with Y vertical.
- Render roots are positioned at `(location.x + size / 2, -0.49,
  location.y - size / 2)` and use the actor yaw convention established by
  `Renderable`.
- Cache model vertices are converted from cache units by `/ 128`; cache Y is
  negated into renderer vertical coordinates and cache Z is negated into the
  renderer's north/south axis.

## Picking

- Cache NPC picking follows the deob's two branches. One-tile NPCs accept a
  mouse-ray hit on their model box. Larger NPCs first require a box hit, then
  scan the rectangles of their projected faces with inclusive 5px padding,
  stopping on the first match. The face interior is not tested, and a convex
  hull is not built. Custom renderers without triangle data retain hull picking.
- Bounds are taken after rotating the actual posed vertices, include the model
  origin, and have minimum horizontal half-extents of 32 client units, with
  another 8 units for one-tile NPCs. This avoids inflating slender models by
  rotating a previously computed local box. Bounds are shared with UI checks.
- Picking truncates projected pixel offsets toward zero before adding the
  integer viewport centre. The browser's camera projection and smooth animated
  positions remain SDK values; this is the client's picking algorithm, not a
  bit-exact reproduction of its fixed-point software renderer.
- Only boxes under the current pointer need finer processing. The debug overlay
  shows cheap screen bounds in amber, and tested one-tile boxes or already-
  projected padded face rectangles in cyan. Enabling it never projects the full
  geometry. Each draw invalidates stale projections and refines only pointer
  candidates, so stationary-pointer picking uses the current pose.
- Cache models deduplicate source-vertex indices when loading the payload and
  reuse world-space vertex objects. Visible triangle indices are mapped to those
  deduplicated vertices once at load time. Client-hidden type-2 degenerate faces
  are skipped; extracted authored clickbox geometry remains part of picking.
- A box wholly in front of or behind the near plane also resolves UI visibility
  without transforming every vertex. When the box crosses that plane, check the
  actual vertices; a conservative box alone must not hide a valid model.
- Fine picking skips individual triangles with near-clipped vertices rather
  than rejecting all other faces of a partially clipped large model.
- The local deob client (`Model.draw`, `calculateBoundingBox`, and `draw0`) uses
  mouse/bounds rejection before finer picking and reuses vertex projections from
  software rendering. It does not sort every actor's vertices into a hull.
- `CacheRenderModel` owns a `ClickboxController` in
  `src/sdk/rendering/utils/clickbox.ts`. The controller builds the picking
  topology when geometry loads and owns the reusable world vertices, bounds,
  and dirty flags. The model delegates its clickbox accessors and invalidates
  the controller each draw for pose/transform updates. Viewport projection and
  debug drawing remain in `Viewport3d`.
- `node scripts/debug/benchmark-clickboxes.cjs` compares the previous eager hull
  path, bounds-first hull picking, and bounds-first rectangle scans using local
  NPC geometry in the larger-model branch. It measures CPU picking/UI cost,
  including a posed-bounds refresh, rather than total renderer FPS.

## Terrain colour

- A map tile references an underlay and, optionally, an overlay. Cache map
  references are one-based; the corresponding floor-definition IDs are
  zero-based. An underlay definition originates as an unsigned RGB medium and
  is decoded to hue, saturation, lightness, and hue multiplier.
- Underlay colour is blended before the tile is meshed. The RuneScape
  incremental algorithm with blend radius `5` has an effective 10×10 window:
  cache offsets `-4..+5` in each direction. It sums hue blends and hue
  multipliers, averages saturation and lightness, then packs the result into
  OSRS HSL. Do not replace this with a symmetric 11×11 sample loop.
- Overlays do not participate in underlay blending. They use their own packed
  HSL or texture on the overlay triangles selected by the tile path and
  rotation. RGB `0xFF00FF` is the transparent terrain sentinel and omits those
  faces.
- Terrain lighting is applied to the packed HSL at each corner: derive the
  corner brightness from height normal and tile-light occlusion, multiply the
  packed lightness, and clamp it to `2..126`. Edge vertices average/mix packed
  HSL values; do not interpolate converted RGB values instead.
- The Kotlin GLB exporter converts final packed HSL with `ColorPalette(1.0)`.
  rs-map-viewer’s 3D shader has the equivalent conversion at brightness `1`.
  Fog, tone mapping, and material lighting are later renderer stages and are
  not part of tile-colour generation.
- `scripts/debug/dump-region-colours.mts` writes a generated per-tile
  diagnostic with cache/trainer coordinates, blend inputs, packed/unpacked
  HSL, and reference RGB. Use it when checking cache-colour parity; do not
  treat it as a runtime asset format.

## Performance

- Decoded payloads are promise-cached by bundle version and asset ID.
- Repeated synchronized cache models should use `CacheRenderInstancedModel`:
  one geometry/material and one CPU animation update per pool, with per-instance
  placement matrices. Pool keys must include any differing animation phase,
  delay, scale, or recolour state.
- Spotanim pools should load only the requested spotanim assets. Eagerly
  constructing every spotanim for every short-lived effect causes severe frame
  drops during attacks that spawn many graphics.
