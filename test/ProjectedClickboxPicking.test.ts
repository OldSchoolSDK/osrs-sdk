import * as THREE from "three";
import { Viewport3d } from "../src/sdk/Viewport3d";
import { Mob } from "../src/sdk/Mob";
import { TestRegion } from "../src/sdk/testing/TestRegion";
import {
  boundsDepthRange,
  convexHull,
  projectedHullContains,
  screenBoundsContain,
  projectedTrianglesContain,
} from "../src/sdk/rendering/utils/projectedClickbox";
import { ClickboxController } from "../src/sdk/rendering/utils/clickbox";
import { CacheRenderModel } from "../src/sdk/rendering/CacheRenderModel";
import { CacheRender } from "../src/sdk/rendering/CacheRenderBundle";
import { TextEncoder, TextDecoder } from "util";
import { Settings } from "../src/sdk/Settings";

(global as any).TextDecoder = TextDecoder;

jest.mock("three", () => ({
  ...jest.requireActual("three"),
  GLTFLoader: class {
    setMeshoptDecoder() {}
  },
}));

function fixture(vertices: THREE.Vector3[], client?: { size: number; triangles: number[] }) {
  // Exercise the real viewport picking path without creating a WebGL context.
  const viewport = Object.create(Viewport3d.prototype) as any;
  viewport.camera = new THREE.PerspectiveCamera(70, 800 / 600, 0.1, 50);
  viewport.camera.position.set(0, 3, 10);
  viewport.camera.lookAt(0, 0, 0);
  viewport.camera.updateWorldMatrix(true, false);
  viewport.canvasDimensions = { width: 800, height: 600 };
  viewport.projectedClickboxes = new Map();
  viewport.raycaster = new THREE.Raycaster();
  viewport.scene = new THREE.Scene();
  const mob = new (class extends Mob {
    override get size() {
      return client?.size ?? 1;
    }
  })(new TestRegion(20, 20), { x: 2, y: 2 });
  const model = {
    getClickboxVertices: jest.fn(() => vertices),
    getClickboxBounds: () => new THREE.Box3().setFromPoints(vertices),
    ...(client ? { getClickboxTriangles: () => client.triangles } : {}),
  };
  viewport.knownActors = new Map([[mob, { getModel: () => model }]]);
  viewport.refreshProjectedClickboxes();
  return { viewport, mob, model };
}

const cube = () =>
  Array.from({ length: 8 }, (_, i) => new THREE.Vector3(i & 1 ? 1 : -1, i & 2 ? 2 : 0, i & 4 ? 1 : -1));

test("one-tile client models use the 3D box without projecting model vertices", () => {
  const { viewport, model } = fixture(cube(), { size: 1, triangles: [] });
  for (let x = 300; x <= 500; x += 10) {
    for (let y = 180; y <= 380; y += 10) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((x / 800) * 2 - 1, 1 - (y / 600) * 2), viewport.camera);
      const expected = ray.ray.intersectsBox(model.getClickboxBounds());
      expect(viewport.translateClick(x, y, {}, {}).type === "entities").toBe(expected);
    }
  }
  expect(model.getClickboxVertices).not.toHaveBeenCalled();
});

test("larger client models accept the rectangle outside a triangle's interior", () => {
  const vertices = [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 2, 0)];
  const { viewport, mob } = fixture(vertices, { size: 2, triangles: [0, 1, 2] });
  const point = viewport.projectToClientScreen(new THREE.Vector3(0.7, 1.7, 0));
  const oldHull = convexHull(vertices.map((vertex) => viewport.projectToScreen(vertex)));
  expect(projectedHullContains(oldHull, point)).toBe(false);
  expect(viewport.translateClick(point.x, point.y, {}, {}).mobs).toEqual([mob]);
});

test("larger client models do not fill a hull's bridge between separated faces", () => {
  const vertices: THREE.Vector3[] = [];
  for (const x of [-3, 2])
    vertices.push(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x + 1, 0, 0), new THREE.Vector3(x, 1, 0));
  const { viewport } = fixture(vertices, { size: 2, triangles: [0, 1, 2, 3, 4, 5] });
  const point = viewport.projectToClientScreen(new THREE.Vector3(0, 0.3, 0));
  expect(projectedHullContains(convexHull(vertices.map((v) => viewport.projectToScreen(v))), point)).toBe(true);
  expect(viewport.translateClick(point.x, point.y, {}, {}).type).toBe("coordinate");
});

