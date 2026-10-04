import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contourModel } from "../src/scene-contour.mts";

// Independent reference: rs-map-viewer's decoded models and contourGround,
// sampled at the six Colosseum tiles reported during the grandstand investigation.
const reference = JSON.parse(readFileSync(new URL("./fixtures/grandstand-contours.json", import.meta.url), "utf8"));

for (const fixture of reference.cases) {
  test(`grandstand ${fixture.objectId} at ${fixture.trainer} matches rs-map-viewer (orientation ${fixture.orientation})`, () => {
    const model = {
      vertexCount: fixture.vertexPositionsX.length,
      vertexPositionsX: [...fixture.vertexPositionsX],
      vertexPositionsY: [...fixture.vertexPositionsY],
      vertexPositionsZ: [...fixture.vertexPositionsZ],
    };
    const terrain = {
      height: fixture.height,
      heightAt: (x, y) => fixture.heightGrid[x - fixture.gridOrigin[0]][y - fixture.gridOrigin[1]],
    };

    assert.equal(contourModel(model, fixture.location, 1, 1, terrain, 0), true);
    assert.deepEqual(model.vertexPositionsY, fixture.expectedY);
    assert.deepEqual(model.vertexPositionsX, fixture.vertexPositionsX);
    assert.deepEqual(model.vertexPositionsZ, fixture.vertexPositionsZ);
  });
}

test("flat terrain preserves the model's authored shape", () => {
  const model = {
    vertexCount: 3,
    vertexPositionsX: [-64, 0, 64],
    vertexPositionsY: [0, -32, 16],
    vertexPositionsZ: [-64, 0, 64],
  };
  const before = structuredClone(model);
  const terrain = { height: 1360, heightAt: () => 1360 };
  assert.equal(contourModel(model, { position: { localX: 21, localY: 52 } }, 1, 1, terrain, 0), false);
  assert.deepEqual(model, before);
});
