import * as THREE from "three";
import { TextEncoder, TextDecoder } from "util";
import { CacheRenderModel } from "../src/sdk/rendering/CacheRenderModel";
import { CacheRender } from "../src/sdk/rendering/CacheRenderBundle";
import { Settings } from "../src/sdk/Settings";
import { Viewport3d } from "../src/sdk/Viewport3d";
import { World } from "../src/sdk/World";
import { Actor } from "../src/sdk/rendering/Actor";
import { interpolateRawFrames, sampleAnimation } from "../src/sdk/rendering/utils/animations";
import type { CacheRenderAnimation, CacheRenderPayload, CacheRenderRawFrame } from "../src/cache-render-format";

(global as any).TextDecoder = TextDecoder;
jest.mock("three", () => ({
  ...jest.requireActual("three"),
  GLTFLoader: class {
    setMeshoptDecoder() {}
  },
}));

const rotation = (angle: number): CacheRenderRawFrame => ({
  baseId: 1,
  types: [2],
  maps: [[0]],
  indexFrameIds: [0],
  x: [0],
  y: [0],
  z: [angle],
});
const translation = (amount: number): CacheRenderRawFrame => ({
  baseId: 1,
  types: [1],
  maps: [[0]],
  indexFrameIds: [0],
  x: [amount],
  y: [0],
  z: [0],
});
const animation = (frames: CacheRenderRawFrame[], lengths = [4, 4]): CacheRenderAnimation => ({
  frames: [],
  rawFrames: frames,
  lengths,
});

let fixtureId = 0;
async function fixture(
  animations: Record<string, CacheRenderAnimation>,
  extra: Partial<CacheRenderPayload> = {},
  effect?: CacheRenderPayload,
) {
  const payload = {
    version: 2,
    positions: [1, 0, 0, 1, 0, 0, 1, 0, 0],
    indices: [0, 1, 2],
    sourceVertices: [0, 1, 2],
    vertexGroups: [[0, 1, 2]],
    alphas: [0, 0, 0],
    alphaGroups: [[0, 1, 2]],
    poseMap: { 0: 100 },
    animations,
    ...extra,
  };
  const encode = (value: unknown) => {
    const json = new TextEncoder().encode(JSON.stringify(value));
    const bytes = new Uint8Array(8 + json.length);
    bytes.set([79, 83, 82, 66]);
    new DataView(bytes.buffer).setUint32(4, json.length, true);
    bytes.set(json, 8);
    return bytes.buffer;
  };
  jest
    .spyOn(CacheRender, "bundle")
    .mockResolvedValue({
      manifest: { bundleVersion: `animation-cycle-${fixtureId++}` },
      assetIds: () => ["body"],
      sharedAssetIds: () => [],
      spotAnimIds: () => [],
      allSpotAnimIds: () => (effect ? ["effect"] : []),
      fetchAsset: async (id: string) => encode(id === "effect" ? effect : payload),
    } as any);
  const renderable = {
    size: 1,
    selectable: false,
    spotAnims: effect ? [{ id: effect.spotAnim!.id }] : [],
    animationIndex: 0,
    shouldBlendAnimationWithPose: true,
    clickboxRadius: null,
    setAnimationListener: jest.fn(),
    getTrueLocation: () => ({ x: 0, y: 0 }),
    get3dModel: () => model,
  };
  const model = new CacheRenderModel(renderable as any, { kind: "model", modelId: 1 });
  await model.preload();
  const scene = new THREE.Scene();
  const draw = (fraction = 0) => model.draw(scene, 1 / 120, 0, { x: 0, y: 0, z: 0 }, 0, 0, true, [], fraction);
  const cycle = () => { model.clientTick(); draw(); };
  const position = (model as any).mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
  const sound = jest.spyOn((model as any).frameSoundPlayer, "advance");
  return { model, draw, cycle, position, sound, renderable };
}

afterEach(() => {
  jest.restoreAllMocks();
  Settings.smoothCacheAnimations = true;
});

test("draws at the same client fraction reuse geometry; only ticks advance sounds", async () => {
  const { model, draw, cycle, position, sound } = await fixture({ 100: animation([rotation(0), rotation(64)]) });
  cycle(); // frame zero
  const version = position.version;
  for (let i = 0; i < 12; i++) draw();
  expect(position.version).toBe(version);
  expect(sound).toHaveBeenCalledTimes(1);
  cycle();
  cycle(); // midpoint of the four-cycle frame
  expect(position.getX(0)).toBeCloseTo(Math.SQRT1_2); // floating-point 45-degree rotation
  expect(position.getY(0)).toBeCloseTo(Math.SQRT1_2);
  expect(sound).toHaveBeenCalledTimes(3);
  expect((model as any).mesh.geometry.getAttribute("normal")).toBeUndefined();
});

