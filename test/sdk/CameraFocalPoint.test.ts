import {
  CLIENT_UNITS_PER_TILE,
  CameraFocalPoint,
} from "../../src/sdk/CameraFocalPoint";

test("initialises directly over the player", () => {
  const focalPoint = new CameraFocalPoint();

  expect(focalPoint.follow({ x: 10, y: 20 })).toEqual({ x: 10.5, y: 19.5 });
});

test("moves toward the client-cycle player position by delta divided by 16", () => {
  const focalPoint = new CameraFocalPoint();
  focalPoint.follow({ x: 10, y: 20 });

  const position = focalPoint.follow({ x: 11, y: 19 });

  expect(position.x).toBe(10.5 + 8 / CLIENT_UNITS_PER_TILE);
  expect(position.y).toBe(19.5 - 8 / CLIENT_UNITS_PER_TILE);
});

test("render initialization does not advance an existing focal point", () => {
  const focalPoint = new CameraFocalPoint();
  focalPoint.follow({ x: 10, y: 20 });
  const followed = focalPoint.follow({ x: 11, y: 20 });

  expect(focalPoint.initialise({ x: 11, y: 20 })).toEqual(followed);
  expect(focalPoint.initialise({ x: 11, y: 20 })).toEqual(followed);
});

test("interpolates the presented focal point across the client cycle", () => {
  const focalPoint = new CameraFocalPoint();
  focalPoint.follow({ x: 10, y: 20 }, 0);
  focalPoint.follow({ x: 11, y: 20 }, 20);

  expect(focalPoint.getPerceivedPosition(20).x).toBe(10.5);
  expect(focalPoint.getPerceivedPosition(30).x).toBe(10.5 + 4 / CLIENT_UNITS_PER_TILE);
  expect(focalPoint.getPerceivedPosition(40).x).toBe(10.5 + 8 / CLIENT_UNITS_PER_TILE);
});

test("uses integer client-unit movement and snaps large discontinuities", () => {
  const focalPoint = new CameraFocalPoint();
  focalPoint.follow({ x: 10, y: 20 }, 0);

  // Eight client units is too small to produce a divided integer step.
  expect(focalPoint.follow({ x: 10 + 8 / CLIENT_UNITS_PER_TILE, y: 20 })).toEqual({ x: 10.5, y: 19.5 });

  // A difference over 500 client units snaps both axes to the target.
  expect(focalPoint.follow({ x: 15, y: 21 }, 20)).toEqual({ x: 15.5, y: 20.5 });
  expect(focalPoint.getPerceivedPosition(20)).toEqual({ x: 15.5, y: 20.5 });
});