test("near clipping skips only the affected triangles", () => {
  const vertices = [
    new THREE.Vector3(0, 3, 10),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 2, 0),
  ];
  const { viewport, mob } = fixture(vertices, { size: 2, triangles: [0, 1, 2, 3, 4, 5] });
  const point = viewport.projectToClientScreen(new THREE.Vector3(0, 0.8, 0));
  expect(viewport.translateClick(point.x, point.y, {}, {}).mobs).toEqual([mob]);
  const clipped = fixture(vertices, { size: 2, triangles: [0, 1, 2] });
  expect(clipped.viewport.translateClick(point.x, point.y, {}, {}).type).toBe("coordinate");
});

test("triangle rectangles use inclusive five-pixel square padding and stop on the first hit", () => {
  const vertices = [
    { x: 10, y: 10 },
    { x: 20, y: 10 },
    { x: 10, y: 20 },
  ];
  expect(projectedTrianglesContain(vertices, [0, 1, 2], { x: 25, y: 25 })).toBe(true);
  expect(projectedTrianglesContain(vertices, [0, 1, 2], { x: 26, y: 25 })).toBe(false);
  const indices = new Proxy([0, 1, 2, 0, 1, 2], {
    get(target, key) {
      if (Number(key) >= 3) throw new Error("scanned after hit");
      return target[key];
    },
  });
  expect(projectedTrianglesContain(vertices, indices, { x: 15, y: 15 })).toBe(true);
});

test("client pixel projection truncates offsets before adding the viewport centre", () => {
  const { viewport } = fixture(cube());
  const vertex = new THREE.Vector3(-0.015, 1, 0);
  const projected = vertex.clone().project(viewport.camera);
  expect(viewport.projectToClientScreen(vertex)).toEqual({
    x: 400 + Math.trunc(projected.x * 400), y: 300 + Math.trunc(-projected.y * 300),
  });
  expect(viewport.projectToClientScreen(vertex).x).toBe(400);
  expect(viewport.projectToScreen(vertex).x).toBe(399);
});

test("rejects a distant pointer without extracting model vertices or building a hull", () => {
  const { viewport, model } = fixture(cube());
  expect(model.getClickboxVertices).not.toHaveBeenCalled();
  expect(viewport.translateClick(0, 0, {}, {}).type).toBe("coordinate");
  expect(model.getClickboxVertices).not.toHaveBeenCalled();
});

test("UI visibility uses cached bounds without extracting the full vertex list", () => {
  const { viewport, mob, model } = fixture(cube());
  viewport.uiCanvas = { width: 800, height: 600 };
  viewport.uiCanvasContext = { clearRect: jest.fn() };
  const drawUI = jest.spyOn(mob, "drawUILayer").mockImplementation(() => {});
  viewport.draw2dScene({ tickPercent: 0, getReadyTimer: 0 }, { players: [], mobs: [mob], entities: [] });
  expect(drawUI.mock.calls[0][1].visible).toBe(true);
  expect(model.getClickboxVertices).not.toHaveBeenCalled();
});

test("clickbox debug shows cheap bounds and only draws face rectangles when picking computed them", () => {
  const { viewport, model } = fixture(cube(), { size: 2, triangles: [0, 1, 2] });
  viewport.uiCanvas = { width: 800, height: 600 };
  const context = (viewport.uiCanvasContext = {
    clearRect: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    rect: jest.fn(),
    closePath: jest.fn(),
    fill: jest.fn(),
    stroke: jest.fn(),
    strokeStyle: "",
  });
  const drawDebug = () =>
    viewport.draw2dScene({ tickPercent: 0, getReadyTimer: 0 }, { players: [], mobs: [], entities: [] });
  const previous = Settings.displayClickboxes;
  Settings.displayClickboxes = true;
  try {
    drawDebug();
    expect(context.rect).toHaveBeenCalledTimes(1);
    expect(context.strokeStyle).toBe("#ffb400");
    expect(model.getClickboxVertices).not.toHaveBeenCalled();

    const point = viewport.projectToScreen(new THREE.Vector3(0, 1, 0));
    viewport.translateClick(point.x, point.y, {}, {});
    drawDebug();
    expect(context.lineTo).not.toHaveBeenCalled();
    expect(context.strokeStyle).toBe("#00ffff");
    expect(model.getClickboxVertices).toHaveBeenCalledTimes(1);

    viewport.refreshProjectedClickboxes();
    drawDebug();
    expect(context.strokeStyle).toBe("#00ffff");
    expect(model.getClickboxVertices).toHaveBeenCalledTimes(2);

    viewport.translateClick(0, 0, {}, {});
    viewport.refreshProjectedClickboxes();
    drawDebug();
    expect(context.rect).toHaveBeenCalledTimes(4);
    expect(context.strokeStyle).toBe("#ffb400");
    expect(model.getClickboxVertices).toHaveBeenCalledTimes(2);
  } finally {
    Settings.displayClickboxes = previous;
  }
});

