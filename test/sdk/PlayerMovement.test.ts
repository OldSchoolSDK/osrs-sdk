import { Player } from "../../src/sdk/Player";
import { Viewport } from "../../src/sdk/Viewport";
import { World } from "../../src/sdk/World";
import { TestRegion } from "../../src/sdk/testing/TestRegion";
import { PlayerAnimationIndices } from "../../src/sdk/rendering/GLTFAnimationConstants";
import { Mob } from "../../src/sdk/Mob";

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

test("keeps walking displacement constant in a normal visual path buffer", () => {
  const region = new TestRegion(20, 20);
  const player = new Player(region, { x: 2, y: 2 });
  player.destinationLocation = { x: 8, y: 2 };
  player.path = [
    { x: 3, y: 2, run: false },
    { x: 4, y: 2, run: false },
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

test("uses bounded catch-up speed when the visual queue grows", () => {
  const region = new TestRegion(30, 30);
  const player = new Player(region, { x: 2, y: 2 });
  player.destinationLocation = { x: 20, y: 2 };
  player.path = [
    { x: 3, y: 2, run: false },
    { x: 4, y: 2, run: false },
    { x: 5, y: 2, run: false },
    { x: 6, y: 2, run: false },
  ];
  (player as any)._angle = 0;
  (player as any).nextAngle = 0;

  const before = player.perceivedLocation.x;
  player.clientTick(0, 20);
  // A queue longer than three tiles uses the 2x catch-up rate.
  expect(player.perceivedLocation.x - before).toBeCloseTo(2 / 30);
});

test("keeps diagonal running continuous across visual waypoints", () => {
  const region = new TestRegion(20, 20);
  const player = new Player(region, { x: 2, y: 2 });
  player.running = true;
  player.destinationLocation = { x: 8, y: 8 };
  player.path = [{ x: 3, y: 3, run: true }, { x: 4, y: 4, run: true }];
  const heading = -Math.PI / 4;
  (player as any)._angle = heading;
  (player as any).nextAngle = heading;

  const poses: number[] = [];
  const distances: number[] = [];
  let previous = { ...player.perceivedLocation };
  for (let cycle = 1; cycle <= 20; cycle++) {
    player.clientTick(0, cycle * 20);
    poses.push(player.animationIndex);
    distances.push(Math.hypot(player.perceivedLocation.x - previous.x, player.perceivedLocation.y - previous.y));
    previous = { ...player.perceivedLocation };
  }

  expect(new Set(poses)).toEqual(new Set([PlayerAnimationIndices.Run]));
  const movingDistances = distances.filter((distance) => distance > 0);
  expect(Math.max(...movingDistances)).toBeCloseTo(Math.min(...movingDistances));
});

test("keeps the run pose stable while diagonally approaching an aggro target", () => {
  const region = new TestRegion(30, 30);
  const target = new Mob(region, { x: 9, y: 10 }, {});
  const player = new Player(region, { x: 2, y: 2 }, { aggro: target });
  player.running = true;
  player.destinationLocation = { x: 9, y: 10 };

  const poses: number[] = [];
  for (let serverTick = 0; serverTick < 3; serverTick++) {
    player.moveTowardsDestination();
    for (let clientTick = 1; clientTick <= 20; clientTick++) {
      player.clientTick(0, (serverTick * 20 + clientTick) * 20);
      poses.push(player.animationIndex);
    }
  }


  expect(poses.filter((pose) => pose === PlayerAnimationIndices.Run).length).toBeGreaterThan(poses.length / 2);
  expect(poses).not.toContain(PlayerAnimationIndices.Idle);
});

test("does not downgrade a running step to walk during a small-angle turn", () => {
  const region = new TestRegion(20, 20);
  const player = new Player(region, { x: 2, y: 2 });
  player.running = true;
  player.path = [{ x: 3, y: 3, run: true }];
  // Small enough to remain a forward movement pose, but large enough to
  // trigger the reference turn slowdown.
  (player as any)._angle = 0;
  (player as any).nextAngle = 0.2;

  const poses: number[] = [];
  for (let cycle = 1; cycle <= 8; cycle++) {
    player.clientTick(0, cycle * 20);
    poses.push(player.animationIndex);
  }
  expect(new Set(poses)).toEqual(new Set([PlayerAnimationIndices.Run]));
});

test("keeps diagonal running visually aligned with successive true tiles", () => {
  const region = new TestRegion(30, 30);
  const player = new Player(region, { x: 2, y: 2 });
  player.running = true;
  player.destinationLocation = { x: 14, y: 14 };
  for (let serverTick = 0; serverTick < 4; serverTick++) {
    player.moveTowardsDestination();
    for (let clientTick = 1; clientTick <= 30; clientTick++) {
      player.clientTick(0, (serverTick * 30 + clientTick) * 20);
    }
    // Turning may intentionally leave the visual actor slightly behind the
    // true tile, but it must never run ahead or accumulate an unbounded lag.
    expect(player.perceivedLocation.x).toBeLessThanOrEqual(player.location.x + 1e-9);
    expect(player.perceivedLocation.y).toBeLessThanOrEqual(player.location.y + 1e-9);
    expect(player.location.x - player.perceivedLocation.x).toBeLessThan(0.5);
    expect(player.location.y - player.perceivedLocation.y).toBeLessThan(0.5);
  }
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
  // +π and -π are the same heading; rotation may legitimately settle on
  // either representation after shortest-path normalisation.
  expect(Math.abs(Math.abs((player as any)._angle) - Math.PI)).toBeLessThan(0.02);
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
