import { applyBlendedRawFrames, applyRawFrame, decodeCacheRenderPayload } from "../src/sdk/rendering/CacheRenderModel";
import { validateCacheRenderBundleManifest } from "../src/sdk/rendering/CacheRenderBundle";
import { TextDecoder, TextEncoder } from "util";
import { gzipSync } from "fflate";

(global as any).TextDecoder = TextDecoder;

const sha = "a".repeat(64);
test("validates a versioned bundle manifest", () => {
  expect(validateCacheRenderBundleManifest({ schemaVersion: 1, bundleVersion: "test", cache: { revision: 1, source: "fixture", contentHash: sha }, assets: { body: { file: "body.bin", sha256: sha } }, references: { "npc:1": ["body"] } }).bundleVersion).toBe("test");
});
test("decodes binary render payloads", () => {
  const json = new TextEncoder().encode(JSON.stringify({ version: 1, positions: [0, 0, 0] }));
  const bytes = new Uint8Array(8 + json.length); bytes.set([79, 83, 82, 66]); new DataView(bytes.buffer).setUint32(4, json.length, true); bytes.set(json, 8);
  expect(decodeCacheRenderPayload(bytes.buffer).positions).toEqual([0, 0, 0]);
});
test("decodes gzip-compressed binary render payloads", () => {
  const json = new TextEncoder().encode(JSON.stringify({ version: 1, positions: [0, 0, 0] }));
  const compressed = gzipSync(json);
  const bytes = new Uint8Array(8 + compressed.length); bytes.set([79, 83, 82, 66]); new DataView(bytes.buffer).setUint32(4, compressed.length, true); bytes.set(compressed, 8);
  expect(decodeCacheRenderPayload(bytes.buffer).positions).toEqual([0, 0, 0]);
});

test("calculates animation pivots from cache vertices rather than expanded render vertices", () => {
  const positions = new Float32Array([
    0, 0, 0, 0, 0, 0, 0, 0, 0, // three face corners from source vertex 0
    2, 0, 0, // one face corner from source vertex 1
  ]);
  applyRawFrame(positions, [[0, 1, 2, 3]], [0, 0, 0, 1], {
    types: [0, 3], maps: [[0], [0]], indexFrameIds: [0, 1],
    x: [0, 0], y: [0, 128], z: [0, 128],
  });
  expect(Array.from(positions.filter((_value, index) => index % 3 === 0))).toEqual([1, 1, 1, 1]);
});

test("composes attack and pose frames using sequence transform slots", () => {
  const positions = new Float32Array([0, 0, 0, 0, 0, 0]);
  const common = { types: [0, 1, 1], maps: [[0, 1], [0], [1]], indexFrameIds: [0, 1, 2] };
  const attack = { ...common, x: [0, 128, 1280], y: [0, 0, 0], z: [0, 0, 0] };
  const pose = { ...common, x: [0, 256, 256], y: [0, 0, 0], z: [0, 0, 0] };
  applyBlendedRawFrames(positions, [[0], [1]], [0, 1], attack, pose, [2, 9999999]);
  // Attack owns non-interleaved slot 1; pose owns interleaved slot 2.
  expect(Array.from(positions, (value) => value || 0)).toEqual([1, 0, 0, 2, 0, 0]);
});
