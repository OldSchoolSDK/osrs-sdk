import { InvisibleMovementBlocker } from "../../src/content/MovementBlocker";
import { Pathing } from "../../src/sdk/Pathing";
import { Player } from "../../src/sdk/Player";
import { TestNpc } from "../../src/sdk/testing/TestNpc";
import { TestRegion } from "../../src/sdk/testing/TestRegion";
import { World } from "../../src/sdk/World";

class PathingNpc extends TestNpc {
  override get attackRange() { return 0; }
}

class OneTilePathingNpc extends PathingNpc {
  override get size() { return 1; }
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

test("NPC movement claims are resolved in movement order", () => {
  const region = new TestRegion(20, 20);
  const world = new World();
  region.world = world;
  world.addRegion(region);

  const player = new Player(region, { x: 10, y: 5 });
  const leader = new OneTilePathingNpc(region, { x: 5, y: 5 }, { aggro: player });
  const follower = new OneTilePathingNpc(region, { x: 4, y: 5 }, { aggro: player });
  leader.stunned = 0;
  follower.stunned = 0;
  region.addPlayer(player);
  region.addMob(leader);
  region.addMob(follower);

  leader.movementStep();
  follower.movementStep();

  expect(leader.location).toEqual({ x: 6, y: 5 });
  expect(follower.location).toEqual({ x: 5, y: 5 });
});

test("an NPC which fails to move reclaims its current tile", () => {
  const region = new TestRegion(20, 20);
  const world = new World();
  region.world = world;
  world.addRegion(region);

  const player = new Player(region, { x: 10, y: 5 });
  const blocker = new OneTilePathingNpc(region, { x: 6, y: 5 }, {});
  const blocked = new OneTilePathingNpc(region, { x: 5, y: 5 }, { aggro: player });
  const follower = new OneTilePathingNpc(region, { x: 4, y: 5 }, { aggro: player });
  blocked.stunned = 0;
  follower.stunned = 0;
  region.addPlayer(player);
  region.addMob(blocker);
  region.addMob(blocked);
  region.addMob(follower);

  blocked.movementStep();
  follower.movementStep();

  expect(blocked.location).toEqual({ x: 5, y: 5 });
  expect(follower.location).toEqual({ x: 4, y: 5 });
  expect(region.hasTileCollisionFlags(5, 5, 1)).toBe(true);
});

test("an NPC which is not trying to move leaves its existing claim in place", () => {
  const region = new TestRegion(20, 20);
  const world = new World();
  region.world = world;
  world.addRegion(region);

  const player = new Player(region, { x: 10, y: 5 });
  const stationary = new OneTilePathingNpc(region, { x: 6, y: 5 }, { aggro: player });
  const mover = new OneTilePathingNpc(region, { x: 5, y: 5 }, { aggro: player });
  stationary.stunned = 0;
  mover.stunned = 0;
  region.addPlayer(player);
  region.addMob(stationary);
  region.addMob(mover);

  // Simulate the attackable (line-of-sight plus range) state discussed by the
  // client clipping rules. The NPC does not enter the movement branch.
  jest.spyOn(stationary, "canMove").mockReturnValue(false);
  stationary.movementStep();
  mover.movementStep();

  expect(stationary.location).toEqual({ x: 6, y: 5 });
  expect(mover.location).toEqual({ x: 5, y: 5 });
});

test("setting an NPC location transfers its persistent claim", () => {
  const region = new TestRegion(20, 20);
  region.world = new World();
  const mob = new OneTilePathingNpc(region, { x: 5, y: 5 }, {});
  region.addMob(mob);

  mob.setLocation({ x: 8, y: 7 });

  expect(region.hasTileCollisionFlags(5, 5, 1)).toBe(false);
  expect(region.hasTileCollisionFlags(8, 7, 1)).toBe(true);
});

test("ordinary pathing ignores persistent tile collision flags", () => {
  const region = new TestRegion(20, 20);
  region.world = new World();
  const mob = new OneTilePathingNpc(region, { x: 5, y: 5 }, {});
  region.addMob(mob);

  expect(Pathing.canTileBePathedTo(region, 5, 5, 1)).toBe(true);
  expect(Pathing.canTileBePathedTo(region, 5, 5, 1, true)).toBe(false);
});

test("player movement transfers its tile collision flag", () => {
  const region = new TestRegion(20, 20);
  region.world = new World();
  const player = new Player(region, { x: 2, y: 5 });
  region.addPlayer(player);
  player.running = false;
  player.destinationLocation = { x: 5, y: 5 };

  player.moveTowardsDestination();

  expect(player.location).toEqual({ x: 3, y: 5 });
  expect(region.hasTileCollisionFlags(2, 5, 1)).toBe(false);
  expect(region.hasTileCollisionFlags(3, 5, 1)).toBe(true);
});

test("player movement clears collision flags from every traversed visual-path tile", () => {
  const region = new TestRegion(20, 20);
  region.world = new World();
  const player = new Player(region, { x: 2, y: 5 });
  const stationaryMob = new OneTilePathingNpc(region, { x: 3, y: 5 }, {});
  region.addPlayer(player);
  region.addMob(stationaryMob);
  player.running = true;
  player.destinationLocation = { x: 6, y: 5 };

  player.moveTowardsDestination();

  expect(player.visualPath.map(({ x, y }) => ({ x, y }))).toEqual([
    { x: 3, y: 5 },
    { x: 4, y: 5 },
  ]);
  expect(region.hasTileCollisionFlags(2, 5, 1)).toBe(false);
  expect(region.hasTileCollisionFlags(3, 5, 1)).toBe(false);
  expect(region.hasTileCollisionFlags(4, 5, 1)).toBe(true);
});
