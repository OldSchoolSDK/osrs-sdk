import { decodeCacheRenderPayload } from "../src/sdk/rendering/CacheRenderModel";
import { validateCacheRenderBundleManifest } from "../src/sdk/rendering/CacheRenderBundle";
import { TextDecoder, TextEncoder } from "util";

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