test("lazily builds and reuses a candidate's hull with the existing click tolerance", () => {
  const vertices = cube();
  const { viewport, mob, model } = fixture(vertices);
  const hull = convexHull(vertices.map((vertex) => viewport.projectToScreen(vertex)));
  const point = viewport.projectToScreen(new THREE.Vector3(0, 1, 0));
  expect(viewport.translateClick(point.x, point.y, {}, {}).mobs).toEqual([mob]);
  viewport.translateClick(point.x, point.y, {}, {});
  expect(model.getClickboxVertices).toHaveBeenCalledTimes(1);

  // Check the optimized path against the original hull over its surroundings,
  // including the tolerance outside its perimeter.
  for (let x = 300; x <= 500; x += 10) {
    for (let y = 180; y <= 380; y += 10) {
      const picked = viewport.translateClick(x, y, {}, {}).type === "entities";
      expect(picked).toBe(projectedHullContains(hull, { x, y }, 20));
    }
  }
});

test("a stationary pointer only refines overlapping models on the next draw", () => {
  const { viewport, model } = fixture(cube());
  const distantVertices = cube().map((vertex) => vertex.add(new THREE.Vector3(8, 0, 0)));
  const distantModel = {
    getClickboxVertices: jest.fn(() => distantVertices),
    getClickboxBounds: () => new THREE.Box3().setFromPoints(distantVertices),
  };
  const distantMob = new Mob(new TestRegion(20, 20), { x: 8, y: 2 });
  viewport.knownActors.set(distantMob, { getModel: () => distantModel });
  const point = viewport.projectToScreen(new THREE.Vector3(0, 1, 0));
  viewport.translateClick(point.x, point.y, {}, {});
  viewport.refreshProjectedClickboxes();
  expect(model.getClickboxVertices).toHaveBeenCalledTimes(2);
  expect(distantModel.getClickboxVertices).not.toHaveBeenCalled();

  viewport.translateClick(0, 0, {}, {});
  viewport.refreshProjectedClickboxes();
  expect(model.getClickboxVertices).toHaveBeenCalledTimes(2);
  expect(distantModel.getClickboxVertices).not.toHaveBeenCalled();
});

test("refreshes picking when the camera changes without a client tick", () => {
  const { viewport, model } = fixture(cube());
  const point = viewport.projectToScreen(new THREE.Vector3(0, 1, 0));
  viewport.translateClick(point.x, point.y, {}, {});
  viewport.camera.position.x = 4;
  viewport.camera.updateWorldMatrix(true, false);
  viewport.refreshProjectedClickboxes();
  const movedPoint = viewport.projectToScreen(new THREE.Vector3(0, 1, 0));
  expect(viewport.translateClick(movedPoint.x, movedPoint.y, {}, {}).type).toBe("entities");
  expect(model.getClickboxVertices).toHaveBeenCalledTimes(2);
});

test("retains raycast picking for models without projected clickbox vertices", () => {
  const { viewport, mob } = fixture(cube());
  viewport.knownActors = new Map([[mob, { getModel: () => ({}) }]]);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  mesh.position.y = 1;
  mesh.userData = { clickable: true, unit: mob };
  viewport.scene.add(mesh);
  mesh.updateWorldMatrix(true, false);
  viewport.refreshProjectedClickboxes();
  const point = viewport.projectToScreen(new THREE.Vector3(0, 1, 0));
  expect(viewport.translateClick(point.x, point.y, {}, {}).mobs).toEqual([mob]);
});

test("uses exact vertices when conservative bounds cross the near plane", () => {
  const vertices = [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)];
  const { viewport, model } = fixture(vertices);
  model.getClickboxBounds = () => new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 4, 12));
  viewport.refreshProjectedClickboxes();
  expect(model.getClickboxVertices).toHaveBeenCalledTimes(1);
  const point = viewport.projectToScreen(new THREE.Vector3(0, 0.3, 0));
  expect(viewport.translateClick(point.x, point.y, {}, {}).type).toBe("entities");
  vertices[0].copy(viewport.camera.position);
  viewport.refreshProjectedClickboxes();
  expect(viewport.projectedClickboxes.size).toBe(0);
});

