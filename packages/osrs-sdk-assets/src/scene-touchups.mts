export function validateScenes(scenes = {}) {
  if (!scenes || typeof scenes !== "object" || Array.isArray(scenes)) throw new Error("scenes must be an object");
  for (const [region, rules] of Object.entries(scenes)) {
    if (!/^\d+$/.test(region) || Number(region) > 65535 || !rules || typeof rules !== "object" || Array.isArray(rules))
      throw new Error(`Invalid scene ${region}`);
    for (const [kind, entries] of Object.entries(rules)) {
      if (!["replacements", "rectangleReplacements", "removals"].includes(kind) || !Array.isArray(entries))
        throw new Error(`Invalid scene rule ${region}.${kind}`);
      for (const entry of entries) {
        const coordinates = kind === "replacements" ? ["x", "y"] : ["xMin", "xMax", "yMin", "yMax"];
        if (!entry || coordinates.some((key) => !Number.isInteger(entry[key]) || entry[key] < 0 || entry[key] > 63))
          throw new Error(`Invalid scene coordinates ${region}.${kind}`);
        if (kind !== "replacements" && (entry.xMin > entry.xMax || entry.yMin > entry.yMax))
          throw new Error(`Inverted scene rectangle ${region}`);
        if (kind !== "removals" && (!Number.isSafeInteger(entry.objectId) || entry.objectId < 0))
          throw new Error(`Invalid scene object ${region}`);
        if (entry.z !== undefined && (!Number.isInteger(entry.z) || entry.z < 0 || entry.z > 3))
          throw new Error(`Invalid scene plane ${region}`);
        if (
          entry.orientation !== undefined &&
          (!Number.isInteger(entry.orientation) || entry.orientation < 0 || entry.orientation > 3)
        )
          throw new Error(`Invalid scene orientation ${region}`);
      }
    }
  }
}

export function applySceneTouchups(regionId, location, scenes = {}, hooks = {}) {
  const touchups = scenes[regionId] ?? {};
  const { localX: x, localY: y, height: z } = location.position;
  const plane = (rule) => rule.z === undefined || rule.z === z;
  const rectangle = (rule) => plane(rule) && x >= rule.xMin && x <= rule.xMax && y >= rule.yMin && y <= rule.yMax;
  const replacement =
    (touchups.replacements ?? []).find((rule) => plane(rule) && rule.x === x && rule.y === y) ??
    (touchups.rectangleReplacements ?? []).find(rectangle);
  if (replacement)
    location = { ...location, id: replacement.objectId, orientation: replacement.orientation ?? location.orientation };
  else if ((touchups.removals ?? []).some(rectangle)) return null;
  return hooks.sceneLocation ? hooks.sceneLocation(regionId, location) : location;
}
