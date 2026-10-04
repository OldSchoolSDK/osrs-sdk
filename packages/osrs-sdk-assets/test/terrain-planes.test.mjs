import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDecoder } from "../src/adapter.mts";
import { mergeAssets } from "../src/manifest.mts";

const reference = JSON.parse(readFileSync(new URL("./fixtures/terrain-tiles.json", import.meta.url), "utf8"));
const grid = (size, make) => Array.from({ length: size }, () => Array.from({ length: size }, make));

async function extractTerrain(tiles, heights) {
  class TestCache {
    onload = Promise.resolve();
    getMap() { return { tiles, getHeights: () => heights }; }
    getLoc() { return { locations: [] }; }
    getAllDefs() { return []; }
    getDef() { return { hue: 16, saturation: 64, lightness: 112 }; }
    getFile(_index, _archive, id) {
      return {
        def: { color: 4000 },
        content: id === 1 ? [1, 255, 0, 255, 0] : [1, 128, 128, 128, 0],
      };
    }
  }
  const decode = createDecoder({
    RSCache: TestCache,
    IndexType: { CONFIGS: { id: 2 } },
    ConfigType: { ITEM: { id: 10 }, UNDERLAY: { id: 1 }, OVERLAY: { id: 4 } },
  });
  const result = await decode({
    assets: mergeAssets({}, { regions: { arena: { id: 7216 } } }),
    semanticPoseMap: {},
    revision: 236,
  });
  const terrain = result.assets.find(asset => asset.id === "scene-7216-compiled-terrain");
  return terrain?.payload.chunks.flatMap(chunk => chunk.positions) ?? [];
}

for (const fixture of reference.cases) {
  test(`plane-1 shape ${fixture.shape}, rotation ${fixture.rotation}, underlay ${fixture.underlay}, transparent ${fixture.transparent} matches reference`, async () => {
    const tiles = [grid(64, () => ({})), grid(64, () => ({}))];
    const heights = [grid(65, () => fixture.baseHeight), grid(65, () => fixture.baseHeight + 240)];
    tiles[1][fixture.x][fixture.y] = {
      underlayId: fixture.underlay ? 1 : 0,
      overlayId: fixture.shape === 0 ? 0 : fixture.transparent ? 2 : 1,
      overlayPath: fixture.shape - 1,
      overlayRotation: fixture.rotation,
    };
    const [sw, se, ne, nw] = fixture.heights;
    heights[1][fixture.x][fixture.y] = sw;
    heights[1][fixture.x + 1][fixture.y] = se;
    heights[1][fixture.x + 1][fixture.y + 1] = ne;
    heights[1][fixture.x][fixture.y + 1] = nw;
    assert.deepEqual(await extractTerrain(tiles, heights), fixture.expected);
  });
}

test("both floors use plane-0 origin; unauthored upper tiles remain empty", async () => {
  const tiles = [grid(64, () => ({})), grid(64, () => ({}))];
  const heights = [grid(65, () => 400), grid(65, () => 912)];
  tiles[0][20][52] = { underlayId: 1 };
  const ground = await extractTerrain(tiles, heights);
  assert.equal(ground.length, 18);
  assert.deepEqual([...new Set(ground.filter((_, i) => i % 3 === 1))], [-0.002]);
  tiles[1][20][52] = { underlayId: 1 };
  const both = await extractTerrain(tiles, heights);
  assert.equal(both.length, 36);
  assert.deepEqual(both.slice(0, ground.length), ground);
  assert.deepEqual([...new Set(both.slice(ground.length).filter((_, i) => i % 3 === 1))], [3.998]);
});