test("computes conservative depth extrema for rotated cameras", () => {
  const { viewport } = fixture(cube());
  viewport.camera.position.set(5, 4, 8);
  viewport.camera.lookAt(0, 0, 0);
  viewport.camera.updateWorldMatrix(true, false);
  const bounds = new THREE.Box3(new THREE.Vector3(-2, -1, -3), new THREE.Vector3(3, 5, 4));
  const depth = boundsDepthRange(bounds, viewport.camera.matrixWorldInverse);
  const depths = Array.from(
    { length: 8 },
    (_, i) =>
      new THREE.Vector3(
        i & 1 ? bounds.max.x : bounds.min.x,
        i & 2 ? bounds.max.y : bounds.min.y,
        i & 4 ? bounds.max.z : bounds.min.z,
      ).applyMatrix4(viewport.camera.matrixWorldInverse).z,
  );
  expect(depth.min).toBeCloseTo(Math.min(...depths));
  expect(depth.max).toBeCloseTo(Math.max(...depths));
  expect(screenBoundsContain({ minX: 10, minY: 10, maxX: 20, maxY: 20 }, { x: 5, y: 15 }, 5)).toBe(true);
});

test("cache models reuse vertex objects and update bounds for animation and actor movement", async () => {
  const encoded = new TextEncoder().encode(
    JSON.stringify({
      version: 2,
      positions: [0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0],
      indices: [0, 1, 2, 3, 3, 3],
      sourceVertices: [0, 1, 2, 0],
      geometryClickbox: { positions: [0, 0, 0, 2, 0, 0, 0, 3, 0], indices: [0, 1, 2] },
    }),
  );
  const bytes = new Uint8Array(8 + encoded.length);
  bytes.set([79, 83, 82, 66]);
  new DataView(bytes.buffer).setUint32(4, encoded.length, true);
  bytes.set(encoded, 8);
  const bundle = jest.spyOn(CacheRender, "bundle").mockResolvedValue({
    manifest: { bundleVersion: "clickbox-fixture" },
    assetIds: () => ["body"],
    sharedAssetIds: () => [],
    spotAnimIds: () => [],
    allSpotAnimIds: () => [],
    fetchAsset: async () => bytes.buffer,
  } as any);
  try {
    const mob = new Mob(new TestRegion(20, 20), { x: 2, y: 2 });
    const model = new CacheRenderModel(mob, { kind: "model", modelId: 1 });
    await model.preload();
    const scene = new THREE.Scene();
    model.draw(scene, 0, 0, { x: 2, y: 2, z: 0 }, 0, 0, true, []);
    const vertices = model.getClickboxVertices();
    expect(vertices).toHaveLength(6);
    expect(model.getClickboxTriangles()).toEqual([0, 1, 2, 3, 4, 5]);
    const vertexObject = vertices[0];
    const bounds = model.getClickboxBounds()!.clone();
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(2 * (32 + 8) / 128);
    for (const vertex of vertices) expect(bounds.containsPoint(vertex)).toBe(true);
    expect(model.getClickboxVertices()).toBe(vertices);

    const position = (model as any).mesh.geometry.getAttribute("position");
    position.setY(2, 4);
    position.needsUpdate = true;
    model.draw(scene, 0, 0, { x: 5, y: 2, z: 0 }, 0, 0, true, []);
    expect(model.getClickboxBounds()!.max.y).toBeCloseTo(4 - 0.49);
    expect(model.getClickboxVertices()[0]).toBe(vertexObject);
    expect(vertexObject.x).toBeCloseTo(5.5);
    for (const vertex of model.getClickboxVertices()) {
      expect(model.getClickboxBounds()!.containsPoint(vertex)).toBe(true);
    }
  } finally {
    bundle.mockRestore();
  }
});


test("reconfiguring a clickbox drops cached geometry and an old authored mesh", () => {
  const makeMesh = (height: number) => new THREE.Mesh(new THREE.BufferGeometry()
    .setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, height, 0], 3))
    .setIndex([0, 1, 2]));
  const clickbox = new ClickboxController(() => 2);
  expect(clickbox.getBounds()).toBeNull();
  expect(clickbox.getVertices()).toEqual([]);
  expect(clickbox.getTriangles()).toEqual([]);

  clickbox.configure(makeMesh(2), [0, 1, 2], makeMesh(10));
  expect(clickbox.getVertices()).toHaveLength(6);
  expect(clickbox.getBounds()!.max.y).toBeGreaterThan(10);
  expect(clickbox.getTriangles()).toEqual([0, 1, 2, 3, 4, 5]);

  const replacement = makeMesh(1);
  replacement.position.x = 20;
  clickbox.configure(replacement, [0, 1, 2]);
  expect(clickbox.getVertices()).toHaveLength(3);
  expect(clickbox.getVertices()[0].x).toBe(20);
  expect(clickbox.getBounds()!.max.y).toBeCloseTo(1, 2);
  expect(clickbox.getBounds()!.min.x).toBeGreaterThan(19);
  expect(clickbox.getTriangles()).toEqual([0, 1, 2]);
  replacement.visible = false;
  expect(clickbox.getBounds()).toBeNull();
  expect(clickbox.getVertices()).toEqual([]);
});
