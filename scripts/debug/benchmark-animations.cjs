const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const Module = require("module");
const { execFileSync } = require("child_process");
// CPU-only idle actor benchmark. Run with Node 20.
// The baseline defaults to HEAD; pass ANIMATION_BASELINE_REF after committing
// this change to compare against an earlier revision. No checkout is modified.
// Audio playback, attached effects, drawing, clickboxes, and GPU work are excluded.
const sdk = path.resolve(__dirname, "../..");
global.navigator = { userAgent: "benchmark" };
global.window = { performance, localStorage: { getItem: () => null, setItem: () => {} } };
require(require.resolve("tsx/cjs", { paths: [sdk] }));
for (const ext of [".png", ".ogg", ".glb", ".css"])
  require.extensions[ext] = (module, filename) => {
    module.exports = filename;
  };
const THREE = require(path.join(sdk, "node_modules/three"));
const { transformSync } = require(path.join(sdk, "node_modules/esbuild"));
const { CacheRenderModel } = require(path.join(sdk, "src/sdk/rendering/CacheRenderModel.ts"));
const { Settings } = require(path.join(sdk, "src/sdk/Settings.ts"));
const { normalizeCacheAlpha } = require(path.join(sdk, "src/sdk/rendering/utils/colors.ts"));
const baselineRef = process.env.ANIMATION_BASELINE_REF || "HEAD";
function baselineModule(relative, animationHelpers) {
  const filename = path.join(sdk, relative);
  const source = execFileSync("git", ["show", `${baselineRef}:${relative}`], { cwd: sdk, encoding: "utf8" });
  const compiled = transformSync(source, { loader: "ts", format: "cjs", target: "es2020" }).code;
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  instance.require = function (request) {
    if (animationHelpers && request === "./utils/animations") return animationHelpers;
    return Module.prototype.require.call(this, request);
  };
  instance._compile(compiled, filename);
  return instance.exports;
}
const oldHelpers = baselineModule("src/sdk/rendering/utils/animations.ts");
const { CacheRenderModel: BeforeModel } = baselineModule("src/sdk/rendering/CacheRenderModel.ts", oldHelpers);
if (typeof BeforeModel.prototype.clientTick === "function") {
  throw new Error("Baseline already uses client-cycle animation. Set ANIMATION_BASELINE_REF to a commit before this change.");
}
const manifest = JSON.parse(fs.readFileSync(path.join(sdk, "cache-render-bundle/manifest.json")));
function measure(fn) {
  for (let i = 0; i < 100; i++) fn();
  const results = [];
  for (let batch = 0; batch < 5; batch++) {
    const start = performance.now();
    for (let i = 0; i < 200; i++) fn();
    results.push((performance.now() - start) / 200);
  }
  return results.sort((a, b) => a - b)[2];
}
function makeModel(ModelClass, payload) {
  const model = new ModelClass(
    {
      size: 2,
      selectable: true,
      spotAnims: [],
      animationIndex: 0,
      shouldBlendAnimationWithPose: false,
      setAnimationListener() {},
      getTrueLocation: () => ({ x: 0, y: 0 }),
    },
    { kind: "model", modelId: 1 },
  );
  const geometry = new THREE.BufferGeometry()
    .setAttribute("position", new THREE.Float32BufferAttribute(payload.positions, 3))
    .setAttribute("cacheAlpha", new THREE.Float32BufferAttribute(new Float32Array(payload.positions.length / 3), 1))
    .setIndex(payload.indices);
  geometry.computeVertexNormals();
  Object.assign(model, {
    mesh: new THREE.Mesh(geometry),
    meshGeneration: 0,
    ready: Promise.resolve(),
    activeAnimation: payload.poseMap["0"],
    animations: payload.animations,
    poseMap: payload.poseMap,
    lastPose: 0,
    basePositions: new Float32Array(payload.positions),
    posedPositions: new Float32Array(payload.positions.length),
    baseAlphas: new Float32Array(
      payload.alphas?.map(normalizeCacheAlpha) ?? Array(payload.positions.length / 3).fill(0),
    ),
    posedAlphas: new Float32Array(payload.positions.length / 3),
    vertexGroups: payload.vertexGroups ?? [],
    alphaGroups: payload.alphaGroups ?? [],
    sourceVertices: payload.sourceVertices ?? [],
    animayaGroups: payload.animayaGroups ?? [],
    animayaScales: payload.animayaScales ?? [],
    frameSoundPlayer: { advance() {}, reset() {} },
  });
  model.root.add(model.mesh);
  return model;
}
Settings.smoothCacheAnimations = true;
const results = [];
for (const id of ["npc-12812", "npc-12817", "npc-12818", "npc-12821"]) {
  const bytes = fs.readFileSync(path.join(sdk, "cache-render-bundle", manifest.assets[id].file));
  const payload = JSON.parse(zlib.gunzipSync(bytes.subarray(8)));
  const before = makeModel(BeforeModel, payload),
    after = makeModel(CacheRenderModel, payload);
  const beforeMs = measure(() => before.updateActorAnimation(1 / 120, { x: 0, y: 0 }, 0));
  let cycleProgress = 0;
  const perDisplayFrameMs = measure(() => {
    cycleProgress += 50 / 120;
    if (cycleProgress >= 1) {
      after.clientTick();
      cycleProgress -= 1;
    }
    after.presentActorAnimation(0, cycleProgress / 50);
  });
  const clientCycleMs = measure(() => after.clientTick());
  results.push({
    id,
    baselineRef,
    beforeAnimationMsPer120HzDraw: +beforeMs.toFixed(3),
    afterStateMsPer50HzCycle: +clientCycleMs.toFixed(3),
    afterAnimationMsPer120HzDraw: +perDisplayFrameMs.toFixed(3),
    animationCpuSpeedupAt120Hz: +(beforeMs / perDisplayFrameMs).toFixed(1),
  });
}
console.log(JSON.stringify(results, null, 2));
