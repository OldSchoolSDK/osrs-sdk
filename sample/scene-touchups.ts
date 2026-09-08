/**
 * Presentation changes applied to the Inferno scene during asset compilation.
 */
import { SAMPLE_ASSETS } from "./assets";

const INFERNO_REGION_ID = SAMPLE_ASSETS.regions.inferno.id;

export const SCENE_TOUCHUPS = {
  [INFERNO_REGION_ID]: {
    replacements: [
      { x: 27, y: 52, objectId: SAMPLE_ASSETS.objects.infernoCornerA.id, orientation: 1 },
      { x: 27, y: 55, objectId: SAMPLE_ASSETS.objects.infernoCornerB.id, orientation: 2 },
      { x: 27, y: 54, objectId: SAMPLE_ASSETS.objects.infernoCornerC.id, orientation: 1 },
      // The cache has a separate plane-1 location at this tile; replace only
      // the ground-plane wall to avoid stacking two copies of the corner.
      { x: 27, y: 56, z: 0, objectId: SAMPLE_ASSETS.objects.infernoCornerD.id, orientation: 2 },
      { x: 35, y: 52, objectId: SAMPLE_ASSETS.objects.infernoCornerE.id, orientation: 3 },
      { x: 35, y: 54, objectId: SAMPLE_ASSETS.objects.infernoCornerF.id, orientation: 3 },
      { x: 28, y: 52, objectId: SAMPLE_ASSETS.objects.infernoCornerG.id, orientation: 3 },
      { x: 33, y: 52, objectId: SAMPLE_ASSETS.objects.infernoCornerG.id, orientation: 3 },
    ],
    rectangleReplacements: [
      { xMin: 26, xMax: 33, yMin: 50, yMax: 54, objectId: SAMPLE_ASSETS.objects.infernoLavaRectangle.id },
    ],
    removals: [{ xMin: 17, xMax: 45, yMin: 17, yMax: 45 }],
  },
};
