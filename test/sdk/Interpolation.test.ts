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
