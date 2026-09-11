import { BasePrayer } from "../../src/sdk/BasePrayer";
import type { Player } from "../../src/sdk/Player";

function playerWithPrayerLevel(level: number): Player {
  const prayer = new BasePrayer();
  return {
    stats: { prayer: level },
    prayerController: { prayers: [prayer] },
  } as unknown as Player;
}

describe("BasePrayer client and server state", () => {
  test("updates the lit state before the server-active state", () => {
    const player = playerWithPrayerLevel(99);
    const prayer = player.prayerController.prayers[0];

    expect(prayer.toggleClient(player)).toBe(true);
    expect(prayer.isLit).toBe(true);
    expect(prayer.isActive).toBe(false);

    prayer.toggleServer(player);
    expect(prayer.isLit).toBe(true);
    expect(prayer.isActive).toBe(false);

    prayer.tick();
    expect(prayer.isLit).toBe(true);
    expect(prayer.isActive).toBe(true);
  });

  test("preserves repeated toggle order before the server tick", () => {
    const player = playerWithPrayerLevel(99);
    const prayer = player.prayerController.prayers[0];

    prayer.toggleClient(player);
    prayer.toggleClient(player);
    prayer.toggleServer(player);
    prayer.toggleServer(player);
    prayer.tick();

    expect(prayer.isLit).toBe(false);
    expect(prayer.isActive).toBe(false);
  });
});
