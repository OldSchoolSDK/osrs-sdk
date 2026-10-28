import * as THREE from "three";
import { TextDecoder, TextEncoder } from "util";

Object.defineProperty(globalThis, "TextDecoder", { value: TextDecoder, configurable: true });
import type { CacheRenderPayload } from "../src/cache-render-format";
import { CacheRender, CacheRenderBundle } from "../src/sdk/rendering/CacheRenderBundle";
import { CacheRenderInstancedModel } from "../src/sdk/rendering/CacheRenderInstancedModel";
import { CacheRenderReferences } from "../src/sdk/rendering/CacheRenderReference";
import type { Renderable } from "../src/sdk/Renderable";

// The suite replaces three.js with a stub. This file needs the real materials.
jest.mock("three", () => jest.requireActual("three"));

const triangle = [0, 0, 0, 1, 0, 0, 0, 1, 0];

function fadeFrame() {
  return {
    types: [5],
    maps: [[0]],
    indexFrameIds: [0],
    x: [32],
    y: [0],
    z: [0],
  };
}

function payload(kind: "opaque" | "fading"): CacheRenderPayload {
  const fading = kind === "fading";
  return {
    version: 2,
    positions: triangle,
    indices: [0, 1, 2],
    colors: [0xffffff, 0xffffff, 0xffffff],
    alphas: [0, 0, 0],
    alphaGroups: fading ? [[0, 1, 2]] : [],
    spotAnim: { id: 7, animationId: 3 },
    animations: {
      "3": {
        frames: [triangle],
        lengths: [30],
        rawFrames: fading ? [fadeFrame()] : [],
      },
    },
    poseMap: { "0": 3 },
  };
}

function encode(value: CacheRenderPayload): ArrayBuffer {
  const json = new TextEncoder().encode(JSON.stringify(value));
  const bytes = new Uint8Array(8 + json.length);
  bytes.set([79, 83, 82, 66]);
  new DataView(bytes.buffer).setUint32(4, json.length, true);
  bytes.set(json, 8);
  return bytes.buffer;
}

let bundleVersion = 0;

type DrawnKind = "spotAnim" | "asset";

function serve(kind: DrawnKind, body: CacheRenderPayload): void {
  const id = kind === "spotAnim" ? "spotanim-7" : "floor-asset";
  const bundle = {
    manifest: { bundleVersion: `instanced-alpha-${bundleVersion}` },
    assetIds: () => (kind === "asset" ? [id] : []),
    sharedAssetIds: () => [] as string[],
    spotAnimIds: () => (kind === "spotAnim" ? [id] : []),
    fetchAsset: async (assetId: string) => {
      if (assetId !== id) throw new Error(`unexpected asset ${assetId}`);
      return encode(body);
    },
  } as unknown as CacheRenderBundle;
  bundleVersion += 1;
  jest.spyOn(CacheRender, "bundle").mockResolvedValue(bundle);
}

async function drawn(kind: DrawnKind, body: CacheRenderPayload) {
  serve(kind, body);
  const reference =
    kind === "spotAnim" ? CacheRenderReferences.spotAnim([{ id: 7 }]) : CacheRenderReferences.asset("floor-asset");
  const model = new CacheRenderInstancedModel({ size: 1 } as Renderable, reference);
  await model.preload();
  const scene = new THREE.Scene();
  model.draw(scene, 0, 0, { x: 0, y: 0, z: 0 }, 0, 0, true, []);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const meshes: THREE.InstancedMesh[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) meshes.push(object);
  });
  if (meshes.length !== 1) throw new Error(`expected one instanced mesh, saw ${meshes.length}`);
  const material = meshes[0].material;
  if (Array.isArray(material) || !(material instanceof THREE.MeshBasicMaterial)) {
    throw new Error("expected one MeshBasicMaterial");
  }
  const alpha = meshes[0].geometry.getAttribute("cacheAlpha");
  const values = alpha ? Array.from(alpha.array) : [];
  return {
    transparent: material.transparent,
    depthWrite: material.depthWrite,
    discardsFadedFaces: material.onBeforeCompile.toString().includes("vCacheAlpha < 0.01"),
    alpha: values,
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

test("a type-5 spotanim fades its faces, and an opaque one stays solid", async () => {
  const faded = await drawn("spotAnim", payload("fading"));
  expect(faded).toEqual({
    transparent: true,
    depthWrite: false,
    discardsFadedFaces: true,
    alpha: [0, 0, 0],
  });

  const solid = await drawn("spotAnim", payload("opaque"));
  expect(solid).toEqual({
    transparent: false,
    depthWrite: true,
    discardsFadedFaces: false,
    alpha: [],
  });

  const asset = await drawn("asset", payload("fading"));
  expect(asset.transparent).toBe(true);
  expect(asset.depthWrite).toBe(true);
  expect(asset.alpha).toEqual([0, 0, 0]);
});
