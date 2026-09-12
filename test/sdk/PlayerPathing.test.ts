import { InvisibleMovementBlocker } from "../../src/content/MovementBlocker";
import { Player } from "../../src/sdk/Player";
import { TestNpc } from "../../src/sdk/testing/TestNpc";
import { TestRegion } from "../../src/sdk/testing/TestRegion";
import { World } from "../../src/sdk/World";

class PathingNpc extends TestNpc {
  override get attackRange() { return 0; }
}

class ThreeTileMovementBlocker extends InvisibleMovementBlocker {
  override get size() { return 3; }
}

test.each([
  [{ x: 5, y: 5 }, { x: 4, y: 5 }],
  [{ x: 5, y: 4 }, { x: 4, y: 4 }],
  [{ x: 5, y: 3 }, { x: 4, y: 3 }],
  [{ x: 6, y: 5 }, { x: 6, y: 6 }],
  [{ x: 6, y: 4 }, { x: 4, y: 4 }],
  [{ x: 6, y: 3 }, { x: 6, y: 2 }],
  [{ x: 7, y: 5 }, { x: 8, y: 5 }],
  [{ x: 7, y: 4 }, { x: 8, y: 4 }],
  [{ x: 7, y: 3 }, { x: 8, y: 3 }],
])("player underneath a 3x3 NPC at %p chooses %p", (playerLocation, expectedDestination) => {
  const region = new TestRegion(20, 20);
  region.world = new World();
  const player = new Player(region, playerLocation);
  const mob = new PathingNpc(region, { x: 5, y: 5 }, { aggro: player });
  region.addPlayer(player);
  region.addMob(mob);
  player.setAggro(mob);

  player.determineDestination();

  expect(player.destinationLocation).toEqual(expectedDestination);
});

test("player underneath a 3x3 NPC is pushed east when its west side is blocked", () => {
  const region = new TestRegion(20, 20);
  region.world = new World();
  const player = new Player(region, { x: 6, y: 4 });
  const mob = new PathingNpc(region, { x: 5, y: 5 }, { aggro: player });
  const blocker = new ThreeTileMovementBlocker(region, { x: 2, y: 5 });
  region.addPlayer(player);
  region.addMob(mob);
  region.addEntity(blocker);
  player.setAggro(mob);

  player.determineDestination();

  expect(player.destinationLocation).toEqual({ x: 8, y: 4 });
});
