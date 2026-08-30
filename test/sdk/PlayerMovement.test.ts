import { Player } from "../../src/sdk/Player";
import { Viewport } from "../../src/sdk/Viewport";
import { World } from "../../src/sdk/World";
import { TestRegion } from "../../src/sdk/testing/TestRegion";
import { PlayerAnimationIndices } from "../../src/sdk/rendering/GLTFAnimationConstants";

test("walking consumes a tile after one 600 ms server tick (30 client steps)", () => {
  const region = new TestRegion(10, 10);
  const player = new Player(region, { x: 2, y: 2 });
  player.path = [{ x: 3, y: 2, run: false }];

  for (let cycle = 1; cycle < 30; cycle++) player.clientTick(0, cycle * 20);
  expect(player.perceivedLocation.x).toBeCloseTo(2 + 29 / 30);
  expect(player.path).toHaveLength(1);

  player.clientTick(0, 30 * 20);
  expect(player.perceivedLocation).toEqual({ x: 3, y: 2 });
  expect(player.path).toHaveLength(0);
});

test("running keeps both straight-line tile steps in the visual queue", () => {
  const region = new TestRegion(20, 20);
  const player = new Player(region, { x: 2, y: 2 });
  player.running = true;
  player.destinationLocation = { x: 6, y: 2 };

  player.moveTowardsDestination();

  expect(player.location).toEqual({ x: 4, y: 2 });
  expect(player.path.map(({ x, y }) => ({ x, y }))).toEqual([{ x: 3, y: 2 }, { x: 4, y: 2 }]);
});

test("walking enqueues only the authoritative one-tile step", () => {
  const region = new TestRegion(20, 20);
  const player = new Player(region, { x: 2, y: 2 });
  player.running = false;
  player.destinationLocation = { x: 6, y: 2 };

  player.moveTowardsDestination();

  expect(player.location).toEqual({ x: 3, y: 2 });
  expect(player.path.map(({ x, y }) => ({ x, y }))).toEqual([{ x: 3, y: 2 }]);
});

test("snaps visual movement across a path discontinuity larger than two tiles", () => {
  const region = new TestRegion(20, 20);
  const player = new Player(region, { x: 2, y: 2 });
  player.path = [{ x: 6, y: 2, run: false }];

  player.clientTick(0, 20);

  expect(player.perceivedLocation).toEqual({ x: 6, y: 2 });
  expect(player.path).toHaveLength(0);
});

test.each([
  [Math.PI / 2, PlayerAnimationIndices.StrafeRight],
  [-Math.PI / 2, PlayerAnimationIndices.StrafeLeft],
  [Math.PI, PlayerAnimationIndices.Rotate180],
])("selects the directional movement pose for heading delta %p", (heading, expectedPose) => {
  const region = new TestRegion(20, 20);
  const player = new Player(region, { x: 2, y: 2 });
  player.path = [{ x: 3, y: 2, run: false }];
  (player as any).nextAngle = heading;

  player.clientTick(0, 20);

  expect(player.currentPoseAnimation).toBe(expectedPose);
});

test("does not flash idle when the visual queue drains before the server journey", () => {
  const region = new TestRegion(20, 20);
  const player = new Player(region, { x: 2, y: 2 });
  player.running = false;
  player.location = { x: 3, y: 2 };
  player.destinationLocation = { x: 5, y: 2 };
  player.path = [{ x: 3, y: 2, run: false }];

  for (let cycle = 1; cycle <= 32; cycle++) player.clientTick(0, cycle * 20);

  expect(player.path).toHaveLength(0);
  expect(player.currentPoseAnimation).toBe(PlayerAnimationIndices.Walk);
});

