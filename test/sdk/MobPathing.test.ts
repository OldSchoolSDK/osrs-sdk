import { InvisibleMovementBlocker } from "../../src/content/MovementBlocker";
import { Player } from "../../src/sdk/Player";
import { TestNpc } from "../../src/sdk/testing/TestNpc";
import { TestRegion } from "../../src/sdk/testing/TestRegion";
import { World } from "../../src/sdk/World";

class PathingNpc extends TestNpc {
  override get attackRange() { return 0; }
}

test("large NPCs can cut diagonal corners when their destination footprint is clear", () => {
  const region = new TestRegion(20, 20);
  const world = new World();
  region.world = world;
  world.addRegion(region);

  const player = new Player(region, { x: 10, y: 0 });
  const mob = new PathingNpc(region, { x: 5, y: 5 }, { aggro: player });
  mob.stunned = 0;
  region.addPlayer(player);
  region.addMob(mob);

  // This tile touches the eastward swept corner, but is not occupied by the
  // 3x3 NPC after its north-east diagonal step to (6, 4).
  region.addEntity(new InvisibleMovementBlocker(region, { x: 8, y: 5 }));

  mob.movementStep();

  expect(mob.location).toEqual({ x: 6, y: 4 });
});

test("an NPC with zero range paths toward a target that its normal range could reach", () => {
  const region = new TestRegion(20, 20);
  const world = new World();
  region.world = world;
  world.addRegion(region);

  const player = new Player(region, { x: 10, y: 5 });
  const mob = new PathingNpc(region, { x: 5, y: 5 }, { aggro: player });
  mob.stunned = 0;
  region.addPlayer(player);
  region.addMob(mob);

  mob.movementStep();
  expect(mob.location).toEqual({ x: 6, y: 5 });
});
