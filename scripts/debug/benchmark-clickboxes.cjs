const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
// CPU-only picking benchmark using the locally generated NPC payloads.
// Run with Node 20: node scripts/debug/benchmark-clickboxes.cjs
// All payloads exercise the larger-model branch, to compare rectangle scans
// against hulls on the same geometry. This is not a WebGL/FPS benchmark.
const sdk = path.resolve(__dirname, "../..");
require(require.resolve("tsx/cjs", { paths: [sdk] }));
const THREE = require(path.join(sdk, "node_modules/three"));
const { ClickboxController } = require(path.join(sdk, "src/sdk/rendering/utils/clickbox.ts"));
const { convexHull, projectedHullContains, projectedTrianglesContain, boundsDepthRange, screenBoundsContain } = require(
  path.join(sdk, "src/sdk/rendering/utils/projectedClickbox.ts"),
);
const manifest = JSON.parse(fs.readFileSync(path.join(sdk, "cache-render-bundle/manifest.json")));
const camera = new THREE.PerspectiveCamera(70, 800 / 600, 0.1, 50);
camera.position.set(0, 5, 20);
camera.lookAt(0, 0, 0);
camera.updateWorldMatrix(true, false);
const project = (v) => {
  const p = v.clone().project(camera);
  return { x: Math.round((p.x + 1) * 400), y: Math.round((1 - p.y) * 300) };
};
const samples = [];
for (const id of ["npc-12812", "npc-12817", "npc-12818", "npc-12821"]) {
  const asset = manifest.assets[id];
  if (!asset) continue;
  const bytes = fs.readFileSync(path.join(sdk, "cache-render-bundle", asset.file));
  const payload = JSON.parse(zlib.gunzipSync(bytes.subarray(8)));
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(payload.positions, 3))
      .setIndex(payload.indices ?? []),
  );
  root.add(mesh);
  const position = mesh.geometry.getAttribute("position");
  const sourceVertices = payload.sourceVertices || Array.from({ length: position.count }, (_, i) => i);
  const clickbox = new ClickboxController(() => 2);
  clickbox.configure(mesh, sourceVertices);
  const uniqueVertices = clickbox.getVertices().length;
  const oldVertices = () => {
    root.updateWorldMatrix(true, true);
    const vertices = [];
    const seen = new Set();
    for (let i = 0; i < position.count; i++) {
      const source = sourceVertices[i] ?? i;
      if (seen.has(source)) continue;
      seen.add(source);
      vertices.push(
        new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(mesh.matrixWorld),
      );
    }
    return vertices;
  };
  const pointer = { x: 0, y: 0 };
  const hoverPoint = project(clickbox.getBounds().getCenter(new THREE.Vector3()));
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((hoverPoint.x / 800) * 2 - 1, 1 - (hoverPoint.y / 600) * 2), camera);
  const clientProject = (v) => {
    const p = v.clone().project(camera);
    return { x: 400 + Math.trunc(p.x * 400), y: 300 + Math.trunc(-p.y * 300) };
  };
  const old = () => {
    const vertices = oldVertices();
    if (vertices.every((v) => v.clone().applyMatrix4(camera.matrixWorldInverse).z <= -camera.near)) {
      projectedHullContains(convexHull(vertices.map(project)), pointer, 20);
    }
    // The old UI path extracts and transforms the same vertices again.
    oldVertices().every((v) => v.clone().applyMatrix4(camera.matrixWorldInverse).z <= -camera.near);
  };
  const optimized = (hover = false, useTriangles = true) => {
    clickbox.invalidate();
    position.needsUpdate = true; // Include a new bounds scan, as with animated poses.
    const bounds = clickbox.getBounds();
    const depth = boundsDepthRange(bounds, camera.matrixWorldInverse);
    if (depth.max > -camera.near) throw new Error("fixture crosses near plane");
    const screen = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const corner = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      corner.set(
        i & 1 ? bounds.max.x : bounds.min.x,
        i & 2 ? bounds.max.y : bounds.min.y,
        i & 4 ? bounds.max.z : bounds.min.z,
      );
      const p = project(corner);
      screen.minX = Math.min(screen.minX, p.x);
      screen.maxX = Math.max(screen.maxX, p.x);
      screen.minY = Math.min(screen.minY, p.y);
      screen.maxY = Math.max(screen.maxY, p.y);
    }
    if (hover || screenBoundsContain(screen, pointer, 5)) {
      if (!ray.ray.intersectsBox(bounds)) throw new Error("hover fixture missed the box");
      if (useTriangles)
        projectedTrianglesContain(
          clickbox.getVertices().map(clientProject),
          clickbox.getTriangles(),
          hoverPoint,
          5,
        );
      else projectedHullContains(convexHull(clickbox.getVertices().map(project)), hoverPoint, 5);
    }
    boundsDepthRange(clickbox.getBounds(), camera.matrixWorldInverse);
  };
  function measure(fn) {
    for (let i = 0; i < 30; i++) fn();
    const batches = [];
    for (let batch = 0; batch < 5; batch++) {
      const start = performance.now();
      for (let i = 0; i < 200; i++) fn();
      batches.push((performance.now() - start) / 200);
    }
    return batches.sort((a, b) => a - b)[2];
  }
  const before = measure(old),
    away = measure(() => optimized()),
    hover = measure(() => optimized(true)),
    hull = measure(() => optimized(true, false));
  samples.push({
    id,
    expandedVertices: position.count,
    uniqueVertices,
    beforeMs: +before.toFixed(3),
    pointerAwayMs: +away.toFixed(3),
    pointerOverMs: +hover.toFixed(3),
    pointerOverHullMs: +hull.toFixed(3),
    hoverSpeedup: +(hull / hover).toFixed(1),
    awaySpeedup: +(before / away).toFixed(1),
  });
}
console.log(JSON.stringify(samples, null, 2));
