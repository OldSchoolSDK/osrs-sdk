export type ScreenPoint = { x: number; y: number };
export type ScreenBounds = { minX: number; minY: number; maxX: number; maxY: number };

export function screenBoundsContain(bounds: ScreenBounds, point: ScreenPoint, tolerance = 0) {
  return point.x >= bounds.minX - tolerance && point.x <= bounds.maxX + tolerance
    && point.y >= bounds.minY - tolerance && point.y <= bounds.maxY + tolerance;
}

/** The client's fine hit test is a padded triangle rectangle, not its interior. */
export function projectedTriangleBounds(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint): ScreenBounds {
  return { minX: Math.min(a.x, b.x, c.x), maxX: Math.max(a.x, b.x, c.x),
    minY: Math.min(a.y, b.y, c.y), maxY: Math.max(a.y, b.y, c.y) };
}

export function projectedTrianglesContain(
  vertices: readonly (ScreenPoint | null)[], indices: ArrayLike<number>, point: ScreenPoint, tolerance = 5,
) {
  for (let i = 0; i < indices.length; i += 3) {
    const a = vertices[indices[i]], b = vertices[indices[i + 1]], c = vertices[indices[i + 2]];
    if (!a || !b || !c) continue;
    // Inline the deob's rejection checks: no allocation and stop on the first hit.
    if (point.y + tolerance < a.y && point.y + tolerance < b.y && point.y + tolerance < c.y) continue;
    if (point.y - tolerance > a.y && point.y - tolerance > b.y && point.y - tolerance > c.y) continue;
    if (point.x + tolerance < a.x && point.x + tolerance < b.x && point.x + tolerance < c.x) continue;
    if (point.x - tolerance > a.x && point.x - tolerance > b.x && point.x - tolerance > c.x) continue;
    return true;
  }
  return false;
}

/** Camera-space depth range of a world AABB, without allocating corner vectors. */
export function boundsDepthRange(
  bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } },
  cameraInverse: { elements: ArrayLike<number> },
) {
  const e = cameraInverse.elements;
  const { min, max } = bounds;
  return {
    min: e[14] + e[2] * (e[2] >= 0 ? min.x : max.x)
      + e[6] * (e[6] >= 0 ? min.y : max.y) + e[10] * (e[10] >= 0 ? min.z : max.z),
    max: e[14] + e[2] * (e[2] >= 0 ? max.x : min.x)
      + e[6] * (e[6] >= 0 ? max.y : min.y) + e[10] * (e[10] >= 0 ? max.z : min.z),
  };
}

/** Perspective projection is undefined for points on or behind the near plane. */
export function isInFrontOfNearPlane(cameraSpaceZ: number, near: number) {
  return cameraSpaceZ <= -near;
}

const cross = (origin: ScreenPoint, a: ScreenPoint, b: ScreenPoint) =>
  (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);

export function convexHull(points: ScreenPoint[]): ScreenPoint[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length <= 2) return sorted;
  const lower: ScreenPoint[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: ScreenPoint[] = [];
  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function distanceToSegment(point: ScreenPoint, a: ScreenPoint, b: ScreenPoint) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const amount = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared,
  ));
  return Math.hypot(point.x - (a.x + amount * dx), point.y - (a.y + amount * dy));
}

export function projectedHullContains(hull: ScreenPoint[], point: ScreenPoint, tolerance = 0) {
  if (hull.length < 3) return hull.some((vertex) => Math.hypot(vertex.x - point.x, vertex.y - point.y) <= tolerance);
  let inside = false;
  for (let index = 0, previous = hull.length - 1; index < hull.length; previous = index++) {
    const a = hull[index], b = hull[previous];
    if (distanceToSegment(point, a, b) <= tolerance) return true;
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
