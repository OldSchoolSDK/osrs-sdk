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

## Performance

- Decoded payloads are promise-cached by bundle version and asset ID.
- Repeated synchronized cache models should use `CacheRenderInstancedModel`:
  one geometry/material and one CPU animation update per pool, with per-instance
  placement matrices. Pool keys must include any differing animation phase,
  delay, scale, or recolour state.
- Spotanim pools should load only the requested spotanim assets. Eagerly
  constructing every spotanim for every short-lived effect causes severe frame
  drops during attacks that spawn many graphics.
