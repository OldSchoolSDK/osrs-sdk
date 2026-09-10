import { Manticore } from "../../src/content/mobs/Manticore";
import { Player } from "../../src/sdk/Player";
import { TestRegion } from "../../src/sdk/testing/TestRegion";
import { Viewport } from "../../src/sdk/Viewport";
import { World } from "../../src/sdk/World";

describe("Manticore coordination", () => {
  test("copies the established attack order of another living Manticore", () => {
    const region = new TestRegion(20, 20);
    const first = new Manticore(region, { x: 2, y: 5 });
    const second = new Manticore(region, { x: 10, y: 5 });
    region.mobs.push(first, second);

    first.attack();
    second.attack();

    expect((second as any).attackStyles).toEqual((first as any).attackStyles);
    expect((second as any).attackStyles).not.toBe((first as any).attackStyles);
  });

  test("an attacking Manticore offsets ready peers by five ticks", () => {
    const region = new TestRegion(20, 20);
    const world = new World();
    region.world = world;
    const attacker = new Manticore(region, { x: 2, y: 5 });
    const readyPeer = new Manticore(region, { x: 10, y: 5 });
    const waitingPeer = new Manticore(region, { x: 14, y: 5 });
    region.mobs.push(attacker, readyPeer, waitingPeer);
    (attacker as any).attackStyles = [0, 1, 2];
    readyPeer.attackDelay = 0;
    waitingPeer.attackDelay = 2;
    readyPeer.attackStep();

    attacker.didAttack();

    expect(readyPeer.attackDelay).toBe(5);
    expect(waitingPeer.attackDelay).toBe(2);
  });

  test("only the first Manticore fires when both become ready on the same tick", () => {
    const region = new TestRegion(30, 30);
    const world = new World();
    region.world = world;
    world.addRegion(region);
    const player = new Player(region, { x: 15, y: 15 });
    const first = new Manticore(region, { x: 2, y: 5 }, { aggro: player });
    const second = new Manticore(region, { x: 10, y: 5 }, { aggro: player });
    region.players.push(player);
    region.mobs.push(first, second);
    Viewport.viewport = { tick: jest.fn() } as never;
    (first as any).attackStyles = [0, 1, 2];
    (second as any).attackStyles = [0, 1, 2];
    first.attackDelay = 1;
    second.attackDelay = 1;

    world.tickWorld();

    expect((first as any).hasAttacked).toBe(true);
    expect((second as any).hasAttacked).toBe(false);
    expect(second.attackDelay).toBe(5);
  });
});
