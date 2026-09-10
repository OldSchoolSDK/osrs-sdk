import { Manticore } from "../../src/content/mobs/Manticore";
import { TestRegion } from "../../src/sdk/testing/TestRegion";

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
    const attacker = new Manticore(region, { x: 2, y: 5 });
    const readyPeer = new Manticore(region, { x: 10, y: 5 });
    const waitingPeer = new Manticore(region, { x: 14, y: 5 });
    region.mobs.push(attacker, readyPeer, waitingPeer);
    (attacker as any).attackStyles = [0, 1, 2];
    readyPeer.attackDelay = 0;
    waitingPeer.attackDelay = 2;

    attacker.didAttack();

    expect(readyPeer.attackDelay).toBe(5);
    expect(waitingPeer.attackDelay).toBe(2);
  });
});
