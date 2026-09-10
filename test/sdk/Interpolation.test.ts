import { Mob } from "../../src/sdk/Mob";
import { Player } from "../../src/sdk/Player";
import { TestRegion } from "../../src/sdk/testing/TestRegion";

test("player movement consumes a visual tile step over one server tick", () => {
  const region = new TestRegion(10, 10);
  const player = new Player(region, { x: 2, y: 2 });
  player.visualPath = [{ x: 3, y: 2, run: false }];

  for (let cycle = 1; cycle < 30; cycle++) player.clientTick(0, cycle * 20);
  expect(player.perceivedLocation.x).toBeCloseTo(2 + 29 / 30);
  expect(player.visualPath).toHaveLength(1);

  player.clientTick(0, 30 * 20);
  expect(player.perceivedLocation).toEqual({ x: 3, y: 2 });
  expect(player.visualPath).toHaveLength(0);
});

test("mob movement queues and consumes a visual tile step", () => {
  const region = new TestRegion(20, 20);
  const target = new Player(region, { x: 8, y: 2 });
  const mob = new Mob(region, { x: 2, y: 2 }, { aggro: target });

  mob.movementStep();

  expect(mob.location).toEqual({ x: 3, y: 2 });
  expect(mob.perceivedLocation).toEqual({ x: 2, y: 2 });
  expect(mob.visualPath).toEqual([{ x: 3, y: 2, run: false }]);

  for (let cycle = 1; cycle < 30; cycle++) mob.clientTick(0, cycle * 20);
  expect(mob.perceivedLocation.x).toBeCloseTo(2 + 29 / 30);
  expect(mob.visualPath).toHaveLength(1);

  mob.clientTick(0, 30 * 20);
  expect(mob.perceivedLocation).toEqual({ x: 3, y: 2 });
  expect(mob.visualPath).toHaveLength(0);
  expect(mob.animationIndex).toBe(mob.walkingPoseId);

  mob.setAggro(null);
  mob.movementStep();
  expect(mob.animationIndex).toBe(mob.idlePoseId);
});

test("a running mob visually covers a two-tile step in one game tick", () => {
  const region = new TestRegion(20, 20);
  const target = new Player(region, { x: 8, y: 2 });
  const mob = new class extends Mob {
    override get canRun() { return true; }
    override getNextMovementStep() { return { dx: this.location.x + 2, dy: this.location.y }; }
  }(region, { x: 2, y: 2 }, { aggro: target });

  mob.movementStep();

  expect(mob.location).toEqual({ x: 4, y: 2 });
  expect(mob.visualPath).toEqual([{ x: 4, y: 2, run: true }]);

  for (let cycle = 1; cycle < 30; cycle++) mob.clientTick(0, cycle * 20);
  expect(mob.perceivedLocation.x).toBeCloseTo(2 + 58 / 30);
  expect(mob.visualPath).toHaveLength(1);

  mob.clientTick(0, 30 * 20);
  expect(mob.perceivedLocation).toEqual({ x: 4, y: 2 });
  expect(mob.visualPath).toHaveLength(0);
});

test("an active sequence stalls a pre-existing visual path, then catches up", async () => {
  const region = new TestRegion(20, 20);
  const mob = new Mob(region, { x: 2, y: 2 });
  let animationActive = true;
  mob.visualPath = [
    { x: 3, y: 2, run: false },
    { x: 4, y: 2, run: false },
  ];
  mob.setAnimationListener({
    animationChanged: async () => undefined,
    modelChanged: () => undefined,
    getActiveAnimationMetadata: () => animationActive
      ? { precedenceAnimating: 0, priority: 2 }
      : undefined,
  });

  await mob.playAnimation(2);
  for (let cycle = 1; cycle <= 5; cycle++) mob.clientTick(0, cycle * 20);
  expect(mob.perceivedLocation).toEqual({ x: 2, y: 2 });

  animationActive = false;
  mob.clientTick(0, 6 * 20);
  expect(mob.perceivedLocation.x).toBeCloseTo(2 + 2 / 30);
});

test("sequence priority stalls movement queued after the animation starts", async () => {
  const region = new TestRegion(20, 20);
  const mob = new Mob(region, { x: 2, y: 2 });
  mob.setAnimationListener({
    animationChanged: async () => undefined,
    modelChanged: () => undefined,
    getActiveAnimationMetadata: () => ({ precedenceAnimating: 2, priority: 0 }),
  });

  await mob.playAnimation(2);
  mob.visualPath.push({ x: 3, y: 2, run: false });
  mob.clientTick(0, 20);

  expect(mob.perceivedLocation).toEqual({ x: 2, y: 2 });
  expect(mob.visualPath).toHaveLength(1);
});
