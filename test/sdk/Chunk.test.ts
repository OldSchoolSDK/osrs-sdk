import { ChunkUtils } from "../../src/sdk/utils/Chunk";
import { World } from "../../src/sdk/World";
import { TestNpc } from "../../src/sdk/testing/TestNpc";
import { TestRegion } from "../../src/sdk/testing/TestRegion";

describe("chunk priority", () => {
  test("maps tiles to eight-tile chunks, including negative coordinates", () => {
    expect(ChunkUtils.fromLocation({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(ChunkUtils.fromLocation({ x: 7, y: 7 })).toEqual({ x: 0, y: 0 });
    expect(ChunkUtils.fromLocation({ x: 8, y: 8 })).toEqual({ x: 1, y: 1 });
    expect(ChunkUtils.fromLocation({ x: -1, y: -1 })).toEqual({ x: -1, y: -1 });
  });

  test("returns the NE-to-SW column-major priority grid in SDK coordinates", () => {
    expect(ChunkUtils.priorityGridOrder({ x: 4, y: 5 })).toEqual([
      { x: 5, y: 4 },
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 4, y: 4 },
      { x: 4, y: 5 },
      { x: 4, y: 6 },
      { x: 3, y: 4 },
      { x: 3, y: 5 },
      { x: 3, y: 6 },
    ]);
  });

  test("orders NPCs when they enter chunks and queries current membership", () => {
    const region = new TestRegion(32, 32);
    const world = new World();
    region.world = world;
    world.addRegion(region);
    const first = new TestNpc(region, { x: 1, y: 1 }, {});
    const second = new TestNpc(region, { x: 2, y: 2 }, {});

    region.addMob(first);
    region.addMob(second);

    expect(first.chunkOrder).toBeLessThan(second.chunkOrder);
    expect(region.getNpcsInChunk(0, 0)).toEqual([second, first]);
    expect(region.getNpcChunkPriority(second)).toBe(1);
    expect(region.getNpcChunkPriority(first)).toBe(2);

    first.setLocation({ x: 8, y: 2 });
    expect(first.chunkPosition).toEqual({ x: 1, y: 0 });
    expect(first.chunkOrder).toBeGreaterThan(second.chunkOrder);
    expect(region.getNpcsInChunk(0, 0)).toEqual([second]);
    expect(region.getNpcsInChunk(1, 0)).toEqual([first]);

    const orderAfterCrossing = first.chunkOrder;
    first.setLocation({ x: 9, y: 3 });
    expect(first.chunkOrder).toBe(orderAfterCrossing);

    first.setLocation({ x: 3, y: 3 });
    expect(region.getNpcsInChunk(0, 0)).toEqual([first, second]);
    expect(region.getNpcChunkPriority(first)).toBe(1);
    expect(region.getNpcChunkPriority(second)).toBe(2);
  });
});
