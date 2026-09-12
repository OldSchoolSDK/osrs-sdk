import { CACHE_ASSETS } from "../../src/assets/CacheAssets";
import { VenatorBow } from "../../src/content/weapons/VenatorBow";
import {
  canVenatorBounce,
  getNextVenatorBounceTarget,
  getVenatorCenterTile,
} from "../../src/content/weapons/VenatorBounce";
import { AttackStylesController } from "../../src/sdk/AttackStylesController";
import { cacheSound } from "../../src/sdk/audio/CacheSoundEffects";
import { Player } from "../../src/sdk/Player";
import { Random } from "../../src/sdk/Random";
import { TestNpc } from "../../src/sdk/testing/TestNpc";
import { TestRegion } from "../../src/sdk/testing/TestRegion";

class OneTileNpc extends TestNpc {
  override get size() {
    return 1;
  }
}

describe("Venator bow", () => {
  beforeEach(() => {
    AttackStylesController.controller = new AttackStylesController();
  });

  test("uses the north-east inner tile as the centre of a 4x4 NPC", () => {
    expect(getVenatorCenterTile(10, 20, 4)).toEqual([12, 18]);
    expect(getVenatorCenterTile(10, 20, 6)).toEqual([13, 17]);
    expect(getVenatorCenterTile(10, 20, 8)).toEqual([14, 16]);
    expect(() => getVenatorCenterTile(10, 20, 0)).toThrow("Unsupported NPC size 0");
    expect(canVenatorBounce(0, 0, 1, 0, -1, 4)).toBe(false);
    expect(canVenatorBounce(0, 0, 1, 0, 4, 4)).toBe(true);
  });

  test("applies both geometry constraints and centre-to-closest-tile LOS", () => {
    const checks: [[number, number], [number, number]][] = [];
    expect(canVenatorBounce(7, 11, 2, 8, 12, 4, (from, to) => {
      checks.push([from, to]);
      return true;
    })).toBe(true);
    expect(checks).toEqual([[[7, 11], [8, 11]]]);
    expect(canVenatorBounce(0, 0, 1, 2, 2, 1, () => false)).toBe(false);
    expect(canVenatorBounce(0, 0, 1, 3, 0, 1)).toBe(false);
  });

  test("selects by chunk grid priority and then most recent chunk entrant", () => {
    const region = new TestRegion(24, 24);
    const source = new OneTileNpc(region, { x: 7, y: 7 }, {});
    const currentChunkTarget = new OneTileNpc(region, { x: 6, y: 7 }, {});
    const olderEastTarget = new OneTileNpc(region, { x: 8, y: 7 }, {});
    const newerEastTarget = new OneTileNpc(region, { x: 8, y: 6 }, {});
    region.addMob(source);
    region.addMob(currentChunkTarget);
    region.addMob(olderEastTarget);
    region.addMob(newerEastTarget);

    expect(getNextVenatorBounceTarget(source)).toBe(newerEastTarget);
  });

  test("queues independent scaled hits and visual-only target-to-target ricochets", () => {
    const region = new TestRegion(24, 24);
    const player = new Player(region, { x: 4, y: 7 });
    const primary = new OneTileNpc(region, { x: 7, y: 7 }, {});
    const third = new OneTileNpc(region, { x: 9, y: 7 }, {});
    const second = new OneTileNpc(region, { x: 8, y: 7 }, {});
    region.addPlayer(player);
    region.addMob(primary);
    // Within the east chunk, the later entrant is considered first.
    region.addMob(third);
    region.addMob(second);

    const bow = new VenatorBow();
    player.equipment.weapon = bow;
    const originalRandom = Random.randomFn;
    let randomCall = 0;
    Random.setRandom(() => randomCall++ % 2 === 0 ? 0 : 0.999999);

    bow.attack(player, primary, { attackStyle: "range" });

    const primaryHit = primary.incomingProjectiles[0];
    const secondHit = second.incomingProjectiles[0];
    const thirdHit = third.incomingProjectiles[0];
    expect(primaryHit.remainingDelay).toBe(1);
    expect(secondHit.remainingDelay).toBe(1);
    expect(thirdHit.remainingDelay).toBe(2);
    expect(secondHit.damage).toBe(Math.floor(primaryHit.damage * 0.66));
    expect(thirdHit.damage).toBe(Math.floor(primaryHit.damage * 0.66));
    expect(secondHit.options.visuals.hidden).toBe(true);
    expect(thirdHit.options.visuals.hidden).toBe(true);
    expect(primaryHit.options.visuals.endCycleOffset).toBe(10);
    expect(primaryHit.options.sound.src).toBe(cacheSound(CACHE_ASSETS.sounds.venatorBowAttack.id));
    expect(secondHit.options.sound.src).toBe(cacheSound(CACHE_ASSETS.sounds.venatorBowRicochetFirst.id));
    expect(thirdHit.options.sound.src).toBe(cacheSound(CACHE_ASSETS.sounds.venatorBowRicochetSecond.id));

    const visibleProjectiles = region.projectileGraphics.filter((graphic) => !graphic.projectile.options.visuals.hidden);
    expect(visibleProjectiles).toHaveLength(3);
    expect(visibleProjectiles.map((graphic) => graphic.projectile.options.visuals.spotAnim?.id)).toEqual([
      CACHE_ASSETS.spotAnims.venatorBowProjectile.id,
      CACHE_ASSETS.spotAnims.venatorBowRicochetProjectile.id,
      CACHE_ASSETS.spotAnims.venatorBowRicochetProjectile.id,
    ]);
    expect(visibleProjectiles[1].projectile.from).toBe(primary);
    expect(visibleProjectiles[1].projectile.to).toBe(second);
    expect(visibleProjectiles[1].projectile.options.visuals.startCycleOffset).toBe(10);
    expect(visibleProjectiles[1].projectile.options.visuals.endCycleOffset).toBe(20);
    expect(visibleProjectiles[2].projectile.from).toBe(second);
    expect(visibleProjectiles[2].projectile.to).toBe(third);
    expect(visibleProjectiles[2].projectile.options.visuals.startCycleOffset).toBe(20);
    expect(visibleProjectiles[2].projectile.options.visuals.endCycleOffset).toBe(30);
    expect(player.spotAnims).toHaveLength(1);

    Random.setRandom(originalRandom);
  });
});