test.each([true, false])("animation changes invalidate presentation with smoothing %s", async (smooth) => {
  Settings.smoothCacheAnimations = smooth;
  const { model, draw, cycle, position, sound } = await fixture({
    100: animation([translation(0), translation(0)]),
    200: animation([translation(128), translation(128)]),
  });
  cycle();
  const calls = sound.mock.calls.length;
  model.animationChanged(200, false);
  draw(); // same fraction and no intervening client tick
  expect(position.getX(0)).toBe(2);
  expect(sound).toHaveBeenCalledTimes(calls);
  const version = position.version;
  draw();
  expect(position.version).toBe(version);
});

test("animation state is identical with frequent, infrequent, and absent draws", async () => {
  const snapshots: number[][] = [];
  for (const drawsPerCycle of [0, 1, 3]) {
    const { model, draw } = await fixture({ 100: animation([rotation(0), rotation(64)]) });
    const samples: number[] = [];
    for (let cycle = 0; cycle < 24; cycle++) {
      model.clientTick();
      for (let drawIndex = 0; drawIndex < drawsPerCycle; drawIndex++) draw(drawIndex / drawsPerCycle);
      samples.push((model as any).animationTime, (model as any).poseAnimationTime, (model as any).activeAnimation);
    }
    snapshots.push(samples);
  }
  expect(snapshots[0]).toEqual(snapshots[1]);
  expect(snapshots[1]).toEqual(snapshots[2]);
});

test("the final legacy pose interpolates towards the first frame before looping", async () => {
  const { model, cycle, position } = await fixture({ 100: animation([rotation(0), rotation(64)]) });
  for (let i = 0; i < 8; i++) cycle();
  expect(position.getX(0)).toBeCloseTo(Math.cos(Math.PI / 8));
  expect(position.getY(0)).toBeCloseTo(Math.sin(Math.PI / 8));
  cycle();
  expect(position.getX(0)).toBeCloseTo(1);
  expect(position.getY(0)).toBeCloseTo(0);
});

test("Animaya tick boundaries select their exact matrix samples", async () => {
  const matrix = (x: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1];
  const { model, draw, cycle, position } = await fixture(
    { 100: { frames: [], mayaFrames: [[matrix(0)], [matrix(128)]], lengths: [1, 1] } },
    { animayaGroups: [[0], [0], [0]], animayaScales: [[255], [255], [255]] },
  );
  cycle();
  expect(position.getX(0)).toBe(1);
  draw();
  draw();
  expect(position.getX(0)).toBe(1);
  cycle();
  expect(position.getX(0)).toBe(2);
});

test("one-shot completion presents the looping pose and resolves independently of drawing", async () => {
  const { model, cycle, position, sound } = await fixture({
    100: animation([translation(0), translation(0)]),
    200: animation([translation(128), translation(256)], [1, 1]),
  });
  cycle();
  const finished = jest.fn();
  model.animationChanged(200, false).then(finished);
  cycle();
  expect(position.getX(0)).toBe(2);
  cycle();
  expect(position.getX(0)).toBe(3);
  sound.mockClear();
  cycle();
  await Promise.resolve();
  expect(finished).toHaveBeenCalledTimes(1);
  expect(position.getX(0)).toBe(1);
  expect(sound.mock.calls.map(([id]) => id)).toEqual([200]);
  cycle();
  expect(sound.mock.calls.map(([id]) => id)).toEqual([200, 100]);
});

test("a sentinel-only interleave list keeps attack interpolation enabled", async () => {
  const { model, draw, cycle, position } = await fixture({
    100: animation([translation(0), translation(0)]),
    200: { ...animation([translation(128), translation(256)], [1, 1]), interleaveLeave: [9999999] },
  });
  cycle();
  model.animationChanged(200, true);
  model.clientTick();
  draw(0.5);
  expect(position.getX(0)).toBe(2.5);
});

test("combined attack and pose retain the client's unsmoothed two-pass selection", async () => {
  const frame = (x: number, y: number): CacheRenderRawFrame => ({
    baseId: 1,
    types: [1, 1],
    maps: [[0], [0]],
    indexFrameIds: [0, 1],
    x: [x, 0],
    y: [0, y],
    z: [0, 0],
  });
  const { model, cycle, position } = await fixture({
    100: animation([frame(0, -128), frame(0, -256)]),
    200: { ...animation([frame(128, -1280), frame(256, -1280)]), interleaveLeave: [1, 9999999] },
  });
  cycle();
  model.animationChanged(200, true);
  cycle();
  cycle();
  cycle();
  expect(position.getX(0)).toBe(2); // attack slot 0 is held, even halfway to its next frame
  expect(position.getY(0)).toBe(1); // pose slot 1, rather than attack slot 1
});

