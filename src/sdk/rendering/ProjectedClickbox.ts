export type ScreenPoint = { x: number; y: number };

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
