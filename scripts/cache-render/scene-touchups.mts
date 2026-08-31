/**
 * Presentation-only scene edits, kept as data so the cache decoder stays a
 * faithful source reader. These currently mirror InfernoSceneOverrider from
 * OSRS-Environment-Exporter.
 */
const INFERNO_REGION_ID = 9043;

const SCENE_TOUCHUPS = {
  [INFERNO_REGION_ID]: {
    replacements: [
      { x: 27, y: 52, objectId: 30340, orientation: 1 },
      { x: 27, y: 55, objectId: 30327, orientation: 2 },
      { x: 27, y: 54, objectId: 30342, orientation: 1 },
      // The cache has a separate plane-1 location at this tile; replace only
      // the ground-plane wall to avoid stacking two copies of the corner.
      { x: 27, y: 56, z: 0, objectId: 30328, orientation: 2 },
      { x: 35, y: 52, objectId: 30339, orientation: 3 },
      { x: 35, y: 54, objectId: 30341, orientation: 3 },
      { x: 28, y: 52, objectId: 30345, orientation: 3 },
      { x: 33, y: 52, objectId: 30345, orientation: 3 },
    ],
    rectangleReplacements: [
      { xMin: 26, xMax: 33, yMin: 50, yMax: 54, objectId: 30291 },
    ],
    removals: [{ xMin: 17, xMax: 45, yMin: 17, yMax: 45 }],
  },
};

export function applySceneTouchups(regionId: number, location: any) {
  const touchups = SCENE_TOUCHUPS[regionId as keyof typeof SCENE_TOUCHUPS];
  if (!touchups) return location;
  const { localX: x, localY: y } = location.position;
  for (const replacement of touchups.replacements) {
    // Specific corners must win over the broader lava rectangle.
    if (replacement.x === x && replacement.y === y && (replacement.z === undefined || replacement.z === location.position.height)) {
      return { ...location, id: replacement.objectId, orientation: replacement.orientation ?? location.orientation };
    }
  }
  for (const replacement of touchups.rectangleReplacements) {
    if (x >= replacement.xMin && x <= replacement.xMax && y >= replacement.yMin && y <= replacement.yMax) {
      return { ...location, id: replacement.objectId, orientation: replacement.orientation ?? location.orientation };
    }
  }
  return touchups.removals.some((removal) => x >= removal.xMin && x <= removal.xMax && y >= removal.yMin && y <= removal.yMax) ? null : location;
}
