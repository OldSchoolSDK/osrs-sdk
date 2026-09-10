import { Player } from "../../src/sdk/Player";
import { Settings } from "../../src/sdk/Settings";
import { TestNpc } from "../../src/sdk/testing/TestNpc";
import { TestRegion } from "../../src/sdk/testing/TestRegion";
import { Projectile } from "../../src/sdk/weapons/Projectile";

describe("ProjectileGraphic", () => {
  test("advances visually on client ticks without advancing the combat projectile", () => {
    const region = new TestRegion(20, 20);
    const from = new TestNpc(region, { x: 2, y: 2 }, {});
    const to = new Player(region, { x: 12, y: 2 });
    const projectile = new Projectile(null, 10, from, to, "range", { setDelay: 2 });
    to.addProjectile(projectile);

    const start = projectile.graphic.getPerceivedLocation(0);
    for (let cycle = 0; cycle < 15; cycle++) projectile.graphic.clientTick();
    const afterClientTicks = projectile.graphic.getPerceivedLocation(0);

    expect(afterClientTicks.x).toBeGreaterThan(start.x);
    expect(projectile.remainingDelay).toBe(2);
    expect(projectile.age).toBe(0);

    projectile.onTick();
    expect(projectile.remainingDelay).toBe(1);
    expect(projectile.age).toBe(1);
  });

  test("converts legacy visual game-tick offsets to client cycles", () => {
    const region = new TestRegion(20, 20);
    const from = new TestNpc(region, { x: 2, y: 2 }, {});
    const to = new Player(region, { x: 12, y: 2 });
    const projectile = new Projectile(null, 10, from, to, "range", {
      setDelay: 3,
      visuals: {
        visualDelayTicks: 1,
        visualHitEarlyTicks: 1,
      },
    });
    const cyclesPerGameTick = Math.round(Settings.tickMs / 20);

    for (let cycle = 0; cycle < cyclesPerGameTick; cycle++) projectile.graphic.clientTick();
    expect(projectile.graphic.visible()).toBe(false);

    projectile.graphic.clientTick();
    expect(projectile.graphic.visible()).toBe(true);

    for (let cycle = cyclesPerGameTick + 1; cycle < 2 * cyclesPerGameTick; cycle++) {
      projectile.graphic.clientTick();
    }
    expect(projectile.graphic.visible()).toBe(true);
    projectile.graphic.clientTick();
    expect(projectile.graphic.shouldDestroy()).toBe(true);
  });

  test("accepts exact client-cycle start and end offsets", () => {
    const region = new TestRegion(20, 20);
    const from = new TestNpc(region, { x: 2, y: 2 }, {});
    const to = new Player(region, { x: 12, y: 2 });
    const projectile = new Projectile(null, 10, from, to, "range", {
      setDelay: 10,
      visuals: {
        startCycleOffset: 2,
        endCycleOffset: 4,
      },
    });

    projectile.graphic.clientTick();
    projectile.graphic.clientTick();
    expect(projectile.graphic.visible()).toBe(false);
    projectile.graphic.clientTick();
    expect(projectile.graphic.visible()).toBe(true);
    projectile.graphic.clientTick();
    expect(projectile.graphic.visible()).toBe(true);
    projectile.graphic.clientTick();
    expect(projectile.graphic.shouldDestroy()).toBe(true);
    expect(projectile.remainingDelay).toBe(10);
  });

  test("accepts a client-cycle end offset relative to the combat hit", () => {
    const region = new TestRegion(20, 20);
    const from = new TestNpc(region, { x: 2, y: 2 }, {});
    const to = new Player(region, { x: 12, y: 2 });
    const projectile = new Projectile(null, 10, from, to, "range", {
      setDelay: 3,
      visuals: {
        startCycleOffset: 30,
        hitEarlyCycleOffset: 30,
      },
    });

    for (let cycle = 0; cycle < 60; cycle++) projectile.graphic.clientTick();
    expect(projectile.graphic.visible()).toBe(true);
    projectile.graphic.clientTick();
    expect(projectile.graphic.shouldDestroy()).toBe(true);
  });
});