test("raw smoothing wraps rotation, holds alpha, and defaults missing scale transforms", () => {
  const wrapped = interpolateRawFrames(rotation(250), rotation(6), 0.5);
  expect(wrapped.z).toEqual([0]);
  const a: CacheRenderRawFrame = {
    baseId: 1,
    types: [3, 5],
    maps: [[0], [0]],
    indexFrameIds: [1],
    x: [2],
    y: [0],
    z: [0],
  };
  const b = { ...a, indexFrameIds: [0, 1], x: [256, 20], y: [256, 0], z: [256, 0] };
  expect(interpolateRawFrames(a, b, 0.5).x).toEqual([192, 2]);
  expect(interpolateRawFrames(a, { ...b, baseId: 2 }, 0.5)).toBe(a);
});

test("cache frame boundaries are stable on the integer client-cycle grid", () => {
  const value: CacheRenderAnimation = { frames: Array.from({ length: 100 }, () => []), lengths: Array(100).fill(1) };
  for (let cycle = 0; cycle < 100; cycle++) expect(sampleAnimation(value, cycle / 50, true).frame).toBe(cycle);
});

test("viewport client ticks reach newly reconciled actors without a draw", () => {
  const clientTick = jest.fn();
  const renderable = { get3dModel: () => ({ clientTick }), shouldDestroy: () => false };
  const viewport = Object.create(Viewport3d.prototype) as any;
  const region = { getRenderables: () => [renderable] };
  viewport.knownActors = new Map();
  viewport.scene = new THREE.Scene();
  viewport.clientCameraRotation = { clientTick: jest.fn() };
  viewport.clientTick(region, 20);
  expect(viewport.knownActors.get(renderable)).toBeInstanceOf(Actor);
  expect(clientTick).toHaveBeenCalledWith();
});

test("attached effects advance and end on client cycles while draws reuse their geometry", async () => {
  const effect: CacheRenderPayload = {
    version: 2,
    positions: [1, 0, 0, 1, 0, 0, 1, 0, 0],
    indices: [0, 1, 2],
    vertexGroups: [[0, 1, 2]],
    sourceVertices: [0, 1, 2],
    spotAnim: { id: 5, animationId: 300 },
    animations: { 300: animation([translation(0), translation(128)], [1, 1]) },
  };
  const { model, draw, cycle } = await fixture({ 100: animation([translation(0), translation(0)]) }, {}, effect);
  const spot = (model as any).spotAnims[0];
  const position = spot.mesh.geometry.getAttribute("position");
  cycle();
  expect(spot.mesh.visible).toBe(true);
  expect(position.getX(0)).toBe(1);
  const version = position.version;
  draw();
  draw();
  draw();
  expect(position.version).toBe(version);
  cycle();
  expect(position.getX(0)).toBe(2);
  cycle();
  expect(spot.mesh.visible).toBe(false);
});

test("equipment replacement waits for geometry and starts its pose on the next cycle", async () => {
  const { model, draw, cycle, renderable } = await fixture({ 100: animation([rotation(0), rotation(64)]) });
  cycle();
  cycle();
  cycle();
  model.modelChanged();
  cycle();
  expect((model as any).lastPose).toBe(-1);
  await model.preload();
  const position = (model as any).mesh.geometry.getAttribute("position");
  draw();
  draw();
  expect((model as any).lastPose).toBe(-1);
  cycle();
  expect((model as any).lastPose).toBe(renderable.animationIndex);
  expect(position.getX(0)).toBe(1);
  expect(position.getY(0)).toBeCloseTo(0);
});

test("fractional draws rotate along the arc without advancing clocks or sounds", async () => {
  const { model, draw, position, sound } = await fixture({ 100: animation([rotation(0), rotation(64)]) });
  const version = position.version;
  model.clientTick();
  expect(position.version).toBe(version); // ticks update state, not geometry
  draw(0.5); // 10ms into an 80ms keyframe
  expect(position.getX(0)).toBeCloseTo(Math.cos(Math.PI / 16));
  expect(position.getY(0)).toBeCloseTo(Math.sin(Math.PI / 16));
  expect(Math.hypot(position.getX(0), position.getY(0))).toBeCloseTo(1);
  draw(0.9);
  expect(position.getY(0)).toBeGreaterThan(Math.sin(Math.PI / 16));
  expect((model as any).animationTime).toBe(0);
  expect(sound).toHaveBeenCalledTimes(1);
  model.clientTick();
  draw(0);
  expect(position.getY(0)).toBeCloseTo(Math.sin(Math.PI / 8));
});

test("smoothing retains sub-unit transform progress and disabling it holds geometry", async () => {
  const { model, draw, position } = await fixture({ 100: animation([translation(0), translation(1)]) });
  model.clientTick();
  draw(0.5);
  expect(position.getX(0)).toBeCloseTo(1 + 0.125 / 128, 7);
  Settings.smoothCacheAnimations = false;
  draw(0.5);
  expect(position.getX(0)).toBe(1);
  const version = position.version;
  draw(0.9);
  expect(position.version).toBe(version);
});

