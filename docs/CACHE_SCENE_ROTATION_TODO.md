# Colosseum grandstand orientation investigation — resolved

The reported backwards grandstand steps were fixed on 2026-10-04. This file
keeps its historical name so earlier references still lead to the diagnosis.
The old rotation/handedness hypothesis was not the cause of these examples.

## Cause

`osrscachereader` returns positive upward terrain elevations but downward-Y
model vertices. The SDK's contour formula had been ported from a renderer
using negative terrain heights without converting that input convention.
Consequently it deformed each model against the terrain slope. The result
looked like a backwards-facing step in every orientation.

The fix is in `packages/osrs-sdk-assets/src/scene-contour.mts`: convert the
height samples into model-space Y before interpolation and subtract the
placement height in the same convention. There is no extra 180-degree turn,
type-22 reflection, or per-object/per-tile rotation override.

## Evidence and regression cases

All positions below are in the SDK demo, which has no ColosseumTrainer scene
offset. Region 7216 has origin `(1792, 3072)`; cache local coordinates are
`(trainerX, 63 - trainerY)`. ColosseumTrainer has its own integration offset,
so do not apply this mapping to that app without accounting for it.

| SDK tile | Object | Model | Orientation |
| --- | --- | --- | --- |
| 21, 11 | 52521 | 51308 | 3 |
| 15, 17 | 52521 | 51308 | 2 |
| 49, 15 | 52521 | 51308 | 0 |
| 19, 45 | 52521 | 51308 | 1 |
| 20, 12 | 52522 | 51304 | 0 |
| 20, 11 | 52523 | 51309 | 0 |

These are type-22 decorations on plane 1, with 1x1 footprints and contouring
enabled. Using OpenRS2 cache 2437 (revision 236):

- Independently decoding definitions and raw models with `rs-map-viewer`
  matched the reader. All four rotations and repeated orientation lookups
  matched before contouring. That establishes parity for these models under
  the extraction path's default reader options, not for every reader feature.
- The initial check of compiled X/Z coordinates also matched, but omitted
  the failing Y deformation. It was insufficient to establish final parity.
- Expected contoured vertices were generated with `rs-map-viewer`'s
  `ModelData.contourGround` and its signed heightmap. All six placements now
  match those expectations exactly in the asset tool's `test/scene-contour.test.mjs`.
- Matching-camera SDK screenshots showed the backwards slopes becoming
  coherent seating steps. The user also confirmed the corrected rendering.
- All Inferno compiled scene payload hashes remained unchanged after this fix.

The screenshots are local artifacts in the separate `arena-visual-check`
checkout: `screenshots/grandstands-before.png` and `grandstands-after.png`.
The supplied references were `good_rs_map_viewer.png` and `bad_sdk.png`.
The numeric regression fixtures are included with the SDK source so tests
do not depend on those local images, a full cache, or the reference checkout.

## Lessons for subsequent investigations

1. Treat “backwards”, “flipped”, and “rotated” as descriptions of appearance,
   not established mechanisms. Check rotation, reflection, deformation,
   placement, and visibility independently. Terrain deformation can reverse
   a step's apparent facing without changing any horizontal coordinate.
2. Compare the same cache revision, object, location type, orientation, and
   plane through every stage: definition/model selection, reader transforms,
   contouring, coordinate conversion, placement, and actual served payload.
   Report precisely which stages a comparison rules out.
3. Check reader semantics at the adapter boundary. A copied formula can be
   correct for the reference renderer and wrong for this reader's conventions.
   Document axis direction and units for both inputs; compare numeric output.
4. Test repeated lookups when investigating mutation. The reader currently
   disables model caching by default; testing only that path cannot prove
   safety when cached model definitions are explicitly shared. Mirroring
   before cloning remains a separate concern, not the cause established here.
5. Verify that a proposed comparison object is actually visible. Object
   `46318` was suggested during this investigation, but its scale is `1/128`
   and the reference's integer resize collapses its model. Its tile does not
   identify the visible assembly around it.
6. Build the asset tool before regenerating assets after extractor edits.
   `npm run assets` executes `packages/osrs-sdk-assets/dist/cli.js`, not the
   source adapter. Check the served bundle version before interpreting images.
7. Prove the change with a fixed-camera before/after capture and independent
   geometry expectations. Do not add rotation overrides to compensate for an
   untraced discrepancy, or stop at a plausible explanation.

## Separate remaining issue

The SDK terrain extractor only renders plane 0, so the floors between the
grandstand tiers are missing. That explains exposed structures beneath the
seating and is separate from this corrected contour deformation.
