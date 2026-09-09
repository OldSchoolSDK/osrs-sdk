import { Location } from "./Location";

export interface QueuedPathStep extends Location {
  run: boolean;
}

export interface PathInterpolationResult {
  location: Location;
  reachedStep: boolean;
}

export class Interpolation {
  /** Advance a visual position towards the first step in an actor's path queue. */
  static resolvePath(
    location: Location,
    path: readonly QueuedPathStep[],
    baseMovementSpeed: number,
    movementSpeed = baseMovementSpeed,
  ): PathInterpolationResult {
    if (path.length === 0) {
      return { location: { ...location }, reachedStep: false };
    }

    const { x: nextX, y: nextY, run } = path[0];
    let resolvedMovementSpeed = movementSpeed;
    if (path.length > 3) resolvedMovementSpeed = baseMovementSpeed * 2;
    else if (path.length > 2) resolvedMovementSpeed = baseMovementSpeed * 1.5;
    if (run) resolvedMovementSpeed *= 2;

    let { x, y } = location;
    if (Math.abs(x - nextX) > 2 || Math.abs(y - nextY) > 2) {
      x = nextX;
      y = nextY;
    } else if (x !== nextX || y !== nextY) {
      const arrivalEpsilon = 1e-9;
      if (x < nextX) {
        x = nextX - x <= resolvedMovementSpeed + arrivalEpsilon ? nextX : x + resolvedMovementSpeed;
      } else if (x > nextX) {
        x = x - nextX <= resolvedMovementSpeed + arrivalEpsilon ? nextX : x - resolvedMovementSpeed;
      }
      if (y < nextY) {
        y = nextY - y <= resolvedMovementSpeed + arrivalEpsilon ? nextY : y + resolvedMovementSpeed;
      } else if (y > nextY) {
        y = y - nextY <= resolvedMovementSpeed + arrivalEpsilon ? nextY : y - resolvedMovementSpeed;
      }
    }

    return {
      location: { x, y },
      reachedStep: x === nextX && y === nextY,
    };
  }
}