test.each([
  ["east", 0],
  ["west", -Math.PI],
])("keeps the locomotion pose continuous while walking %s", (_direction, heading) => {
  const region = new TestRegion(20, 20);
  const player = new Player(region, { x: 2, y: 2 });
  player.running = false;
  player.destinationLocation = { x: heading === 0 ? 8 : -4, y: 2 };
  player.path = [
    { x: heading === 0 ? 3 : 1, y: 2, run: false },
    { x: heading === 0 ? 4 : 0, y: 2, run: false },
    { x: heading === 0 ? 5 : -1, y: 2, run: false },
  ];
  // Begin already aligned with the travel direction so this test isolates
  // locomotion continuity from the intentional turn-in-place sequence.
  (player as any)._angle = heading;
  (player as any).nextAngle = heading;

  const poses: number[] = [];
  for (let cycle = 1; cycle <= 110; cycle++) {
    player.clientTick(0, cycle * 20);
    poses.push(player.animationIndex);
  }

  // A walking actor must not briefly fall back to idle (or another pose),
  // since that resets the cache animation clock and presents as a visible
  // hitch at every server-tick boundary.
  expect(new Set(poses)).toEqual(new Set([PlayerAnimationIndices.Walk]));
});

test("keeps walking displacement constant as the visual path buffer changes", () => {
  const region = new TestRegion(20, 20);
  const player = new Player(region, { x: 2, y: 2 });
  player.destinationLocation = { x: 8, y: 2 };
  player.path = [
    { x: 3, y: 2, run: false },
    { x: 4, y: 2, run: false },
    { x: 5, y: 2, run: false },
    { x: 6, y: 2, run: false },
  ];
  (player as any)._angle = 0;
  (player as any).nextAngle = 0;

  const deltas: number[] = [];
  let previous = player.perceivedLocation.x;
  for (let cycle = 1; cycle <= 50; cycle++) {
    player.clientTick(0, cycle * 20);
    const current = player.perceivedLocation.x;
    if (current !== previous && player.path.length > 0) deltas.push(current - previous);
    previous = current;
  }

  expect(deltas.length).toBeGreaterThan(20);
  expect(Math.max(...deltas)).toBeCloseTo(Math.min(...deltas));
});

test.each([
  [{ x: 6, y: 5 }, 0],
  [{ x: 4, y: 5 }, -Math.PI],
  [{ x: 5, y: 6 }, -Math.PI / 2],
  [{ x: 5, y: 4 }, Math.PI / 2],
])("retains the final travel heading at destination %p", (destination, expectedHeading) => {
  const region = new TestRegion(20, 20);
  const player = new Player(region, { x: 5, y: 5 });
  player.running = false;
  player.destinationLocation = destination;
  player.moveTowardsDestination();

  for (let cycle = 1; cycle <= 80; cycle++) player.clientTick(0, cycle * 20);

  expect((player as any).restingAngle).toBeCloseTo(expectedHeading);
  expect((player as any)._angle).toBeCloseTo(expectedHeading);
});

test("uses the final path segment rather than a transient turn target for resting yaw", () => {
  const region = new TestRegion(20, 20);
  const player = new Player(region, { x: 5, y: 5 });
  player.running = false;
  player.location = { x: 4, y: 5 };
  player.destinationLocation = { x: 4, y: 5 };
  player.path = [{ x: 4, y: 5, run: false }];
  // Simulate nextAngle having been overwritten during a server/visual queue
  // boundary. Zero is the old east-facing fallback.
  (player as any).nextAngle = 0;

  for (let cycle = 1; cycle <= 80; cycle++) player.clientTick(0, cycle * 20);

  expect((player as any).restingAngle).toBeCloseTo(-Math.PI);
  expect((player as any)._angle).toBeCloseTo(-Math.PI);
});

test("a coincident server and client boundary processes the server first", () => {
  const world = new World();
  const order: string[] = [];
  world.isPaused = false;
  world.then = 580;
  world.tickTimer = 0;
  world.nextTickTimer = 600;
  world.clientTickTimer = 580;
  world.tickWorld = jest.fn(() => { order.push("server"); });
  world.tickClient = jest.fn(() => { order.push("client"); });
  Viewport.viewport = { draw: jest.fn() } as never;
  const requestFrame = jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);

  world.browserLoop(601);

  expect(order).toEqual(["server", "client"]);
  requestFrame.mockRestore();
});