test("Maya matrix samples interpolate between ticks using one skinning pass", async () => {
  const matrix = (x: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1];
  const { model, draw, position, sound } = await fixture(
    { 100: { frames: [], mayaFrames: [[matrix(0)], [matrix(128)]], lengths: [1, 1] } },
    { animayaGroups: [[0], [0], [0]], animayaScales: [[255], [255], [255]] },
  );
  model.clientTick();
  draw(0.5);
  expect(position.getX(0)).toBe(1.5);
  const buffer = (model as any).interpolatedMayaFrame[0];
  draw(0.75);
  expect(position.getX(0)).toBe(1.75);
  expect((model as any).interpolatedMayaFrame[0]).toBe(buffer);
  expect(sound).toHaveBeenCalledTimes(1);
  model.clientTick();
  draw(0.5);
  expect(position.getX(0)).toBe(1.5); // interpolates back into the looping first sample
});

test("drawing a one-shot's final pose cannot resolve it or advance sounds", async () => {
  const { model, draw, cycle, position, sound } = await fixture({
    100: animation([translation(0), translation(0)]),
    200: animation([translation(128), translation(256)], [1, 1]),
  });
  cycle();
  const finished = jest.fn();
  model.animationChanged(200, false).then(finished);
  model.clientTick();
  model.clientTick();
  const calls = sound.mock.calls.length;
  draw(0.99);
  expect(position.getX(0)).toBe(3);
  await Promise.resolve();
  expect(finished).not.toHaveBeenCalled();
  expect(sound).toHaveBeenCalledTimes(calls);
  model.clientTick(); // completion does not need a draw
  await Promise.resolve();
  expect(finished).toHaveBeenCalledTimes(1);
});

test("attached effects smooth between ticks without changing their delay or lifetime", async () => {
  const effect: CacheRenderPayload = {
    version: 2,
    positions: [1, 0, 0, 1, 0, 0, 1, 0, 0],
    indices: [0, 1, 2], vertexGroups: [[0, 1, 2]], sourceVertices: [0, 1, 2],
    spotAnim: { id: 5, animationId: 300 },
    animations: { 300: animation([translation(0), translation(128)], [1, 1]) },
  };
  const { model, draw } = await fixture({ 100: animation([translation(0), translation(0)]) }, {}, effect);
  const spot = (model as any).spotAnims[0];
  model.clientTick();
  const clock = (model as any).spotAnimClock;
  draw(0.5);
  expect(spot.mesh.geometry.getAttribute("position").getX(0)).toBe(1.5);
  draw(0.99);
  expect((model as any).spotAnimClock).toBe(clock);
  expect(spot.mesh.visible).toBe(true);
  model.clientTick();
  draw(0.99);
  expect(spot.mesh.visible).toBe(true);
  model.clientTick();
  expect(spot.mesh.visible).toBe(false);
});

test("baked effect frames interpolate and placement changes invalidate presentation", async () => {
  const positions = (x: number) => [x, 0, 0, x, 0, 0, x, 0, 0];
  const effect: CacheRenderPayload = {
    version: 2,
    positions: positions(1), indices: [0, 1, 2],
    spotAnim: { id: 5, animationId: 300 },
    animations: { 300: { frames: [positions(1), positions(3)], lengths: [1, 1] } },
  };
  const { model, draw } = await fixture({ 100: animation([translation(0), translation(0)]) }, {}, effect);
  const spot = (model as any).spotAnims[0];
  const position = spot.mesh.geometry.getAttribute("position");
  model.clientTick();
  draw(0.5);
  expect(position.getX(0)).toBe(2);
  Settings.smoothCacheAnimations = false;
  draw(0.5);
  expect(position.getX(0)).toBe(1);
  expect(spot.mesh.visible).toBe(true);
  model.spotAnimChanged([]);
  draw(0.5); // the fraction remains zero with smoothing disabled
  expect(spot.mesh.visible).toBe(false);
});


test("the world exposes fractional client time after catch-up without extra ticks", () => {
  const world = new World();
  world.clientTickTimer = world.tickTimer = 1000;
  const tick = jest.spyOn(world, "tickClient").mockImplementation(() => {});
  world.doClientTick(1010);
  expect(world.clientTickPercent).toBe(0.5);
  expect(tick).not.toHaveBeenCalled();
  world.doClientTick(1049);
  expect(tick).toHaveBeenCalledTimes(2);
  expect(tick.mock.calls.map((call) => call[1])).toEqual([1020, 1040]);
  expect(world.clientTickPercent).toBe(0.45);
  world.doClientTick(1050);
  expect(world.clientTickPercent).toBe(0.5);
  expect(tick).toHaveBeenCalledTimes(2);
});
