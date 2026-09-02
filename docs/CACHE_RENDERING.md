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
