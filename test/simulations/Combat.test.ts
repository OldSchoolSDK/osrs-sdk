import { Player } from "../../src/sdk/Player";
import { World } from "../../src/sdk/World";
import { Blowpipe } from "../../src/content/weapons/Blowpipe";
import { TwistedBow } from "../../src/content/weapons/TwistedBow";
import { Random } from "../../src/sdk/Random";
import { Viewport } from "../../src/sdk/Viewport";
import { TestRegion } from "../../src/sdk/testing/TestRegion";
import { TestNpc } from "../../src/sdk/testing/TestNpc";
import { Settings } from "../../src";
import { MeleeWeapon } from "../../src/sdk/weapons/MeleeWeapon";
import { DelayedAction } from "../../src/sdk/DelayedAction";
import { ScytheOfVitur } from "../../src/content/weapons/ScytheOfVitur";
import { DragonClaws } from "../../src/content/weapons/DragonClaws";

describe("basic combat scenario", () => {
  test("when player tries to kill a fake jalxil...", () => {
    Settings.inputDelay = 0;
    const region = new TestRegion(60, 60);
    const world = new World();
    region.world = world;
    world.addRegion(region);
    const player = new Player(region, { x: 30, y: 60 });
    region.addPlayer(player);
    Viewport.setupViewport(region, document.createElement("canvas"), document.createElement("div"), true);
    Viewport.viewport.setPlayer(player);

    new TwistedBow().inventoryLeftClick(player);
    const jalxil = new TestNpc(region, { x: 25, y: 25 }, { aggro: player });
    region.addMob(jalxil);
    world.tickWorld(30);
    player.prayerController.findPrayerByName("Protect from Range").activate(player);
    player.setAggro(jalxil);
    world.tickWorld(20);
    expect(player.location).toEqual({ x: 30, y: 54 });
    expect(player.currentStats.hitpoint).toBe(41);
    expect(player.equipment.weapon.itemName).toEqual("Twisted Bow");
    expect(jalxil.location).toEqual({ x: 30, y: 45 });
    expect(jalxil.currentStats.hitpoint).toBe(124);

    player.moveTo(jalxil.location.x, jalxil.location.y);
    player.prayerController.findPrayerByName("Rigour").activate(player);
    const blowpipe = new Blowpipe();
    blowpipe.inventoryLeftClick(player);
    expect(player.equipment.weapon.itemName).toEqual("Toxic Blowpipe");
    expect(player.aggro).toEqual(null);

    world.tickWorld(10);
    player.setAggro(jalxil);
    world.tickWorld(5);
    expect(player.aggro).toEqual(jalxil);

    world.tickWorld(80);
    expect(player.location).toEqual({ x: 30, y: 45 });
    expect(player.currentStats.prayer).toEqual(39);
    expect(jalxil.location).toEqual({ x: 30, y: 44 });
    expect(jalxil.currentStats.hitpoint).toBe(0);
    expect(player.currentStats.hitpoint).toBe(33);
    expect(world.globalTickCounter).toEqual(145);
    expect(Random.callCount).toEqual(78);
  });

  test("red-x prevents random walk", () => {
    Settings.inputDelay = 0;
    const region = new TestRegion(60, 60);
    const world = new World();
    region.world = world;
    world.addRegion(region);
    // player is under the jalxil
    const player = new Player(region, { x: 26, y: 25 });
    region.addPlayer(player);
    Viewport.setupViewport(region, document.createElement("canvas"), document.createElement("div"), true);
    Viewport.viewport.setPlayer(player);

    new TwistedBow().inventoryLeftClick(player);
    const jalxil = new TestNpc(region, { x: 25, y: 25 }, { aggro: player });
    region.addMob(jalxil);

    world.tickWorld();
  });

  test("a max-damage-roll buff guarantees the next attack hits for its maximum damage", () => {
    const region = new TestRegion(10, 10);
    const attacker = new TestNpc(region, { x: 4, y: 5 }, {});
    const target = new TestNpc(region, { x: 5, y: 5 }, {});
    const weapon = new MeleeWeapon();
    const bonuses = {};
    const originalRandom = Random.randomFn;
    // This always fails an ordinary accuracy roll against the target, so the
    // max-damage-roll mechanic must bypass accuracy rather than merely fixing
    // the damage after a successful roll.
    Random.setRandom(() => 1);
    attacker.grantMaxDamageRollsOnNextAttack();

    weapon.attack(attacker, target, bonuses);

    expect(weapon.damageRoll).toBe(weapon._maxHit(attacker, target, bonuses));
    expect(attacker.forceMaxDamageRollsOnNextAttack).toBe(true);
    DelayedAction.tick();
    expect(attacker.forceMaxDamageRollsOnNextAttack).toBe(false);
    Random.setRandom(originalRandom);
  });

  test("a max-damage-roll buff applies to every Scythe hitsplat in its attack tick", () => {
    const region = new TestRegion(10, 10);
    const attacker = new TestNpc(region, { x: 4, y: 4 }, {});
    const target = new TestNpc(region, { x: 5, y: 5 }, {});
    const scythe = new ScytheOfVitur();
    const originalRandom = Random.randomFn;
    Random.setRandom(() => 0);
    attacker.grantMaxDamageRollsOnNextAttack();

    scythe.attack(attacker, target, {});

    expect(target.incomingProjectiles).toHaveLength(3);
    expect(target.incomingProjectiles.every((projectile) => projectile.damage > 0)).toBe(true);
    DelayedAction.tick();
    expect(attacker.forceMaxDamageRollsOnNextAttack).toBe(false);
    Random.setRandom(originalRandom);
  });

  test("Dragon Claws special attack creates four linked hitsplats after its first successful accuracy roll", () => {
    const region = new TestRegion(10, 10);
    const attacker = new TestNpc(region, { x: 4, y: 5 }, {});
    const target = new TestNpc(region, { x: 5, y: 5 }, {});
    const claws = new DragonClaws();
    const originalRandom = Random.randomFn;
    Random.setRandom(() => 0);

    claws.specialAttack(attacker, target);

    const hits = target.incomingProjectiles.map((projectile) => projectile.damage);
    expect(hits).toHaveLength(4);
    expect(target.incomingProjectiles.map((projectile) => projectile.remainingDelay)).toEqual([1, 1, 2, 2]);
    expect(hits[0]).toBeGreaterThan(0);
    expect(hits[1]).toBe(Math.floor(hits[0] / 2));
    expect(hits[2]).toBe(Math.floor(hits[1] / 2));
    expect(hits[3]).toBe(hits[2] + 1);
    Random.setRandom(originalRandom);
  });
});
