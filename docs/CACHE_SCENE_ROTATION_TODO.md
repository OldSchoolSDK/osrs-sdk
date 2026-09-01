# Cache scene rotation fidelity TODO

The cache-scene asset pipeline now follows the general object-definition rules
from `OSRS-Environment-Exporter`'s `ObjectToModelConverter` and
`SceneRegionBuilder`. It intentionally contains no region, tile, model-ID, or
placement-specific rotation overrides.

## Kept behaviour

- Object definitions without explicit model types are valid for all location
  types. Their definition-level `rotated` flag is applied before location
  orientation.
- Typed definitions choose the model matching the location type and use the
  Kotlin exporter’s orientation/flip rule.
- Wall corners, diagonal wall decorations (types 4–8), and diagonal
  interactables (type 11) retain the Kotlin exporter’s documented special
  orientation behaviour.
- Model data is cloned before mutation, matching the Kotlin loader’s defensive
  model copy and preventing one placement’s transform from contaminating
  another.

## Deliberately removed experiments

- Per-tile/model orientation probes for the Colosseum.
- A type-22-only local-axis reflection added to compensate for the trainer’s
  scene coordinate convention. It was not part of the Kotlin exporter and did
  not generalise across scene geometry.
- Build-time terrain diagnostic logging.

## Remaining issue

Colosseum’s playable floor and primary walls are visually convincing, but some
outer grandstand/wall assemblies still have incorrect handedness or rotation.
The fault is not yet understood well enough to encode a general rule.

Likely next investigation: compare the raw model conversion and scene placement
matrices, type-by-type, against a runnable Kotlin export for the same cache
revision. In particular, confirm how cache-region Y mirroring composes with
the trainer’s X/Z coordinates and with multi-tile object origins. Do not add
tile- or model-specific patches; any fix must be expressed as a cache-wide
object-type or coordinate-convention rule and validated on more than one
region.
