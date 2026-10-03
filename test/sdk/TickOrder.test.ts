import { DelayedAction } from "../../src/sdk/DelayedAction";
import { Player } from "../../src/sdk/Player";
import { TestNpc } from "../../src/sdk/testing/TestNpc";
import { TestRegion } from "../../src/sdk/testing/TestRegion";
import { Viewport } from "../../src/sdk/Viewport";
import { World } from "../../src/sdk/World";
import { Projectile } from "../../src/sdk/weapons/Projectile";

class TurnNpc extends TestNpc {
  override get attackRange() { return 0; }
  override attackIfPossible() {}
}

describe("actor timer and queue ordering", () => {
  let region: TestRegion;
  let world: World;
  let player: Player;
  let mob: TurnNpc;

  beforeEach(() => {
    DelayedAction.reset();
    region = new TestRegion(40, 40);
    world = new World();
    region.world = world;
    world.addRegion(region);
    Viewport.viewport = { tick: jest.fn() } as never;
    player = new Player(region, { x: 20, y: 20 });
    mob = new TurnNpc(region, { x: 10, y: 10 }, {});
    mob.stunned = 0;
    region.addPlayer(player);
    region.addMob(mob);
  });

  test("NPC timers precede queues, player queues precede timers, and both precede movement", () => {
    const order: string[] = [];
    for (const [name, unit] of [["npc", mob], ["player", player]] as const) {
      for (const stage of ["timerStep", "queueStep", "movementStep", "attackStep"] as const) {
        const original = unit[stage].bind(unit);
        jest.spyOn(unit, stage).mockImplementation(() => {
          order.push(`${name}.${stage}`);
          original();
        });
      }
    }
    world.tickWorld();
    expect(order).toEqual([
      "npc.timerStep", "npc.queueStep", "npc.movementStep", "npc.attackStep",
      "player.queueStep", "player.timerStep", "player.movementStep", "player.attackStep",
    ]);
  });

  test("NPC queued damage is visible before movement and is processed once", () => {
    mob.addProjectile(new Projectile(null, 20, player, mob, "stab", { setDelay: 1 }));
    const queue = jest.spyOn(mob, "processIncomingAttacks");
    const movement = jest.spyOn(mob, "movementStep").mockImplementation(() => {
      expect(mob.currentStats.hitpoint).toBe(105);
    });
    world.tickWorld();
    expect(queue).toHaveBeenCalledTimes(1);
    expect(movement).toHaveBeenCalledTimes(1);
    world.tickWorld();
    expect(mob.currentStats.hitpoint).toBe(105);
  });

  test("NPC attacks can hit the player this tick; player attacks enter the next NPC queue", () => {
    jest.spyOn(mob, "attackIfPossible").mockImplementationOnce(() => {
      player.addProjectile(new Projectile(null, 10, mob, player, "stab", { setDelay: 1 }));
    });
    jest.spyOn(player, "attackIfPossible").mockImplementationOnce(() => {
      mob.addProjectile(new Projectile(null, 20, player, mob, "stab", { setDelay: 1 }));
    });
    world.tickWorld();
    expect(player.currentStats.hitpoint).toBe(89);
    expect(mob.currentStats.hitpoint).toBe(125);
    world.tickWorld();
    expect(mob.currentStats.hitpoint).toBe(105);
  });

  test("an expired cooldown is visible in the queue and a new cooldown is not decremented again", () => {
    mob.attackDelay = 1;
    jest.spyOn(mob, "queueStep").mockImplementation(() => {
      expect(mob.attackDelay).toBe(0);
      mob.attackDelay = 7;
    });
    world.tickWorld();
    expect(mob.attackDelay).toBe(7);
  });

  test("a five-tick freeze set in the queue blocks this turn and the next four", () => {
    mob.setAggro(player);
    jest.spyOn(mob, "queueStep").mockImplementationOnce(() => mob.freeze(5));
    world.tickWorld(5);
    expect(mob.location).toEqual({ x: 10, y: 10 });
    expect(mob.frozen).toBe(1);
    world.tickWorld();
    expect(mob.frozen).toBe(0);
    expect(mob.location).not.toEqual({ x: 10, y: 10 });
  });

  test("startup stun counts are consumed before actions", () => {
    mob.stunned = 5;
    mob.setAggro(player);
    world.tickWorld(4);
    expect(mob.location).toEqual({ x: 10, y: 10 });
    world.tickWorld();
    expect(mob.location).not.toEqual({ x: 10, y: 10 });
  });

  test("spawn delay holds startup stun while incoming hits and attack clocks advance", () => {
    mob.age = 3;
    mob.stunned = 2;
    mob.attackDelay = 6;
    mob.setAggro(player);
    mob.addProjectile(new Projectile(null, 20, player, mob, "stab", { setDelay: 1 }));
    world.tickWorld(2);
    expect(mob.currentStats.hitpoint).toBe(105);
    expect(mob.attackDelay).toBe(4);
    expect(mob.stunned).toBe(2);
    expect(mob.location).toEqual({ x: 10, y: 10 });
    world.tickWorld();
    expect(mob.stunned).toBe(1);
    expect(mob.location).toEqual({ x: 10, y: 10 });
    world.tickWorld();
    expect(mob.stunned).toBe(0);
    expect(mob.location).not.toEqual({ x: 10, y: 10 });
  });

  test.each(["npc", "player"] as const)("%s retaliation preserves the effective flinch delay", (target) => {
    const to = target === "npc" ? mob : player;
    const from = target === "npc" ? player : mob;
    to.autoRetaliate = true;
    to.addProjectile(new Projectile(null, 10, from, to, "stab", { setDelay: 1 }));
    jest.spyOn(to, "attackIfPossible").mockImplementation(() => {});
    world.tickWorld();
    expect(to.aggro).toBe(from);
    expect(to.attackDelay).toBe(to.flinchDelay);
  });

  test("GET READY holds NPC clocks and damage queues while consuming the player movement lock", () => {
    world.getReadyTimer = 1;
    mob.attackDelay = 6;
    player.attackDelay = 4;
    player.freeze(3);
    player.running = false;
    player.moveTo(21, 20);
    player.addProjectile(new Projectile(null, 10, mob, player, "stab", { setDelay: 1 }));
    world.tickWorld();
    expect(mob.attackDelay).toBe(6);
    expect(player.attackDelay).toBe(4);
    expect(player.currentStats.hitpoint).toBe(99);
    expect(player.frozen).toBe(2);
    world.getReadyTimer = 0;
    world.tickWorld();
    expect(mob.attackDelay).toBe(5);
    expect(player.attackDelay).toBe(3);
    expect(player.currentStats.hitpoint).toBe(89);
    expect(player.location).toEqual({ x: 20, y: 20 });
    world.tickWorld();
    expect(player.location).toEqual({ x: 21, y: 20 });
  });

  test("lethal queued damage prevents movement and attacks before turn-end death processing", () => {
    mob.setAggro(player);
    mob.addProjectile(new Projectile(null, 125, player, mob, "stab", { setDelay: 1 }));
    world.tickWorld();
    expect(mob.location).toEqual({ x: 10, y: 10 });
    expect(mob.canAttack()).toBe(false);
    expect(mob.dying).toBe(mob.deathAnimationLength);
  });
});
