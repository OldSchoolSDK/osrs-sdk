import { Entity } from "../../src/sdk/Entity";
import { Player } from "../../src/sdk/Player";
import { Viewport } from "../../src/sdk/Viewport";
import { World } from "../../src/sdk/World";
import { TestNpc } from "../../src/sdk/testing/TestNpc";
import { TestRegion } from "../../src/sdk/testing/TestRegion";
import { Projectile } from "../../src/sdk/weapons/Projectile";

describe("region lifecycle", () => {
  test("removing a mob from newMobs works before it is promoted to mobs", () => {
    const region = new TestRegion(10, 10);
    region.world = new World();
    const mob = new TestNpc(region, { x: 5, y: 5 }, {});
    region.addMob(mob);

    expect(region.newMobs).toContain(mob);

    region.removeMob(mob);

    expect(region.newMobs).not.toContain(mob);
    expect(region.mobs).not.toContain(mob);
  });

  test("getRenderables returns region-owned renderables and unit projectiles", () => {
    const region = new TestRegion(10, 10);
    const entity = new Entity(region, { x: 1, y: 1 });
    const player = new Player(region, { x: 2, y: 2 });
    const mob = new TestNpc(region, { x: 5, y: 5 }, {});
    const queuedMob = new TestNpc(region, { x: 6, y: 6 }, {});
    const regionProjectile = new Projectile(null, 0, player, { x: 3, y: 3, z: 0 }, "range");
    const incomingProjectile = new Projectile(null, 0, mob, player, "range");

    region.addEntity(entity);
    region.addPlayer(player);
    region.mobs.push(mob);
    region.newMobs.push(queuedMob);
    region.projectiles.push(regionProjectile);
    mob.incomingProjectiles.push(incomingProjectile);

    const renderables = region.getRenderables();

    expect(renderables).toEqual(
      expect.arrayContaining([entity, player, mob, queuedMob, regionProjectile, incomingProjectile]),
    );
  });

  test("world cleanup still removes mobs whose death state has completed", () => {
    const region = new TestRegion(10, 10);
    const world = new World();
    const mob = new TestNpc(region, { x: 5, y: 5 }, {});
    region.addMob(mob);
    region.world = world;
    world.addRegion(region);
    mob.dying = 0;
    Viewport.viewport = { tick: jest.fn() } as never;

    world.tickRegion(region);

    expect(region.mobs).not.toContain(mob);
  });

  test("units de-aggro when their target dies", () => {
    const region = new TestRegion(10, 10);
    const target = new TestNpc(region, { x: 5, y: 5 }, {});
    const attacker = new TestNpc(region, { x: 4, y: 5 }, {});
    const queuedAttacker = new TestNpc(region, { x: 6, y: 5 }, {});
    region.mobs.push(target, attacker);
    region.newMobs.push(queuedAttacker);
    attacker.setAggro(target);
    queuedAttacker.setAggro(target);

    target.dead();

    expect(attacker.aggro).toBeNull();
    expect(queuedAttacker.aggro).toBeNull();
  });
});
