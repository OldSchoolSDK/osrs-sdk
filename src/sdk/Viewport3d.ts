"use strict";
import { World } from "./World";
import { Viewport, ViewportDelegate } from "./Viewport";
import { CardinalDirection, Region } from "./Region";

import * as THREE from "three";
import Stats from "three/examples/jsm/libs/stats.module";

import { Settings } from "./Settings";
import { Mob } from "./Mob";
import { Renderable, UILayerProjector } from "./Renderable";
import { Location } from "./Location";
import { Actor } from "./rendering/Actor";
import _ from "lodash";
import { Unit } from "./Unit";
import { Trainer } from "./Trainer";
import { Pathing } from "./Pathing";
import { createTileIndicator, GROUND_OVERLAY_Y, GroundOverlayRenderOrder } from "./rendering/RenderUtils";
import {
  convexHull,
  boundsDepthRange,
  isInFrontOfNearPlane,
  projectedHullContains,
  projectedTriangleBounds,
  projectedTrianglesContain,
  screenBoundsContain,
  ScreenBounds,
  ScreenPoint,
} from "./rendering/utils/projectedClickbox";
import { Model } from "./rendering/Model";
import {
  ClientCameraRotation,
  MAX_CAMERA_PITCH,
  MIN_CAMERA_PITCH,
  RELAXED_MAX_CAMERA_PITCH,
  RELAXED_MIN_CAMERA_PITCH,
} from "./utils/camera/CameraRotation";
import { CameraFocalPoint, CameraFocalPosition } from "./utils/camera/CameraFocalPoint";
import { cameraOrbitDistance } from "./utils/camera/CameraOrbit";
import { CHUNK_SIZE } from "./utils/Chunk";

// how many pixels wide should 2d elements be scaled to
const SPRITE_SCALE = 32;

const FLOOR_Y_POS = -0.5;

const ROTATE_MULT = 0.006;
const ZOOM_MULT = 0.005;
const TOUCH_MULT = 2;

export class Viewport3d implements ViewportDelegate {
  private canvas: OffscreenCanvas;
  private uiCanvas: OffscreenCanvas;
  private uiCanvasContext: OffscreenCanvasRenderingContext2D;

  private canvasDimensions: { width: number; height: number } = { width: 1, height: 1 };

  public scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private raycaster: THREE.Raycaster;
  private lastRenderTime = 0;
  private nextRenderTime = 0;

  private pivot = new THREE.Object3D();
  private yaw = new THREE.Object3D();
  private pitch = new THREE.Object3D();

  private yawDelta = 0;
  private pitchDelta = 0;
  private clientCameraRotation = new ClientCameraRotation();
  private cameraFocalPoint = new CameraFocalPoint();
  private orbitZoomOffset = 0;

  private touchStart: Touch | null = null;
  private touchStart2: Touch | null = null;

  private stats = new Stats();

  private knownActors: Map<Renderable, Actor> = new Map();
  private projectedClickboxes = new Map<Mob, {
    model: Model;
    worldBounds?: THREE.Box3;
    bounds?: ScreenBounds;
    hull?: ScreenPoint[];
    vertices?: (ScreenPoint | null)[];
    triangles?: ArrayLike<number>;
    refined?: boolean;
    tolerance: number;
  }>();
  private pickingPointer: ScreenPoint | null = null;

  private selectedTile: Location | null = null;
  private selectedTileMesh: THREE.Mesh;
  private chunkDebugLines: THREE.LineSegments | null = null;
  private tileCollisionDebugMesh: THREE.InstancedMesh | null = null;
  private tileCollisionDebugMatrix = new THREE.Matrix4();

  private clock = new THREE.Clock();

  private animateHandle: number;
  private renderingSuspended = false;
  private renderFailureLogged = false;

  constructor(faceCameraSouth: boolean, worldCanvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();

    this.canvas = new OffscreenCanvas(this.canvasDimensions.width, this.canvasDimensions.height);
    this.uiCanvas = new OffscreenCanvas(this.canvasDimensions.width, this.canvasDimensions.height);
    this.uiCanvasContext = this.uiCanvas.getContext("2d") as OffscreenCanvasRenderingContext2D;

    this.checkGpu();

    this.camera = new THREE.PerspectiveCamera(70, this.canvasDimensions.width / this.canvasDimensions.height, 0.1, 50);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points.threshold = 0.1;
    this.raycaster.params.Line.threshold = 0.1;

    this.initCameraEvents(worldCanvas);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.renderingSuspended = true;
        if (this.animateHandle !== undefined) cancelAnimationFrame(this.animateHandle);
      } else if (this.renderingSuspended) {
        this.renderingSuspended = false;
        this.nextRenderTime = 0;
        this.animate();
      }
    });

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      logarithmicDepthBuffer: true,
      antialias: true,
      //precision: "lowp", // is this making everything purple on mobile?
    });
    const webglCanvas = this.renderer.domElement as unknown as {
      addEventListener?: (type: string, listener: (event: Event) => void) => void;
    };
    webglCanvas.addEventListener?.("webglcontextlost", (event: Event) => {
      event.preventDefault();
      console.error("[osrs-sdk] WebGL context lost while rendering the 3D viewport", {
        visibility: typeof document !== "undefined" ? document.visibilityState : "unknown",
      });
    });
    webglCanvas.addEventListener?.("webglcontextrestored", () => {
      console.warn("[osrs-sdk] WebGL context restored; Three.js resources may need rebuilding");
      this.nextRenderTime = 0;
    });

    // Set up camera positioning
    this.camera.position.set(0, 0, 0);
    this.pivot.position.set(0, 0, 0);
    // Face south
    if (faceCameraSouth) {
      this.yaw.rotation.y = Math.PI;
    }
    // Pitch down slightly
    this.pitch.rotation.x = -0.7;
    this.camera.position.z = cameraOrbitDistance(this.pitch.rotation.x);
    this.scene.add(this.pivot);
    this.pivot.add(this.yaw);
    this.yaw.add(this.pitch);
    this.pitch.add(this.camera);

    this.selectedTileMesh = createTileIndicator(1, "#FFFFFF", GroundOverlayRenderOrder.HOVERED_TILE);
    this.scene.add(this.selectedTileMesh);

    this.animate();
  }

  checkGpu() {
    // TODO: this can become a react element
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl");
      const debugInfo = gl?.getExtension("WEBGL_debug_renderer_info");
      const gpuInfo: string = gl?.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)?.toLowerCase() ?? "none";
      if (
        gpuInfo.includes("nvidia") ||
        gpuInfo.includes("gpu") ||
        gpuInfo.includes("geforce") ||
        gpuInfo.includes("amd") ||
        gpuInfo.includes("radeon")
      ) {
        return;
      }
      if (gpuInfo === "none" || gpuInfo.includes("google") || gpuInfo.includes("apple") || gpuInfo.includes("intel")) {
        const warning = document.getElementById("gpu_warning");
        if (warning) warning.innerHTML =
          `<span style="color: #FF6666">Software rendering detected. Framerate may be low. Turn on Hardware Acceleration in your browser if you have a GPU.<br />${gpuInfo}</span>`;
      }
    } catch (err) {
      console.warn("error trying to detect gpu", err);
    }
  }

  // implementation from https://codepen.io/seanwasere/pen/BaMBoPd
  onDocumentMouseMove(e: MouseEvent) {
    this.clientCameraRotation.setPointerPosition(e.clientX, e.clientY);
  }

  onDocumentMouseDown(e: MouseEvent) {
    this.clientCameraRotation.setPointerPosition(e.clientX, e.clientY);
    if (e.button === 1) this.clientCameraRotation.setMiddleMouseDown(true);
  }

  onDocumentMouseUp(e: MouseEvent) {
    this.clientCameraRotation.setPointerPosition(e.clientX, e.clientY);
    if (e.button === 1) this.clientCameraRotation.setMiddleMouseDown(false);
  }

  onWindowBlur() {
    this.clientCameraRotation.setMiddleMouseDown(false);
  }

  onDocumentMouseWheel(e: WheelEvent) {
    const v = this.camera.position.z + e.deltaY * ZOOM_MULT;
    if (v >= 2 && v <= 20) {
      this.camera.position.z = v;
      this.orbitZoomOffset = v - cameraOrbitDistance(this.pitch.rotation.x);
    }
    e.preventDefault();
    return false;
  }

  onDocumentTouchStart(e: TouchEvent) {
    if (e.touches.length >= 1) {
      this.touchStart = e.touches[0];
    }
    if (e.touches.length === 2) {
      this.touchStart2 = e.touches[1];
    }
  }

  onDocumentTouchMove(e: TouchEvent) {
    if (!this.touchStart) {
      return;
    }
    if (e.touches.length === 1) {
      // drag - rotate
      const deltaX = (e.touches[0].clientX - this.touchStart.clientX) * TOUCH_MULT;
      const deltaY = (e.touches[0].clientY - this.touchStart.clientY) * TOUCH_MULT;
      this.yaw.rotation.y -= deltaX * ROTATE_MULT;
      const v = this.pitch.rotation.x - deltaY * ROTATE_MULT;
      this.pitch.rotation.x = Math.max(this.minimumCameraPitch, Math.min(this.maximumCameraPitch, v));
      this.touchStart = e.touches[0];
    } else if (e.touches.length === 2 && this.touchStart2 !== null) {
      // pinch - zoom
      const oldDist = Pathing.dist(this.touchStart.clientX, this.touchStart.clientY, this.touchStart2.clientX, this.touchStart2.clientY);
      const currentDist = Pathing.dist(e.touches[0].clientX, e.touches[0].clientY, e.touches[1].clientX, e.touches[1].clientY);
      const delta = (oldDist - currentDist) * TOUCH_MULT;
      const v = this.camera.position.z + delta * ZOOM_MULT;
      if (v >= 2 && v <= 20) {
        this.camera.position.z = v;
        this.orbitZoomOffset = v - cameraOrbitDistance(this.pitch.rotation.x);
      }
      this.touchStart = e.touches[0];
      this.touchStart2 = e.touches[1];
    }
    e.preventDefault();
    return false;
  }

  onDocumentTouchEnd(e: TouchEvent) {
    this.touchStart = null;
    this.touchStart2 = null;
  }

  onKeyDown(e: KeyboardEvent) {
    const allowWasd = !Settings.isUsingWasdKeybind;
    if (!allowWasd && ["w", "a", "s", "d"].includes(e.key.toLowerCase())) {
      return;
    }
    // values are desired change per second
    switch (e.key) {
      case "ArrowLeft":
      case "a":
      case "A":
        this.yawDelta = -2;
        break;
      case "ArrowRight":
      case "d":
      case "D":
        this.yawDelta = 2;
        break;
      case "ArrowUp":
      case "w":
      case "W":
        this.pitchDelta = -1;
        break;
      case "ArrowDown":
      case "s":
      case "S":
        this.pitchDelta = 1;
        break;
    }
  }

  onKeyUp(e: KeyboardEvent) {
    const allowWasd = !Settings.isUsingWasdKeybind;
    if (!allowWasd && ["w", "a", "s", "d"].includes(e.key.toLowerCase())) {
      return;
    }
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowRight":
      case "a":
      case "d":
      case "A":
      case "D":
        this.yawDelta = 0;
        break;
      case "ArrowUp":
      case "ArrowDown":
      case "w":
      case "s":
      case "W":
      case "S":
        this.pitchDelta = 0;
        break;
    }
  }

  initCameraEvents(canvas) {
    canvas.addEventListener("mousemove", this.onDocumentMouseMove.bind(this), false);
    canvas.addEventListener("mouseleave", () => { this.pickingPointer = null; }, false);
    canvas.addEventListener("mousedown", this.onDocumentMouseDown.bind(this), false);
    window.addEventListener("mouseup", this.onDocumentMouseUp.bind(this), false);
    window.addEventListener("blur", this.onWindowBlur.bind(this), false);
    canvas.addEventListener("wheel", this.onDocumentMouseWheel.bind(this), false);
    canvas.addEventListener("touchstart", this.onDocumentTouchStart.bind(this), false);
    canvas.addEventListener("touchmove", this.onDocumentTouchMove.bind(this), false);
    canvas.addEventListener("touchend", this.onDocumentTouchEnd.bind(this), false);
    window.addEventListener("keydown", this.onKeyDown.bind(this), false);
    window.addEventListener("keyup", this.onKeyUp.bind(this), false);
  }

  resize(width: number, height: number) {
    if (width === this.canvasDimensions.width && height === this.canvasDimensions.height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.uiCanvas.width = width;
    this.uiCanvas.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.canvasDimensions = { width, height };
  }

  render() {
    try {
      this.renderer.render(this.scene, this.camera);
    } catch (error) {
      if (!this.renderFailureLogged) {
        this.renderFailureLogged = true;
        console.error("[osrs-sdk] WebGL render failed", error);
      }
    }
  }

  animate() {
    if (this.renderingSuspended) return;
    this.animateHandle = requestAnimationFrame(() => this.animate());
    const now = window.performance.now();
    const frameInterval = Settings.renderFps > 0 ? 1000 / Settings.renderFps : 0;
    if (frameInterval === 0 || now >= this.nextRenderTime) {
      this.render();
      this.stats.update();
      this.lastRenderTime = now;
      this.nextRenderTime = frameInterval === 0 ? now : (this.nextRenderTime > 0 ? this.nextRenderTime + frameInterval : now + frameInterval);
      if (this.nextRenderTime < now - frameInterval * 2) this.nextRenderTime = now + frameInterval;
    }
  }

  async initialise(world: World, region: Region) {
    document.body.appendChild(this.stats.dom);

    /*const light = new THREE.PointLight(0xffffaa, 1200);
    light.position.set(region.width / 2, 30, region.height / 2);
    this.scene.add(light);*/
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 1.0);
    hemiLight.position.set(0, 100, 0);
    this.scene.add(hemiLight);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambientLight);

    const floorCanvas = new OffscreenCanvas(region.width * SPRITE_SCALE, region.height * SPRITE_SCALE);
    // workaround for https://github.com/microsoft/TypeScript/issues/53614
    const floorContext = floorCanvas.getContext("2d") as OffscreenCanvasRenderingContext2D;

    region.drawWorldBackground(floorContext, SPRITE_SCALE);

    const floorTexture = new THREE.Texture(floorCanvas);
    floorTexture.needsUpdate = true;

    const floorGeometry = new THREE.PlaneGeometry(region.width, region.height, 1, 1);
    const floorMaterial = new THREE.MeshStandardMaterial({
      map: floorTexture,
      transparent: true,
      color: 0xffffff,
      side: THREE.FrontSide,
    });
    floorGeometry.rotateX(-Math.PI / 2);
    floorGeometry.translate(region.width / 2, FLOOR_Y_POS, region.height / 2 - 1);
    const plane = new THREE.Mesh(floorGeometry, floorMaterial);
    plane.userData.clickable = true;
    // used for right-click walk here
    plane.userData.isFloor = true;
    plane.visible = Trainer.player.region.drawDefaultFloor();
    this.scene.add(plane);

    const collisionTileGeometry = new THREE.PlaneGeometry(0.9, 0.9);
    collisionTileGeometry.rotateX(-Math.PI / 2);
    const collisionTileMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      depthTest: false,
      depthWrite: false,
      opacity: 0.25,
      side: THREE.DoubleSide,
      transparent: true,
    });
    this.tileCollisionDebugMesh = new THREE.InstancedMesh(
      collisionTileGeometry,
      collisionTileMaterial,
      region.width * region.height,
    );
    this.tileCollisionDebugMesh.count = 0;
    this.tileCollisionDebugMesh.frustumCulled = false;
    this.tileCollisionDebugMesh.renderOrder = GroundOverlayRenderOrder.HOVERED_TILE + 2;
    this.scene.add(this.tileCollisionDebugMesh);

    const chunkBoundaryVertices: number[] = [];
    for (let x = 0; x <= region.width; x += CHUNK_SIZE) {
      chunkBoundaryVertices.push(x, GROUND_OVERLAY_Y, -1, x, GROUND_OVERLAY_Y, region.height - 1);
    }
    for (let y = 0; y <= region.height; y += CHUNK_SIZE) {
      const floorY = y - 1;
      chunkBoundaryVertices.push(0, GROUND_OVERLAY_Y, floorY, region.width, GROUND_OVERLAY_Y, floorY);
    }
    const chunkBoundaryGeometry = new THREE.BufferGeometry();
    chunkBoundaryGeometry.setAttribute("position", new THREE.Float32BufferAttribute(chunkBoundaryVertices, 3));
    const chunkBoundaryMaterial = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      depthTest: false,
      depthWrite: false,
      opacity: 0.8,
      transparent: true,
    });
    this.chunkDebugLines = new THREE.LineSegments(chunkBoundaryGeometry, chunkBoundaryMaterial);
    this.chunkDebugLines.renderOrder = GroundOverlayRenderOrder.HOVERED_TILE + 1;
    this.chunkDebugLines.visible = Settings.chunkDebug;
    this.scene.add(this.chunkDebugLines);

    this.scene.add(this.selectedTileMesh);

    // preload by adding a bunch of models to the scene but out of sight
    await Trainer.player.region.preload();
    await this.renderer.compileAsync(this.scene, this.camera);
  }

  reset() {
    this.knownActors.forEach((actor) => actor.destroy(this.scene));
    this.knownActors = new Map();
    this.projectedClickboxes.clear();
    this.pickingPointer = null;
    this.cameraFocalPoint.reset();
  }

  draw(world: World, region: Region) {
    this.draw3dScene(world, region);
    this.draw2dScene(world, region);

    return {
      canvas: this.canvas,
      uiCanvas: this.uiCanvas,
      flip: false,
      offsetX: 0,
      offsetY: 0,
    };
  }

  updateCamera(delta: number) {
    this.yaw.rotation.y += this.yawDelta * delta;
    this.pitch.rotation.x = Math.max(
      Math.min(this.pitch.rotation.x + this.pitchDelta * delta, this.maximumCameraPitch),
      this.minimumCameraPitch,
    );
    const angles = this.clientCameraRotation.frame({
      yaw: this.yaw.rotation.y,
      pitch: this.pitch.rotation.x,
    }, delta, Settings.relaxCameraPitch);
    this.yaw.rotation.y = angles.yaw;
    this.pitch.rotation.x = angles.pitch;
    this.camera.position.z = Math.max(
      2,
      Math.min(20, cameraOrbitDistance(this.pitch.rotation.x) + this.orbitZoomOffset),
    );
  }

  clientTick(region: Region, timestamp = window.performance.now()) {
    this.reconcileActors(region);
    this.knownActors.forEach((actor) => actor.clientTick());
    this.clientCameraRotation.clientTick();
    if (Trainer.player) {
      this.cameraFocalPoint.follow(Trainer.player.perceivedLocation, timestamp);
    }
  }

  private get minimumCameraPitch() {
    return Settings.relaxCameraPitch ? RELAXED_MIN_CAMERA_PITCH : MIN_CAMERA_PITCH;
  }

  private get maximumCameraPitch() {
    return Settings.relaxCameraPitch ? RELAXED_MAX_CAMERA_PITCH : MAX_CAMERA_PITCH;
  }

  private applyCameraFocalPosition({ x, y }: CameraFocalPosition) {
    this.pivot.position.set(x, 0, y);
  }

  draw3dScene(world: World, region: Region) {
    this.reconcileActors(region);

    const delta = this.clock.getDelta();
    if (Trainer.player) {
      // Seed a newly constructed/reset viewport without flying in from the origin.
      const now = window.performance.now();
      this.cameraFocalPoint.initialise(Trainer.player.perceivedLocation, now);
      this.applyCameraFocalPosition(this.cameraFocalPoint.getPerceivedPosition(now));
    }
    this.updateCamera(delta);
    // Projection helpers run before renderer.render(), so update the camera
    // matrices here instead of relying on Three.js to do it during rendering.
    this.camera.updateWorldMatrix(true, false);

    if (this.chunkDebugLines) this.chunkDebugLines.visible = Settings.chunkDebug;
    if (this.tileCollisionDebugMesh) {
      this.tileCollisionDebugMesh.visible = Settings.tileCollisionDebug;
      if (Settings.tileCollisionDebug) {
        const flaggedTiles = region.getTileCollisionFlagLocations();
        flaggedTiles.forEach(({ x, y }, index) => {
          this.tileCollisionDebugMatrix.makeTranslation(x + 0.5, GROUND_OVERLAY_Y, y - 0.5);
          this.tileCollisionDebugMesh.setMatrixAt(index, this.tileCollisionDebugMatrix);
        });
        this.tileCollisionDebugMesh.count = flaggedTiles.length;
        this.tileCollisionDebugMesh.instanceMatrix.needsUpdate = true;
      }
    }

    this.knownActors.forEach((actor) => actor.draw(this.scene, delta, world.tickPercent, world.clientTickPercent ?? 0));
    this.refreshProjectedClickboxes();

    // highlight selected tile
    if (this.selectedTile) {
      this.selectedTileMesh.position.x = this.selectedTile.x - 0.5;
      this.selectedTileMesh.position.y = GROUND_OVERLAY_Y;
      this.selectedTileMesh.position.z = this.selectedTile.y - 0.5;
      const hoveredTileColor = Settings.hoveredTileColor;
      (this.selectedTileMesh.material as THREE.MeshBasicMaterial).color.set(hoveredTileColor);
      this.selectedTileMesh.visible = Settings.hoveredTileEnabled;
    }
  }

  private refreshProjectedClickboxes() {
    // Bounds follow the rendered pose/camera. Only pointer candidates need
    // projected triangle vertices; debugging must not force that work.
    this.projectedClickboxes.clear();
    this.knownActors.forEach((actor, renderable) => {
      if (!(renderable instanceof Mob) || !renderable.selectable) return;
      const model = actor.getModel();
      if (!model?.getClickboxVertices) return;
      const bounds = model.getClickboxBounds?.();
      const depth = bounds ? boundsDepthRange(bounds, this.camera.matrixWorldInverse) : null;
      if (depth && !isInFrontOfNearPlane(depth.min, this.camera.near)) return;
      // Project a broad rectangle only when all box corners are in front.
      // Fine triangle picking individually rejects near-clipped triangles.
      let screenBounds: ScreenBounds | undefined;
      if (bounds && depth && isInFrontOfNearPlane(depth.max, this.camera.near)) {
        screenBounds = this.projectBoundsToScreen(bounds);
      } else if (!model.getClickboxTriangles) {
        const vertices = model.getClickboxVertices();
        if (!vertices.length || !vertices.every((vertex) => this.isInFrontOfCameraNearPlane(vertex))) return;
      }
      this.projectedClickboxes.set(renderable, {
        model, worldBounds: bounds ?? undefined, bounds: screenBounds,
        tolerance: renderable.size === 1 && model.getClickboxTriangles ? 0 : renderable.size === 1 ? 20 : 5,
      });
    });
    // A mouse event's projections were invalidated above. Refine candidates at
    // the current pointer so picking/debugging use this draw's animated pose,
    // including when the pointer stays still and an actor moves underneath it.
    if (this.pickingPointer) this.getProjectedMobsAt(this.pickingPointer);
  }

  private getProjectedMobsAt(point: ScreenPoint): Mob[] {
    const mobs: Mob[] = [];
    const { width, height } = this.canvasDimensions;
    this.raycaster.setFromCamera(new THREE.Vector2(point.x / width * 2 - 1, 1 - point.y / height * 2), this.camera);
    this.projectedClickboxes.forEach((clickbox, mob) => {
      const { bounds, tolerance, worldBounds, model } = clickbox;
      if (bounds && !screenBoundsContain(bounds, point, tolerance + 1)) return;
      if (model.getClickboxTriangles && worldBounds) {
        const boxHit = this.raycaster.ray.intersectsBox(worldBounds);
        if (mob.size === 1) {
          clickbox.refined = true;
          if (!clickbox.hull && bounds) clickbox.hull = convexHull(this.projectBoxCorners(worldBounds));
          if (boxHit) mobs.push(mob);
          return;
        }
        if (!boxHit) return;
      }
      if (model.getClickboxTriangles) {
        if (!clickbox.vertices) {
          clickbox.vertices = (model.getClickboxVertices?.() ?? []).map(vertex =>
            this.isInFrontOfCameraNearPlane(vertex) ? this.projectToClientScreen(vertex) : null);
          clickbox.triangles = model.getClickboxTriangles();
        }
        clickbox.refined = true;
        if (projectedTrianglesContain(clickbox.vertices, clickbox.triangles!, point, 5)) mobs.push(mob);
      } else {
        // Custom renderers without triangle data retain their previous hull path.
        const hull = this.getProjectedClickboxHull(mob);
        clickbox.refined = true;
        if (hull.length >= 3 && projectedHullContains(hull, point, tolerance)) mobs.push(mob);
      }
    });
    return mobs;
  }

  private getProjectedClickboxHull(mob: Mob) {
    const clickbox = this.projectedClickboxes.get(mob);
    if (!clickbox) return [];
    if (!clickbox.hull) {
      clickbox.hull = convexHull((clickbox.model.getClickboxVertices?.() ?? [])
        .map((vertex) => this.projectToScreen(vertex)));
      if (clickbox.hull.length < 3) this.projectedClickboxes.delete(mob);
    }
    return clickbox.hull;
  }

  private projectBoundsToScreen(bounds: THREE.Box3): ScreenBounds {
    const result = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const point of this.projectBoxCorners(bounds)) {
      result.minX = Math.min(result.minX, point.x); result.maxX = Math.max(result.maxX, point.x);
      result.minY = Math.min(result.minY, point.y); result.maxY = Math.max(result.maxY, point.y);
    }
    return result;
  }

  private projectBoxCorners(bounds: THREE.Box3): ScreenPoint[] {
    const points: ScreenPoint[] = [];
    const corner = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? bounds.max.x : bounds.min.x,
        i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z);
      points.push(this.projectToScreen(corner));
    }
    return points;
  }

  private reconcileActors(region: Region) {
    const activeRenderables = new Set(region.getRenderables());

    this.knownActors.forEach((actor, renderable) => {
      if (!activeRenderables.has(renderable) || actor.shouldRemove()) {
        actor.destroy(this.scene);
        this.knownActors.delete(renderable);
      }
    });

    activeRenderables.forEach((renderable) => {
      if (!renderable.shouldDestroy() && !this.knownActors.has(renderable)) {
        this.knownActors.set(renderable, new Actor(renderable));
      }
    });
  }

  draw2dScene(world: World, region: Region) {
    // draw UI elements into a separate canvas that gets drawn over the 3d canvas
    this.uiCanvasContext.clearRect(0, 0, this.uiCanvas.width, this.uiCanvas.height);
    const translator = (pos: Location, z = 0) => this.projectToScreen(new THREE.Vector3(pos.x, z, pos.y));

    const getUILayerProjector = (r: Renderable): UILayerProjector => {
      const perceivedLocation = r.getPerceivedLocation(world.tickPercent);
      const model = this.knownActors.get(r)?.getModel();
      const modelLogicalHeight = model?.getLogicalHeight?.();
      const logicalHeight = modelLogicalHeight ?? r.logicalHeight;
      const center = {
        x: perceivedLocation.x + r.size / 2,
        y: perceivedLocation.y - r.size / 2,
      };
      const bounds = model?.getClickboxBounds?.();
      const depth = bounds ? boundsDepthRange(bounds, this.camera.matrixWorldInverse) : null;
      // Most actors are wholly in front of the near plane. Use their cached
      // bounds instead of transforming every model vertex again for UI.
      const boundsVisible = depth && isInFrontOfNearPlane(depth.max, this.camera.near);
      const boundsHidden = depth && !isInFrontOfNearPlane(depth.min, this.camera.near);
      const modelVertices = boundsVisible || boundsHidden ? [] : model?.getClickboxVertices?.() ?? [];
      const visibilityPoints = modelVertices.length > 0
        ? modelVertices
        : [
          new THREE.Vector3(center.x, perceivedLocation.z, center.y),
          new THREE.Vector3(center.x, perceivedLocation.z + logicalHeight, center.y),
        ];
      return {
        logicalHeight,
        visible: boundsVisible ? true : boundsHidden ? false
          : visibilityPoints.every((point) => this.isInFrontOfCameraNearPlane(point)),
        atHeight: (height) => translator(center, perceivedLocation.z + height),
      };
    };
    const units: Unit[] = [...region.players, ...(world.getReadyTimer <= 0 ? region.mobs : [])];

    const renderables: Renderable[] = (units as Renderable[]).concat(region.entities);

    renderables.forEach((r) => {
      r.drawUILayer(world.tickPercent, getUILayerProjector(r), this.uiCanvasContext, SPRITE_SCALE);
    });

    if (Settings.displayClickboxes) {
      this.projectedClickboxes.forEach(({ hull, bounds, tolerance, refined, vertices, triangles }) => {
        if (!refined && !bounds) return;
        if (refined && !vertices && !hull && !bounds) return;
        this.uiCanvasContext.save();
        this.uiCanvasContext.beginPath();
        if (refined && vertices && triangles) {
          // Display the union of the actual padded face rectangles. These
          // projections already exist from picking; never project for debug.
          for (let i = 0; i < triangles.length; i += 3) {
            const a = vertices[triangles[i]], b = vertices[triangles[i + 1]], c = vertices[triangles[i + 2]];
            if (!a || !b || !c) continue;
            const face = projectedTriangleBounds(a, b, c);
            this.uiCanvasContext.rect(face.minX - 5, face.minY - 5,
              face.maxX - face.minX + 10, face.maxY - face.minY + 10);
          }
        } else if (refined && hull && hull.length >= 3) {
          this.uiCanvasContext.moveTo(hull[0].x, hull[0].y);
          hull.slice(1).forEach((point) => this.uiCanvasContext.lineTo(point.x, point.y));
        } else {
          // Amber is the conservative pointer-rejection rectangle.
          this.uiCanvasContext.rect(bounds.minX, bounds.minY,
            bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
        }
        this.uiCanvasContext.closePath();
        this.uiCanvasContext.fillStyle = refined ? "rgba(0, 255, 255, 0.12)" : "rgba(255, 180, 0, 0.08)";
        this.uiCanvasContext.fill();
        // Triangle padding is already included in each rectangle above.
        this.uiCanvasContext.lineJoin = "round";
        this.uiCanvasContext.lineWidth = Math.max(1, vertices ? 1 : tolerance * 2);
        this.uiCanvasContext.strokeStyle = refined ? "rgba(0, 255, 255, 0.25)" : "rgba(255, 180, 0, 0.20)";
        this.uiCanvasContext.stroke();
        this.uiCanvasContext.lineWidth = 1;
        this.uiCanvasContext.strokeStyle = refined ? "#00ffff" : "#ffb400";
        this.uiCanvasContext.stroke();
        this.uiCanvasContext.restore();
      });
    }
  }

  // return canvas coordinates from world coordinates
  private isInFrontOfCameraNearPlane(vector: THREE.Vector3) {
    const cameraSpaceZ = vector.clone().applyMatrix4(this.camera.matrixWorldInverse).z;
    return isInFrontOfNearPlane(cameraSpaceZ, this.camera.near);
  }

  projectToScreen(vector: THREE.Vector3) {
    const newVector = vector.clone();
    newVector.project(this.camera);
    const { width, height } = this.canvasDimensions;
    return {
      x: Math.round((newVector.x + 1) * (width / 2)),
      y: Math.round((-newVector.y + 1) * (height / 2)),
    };
  }

  private projectToClientScreen(vector: THREE.Vector3): ScreenPoint {
    const projected = vector.clone().project(this.camera);
    const { width, height } = this.canvasDimensions;
    // The client adds an integer viewport centre to an integer-divided offset.
    // Truncate the offset toward zero, rather than rounding the final pixel.
    return { x: Math.floor(width / 2) + Math.trunc(projected.x * width / 2),
      y: Math.floor(height / 2) + Math.trunc(-projected.y * height / 2) };
  }

  // return intersection with world object or world coordinates from canvas coordinates
  translateClick(offsetX, offsetY, world, viewport) {
    const { width, height } = this.canvasDimensions;
    const rayX = (offsetX / width) * 2 - 1;
    const rayY = -(offsetY / height) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(rayX, rayY), this.camera);
    // check intersection of the ray and the flor plane
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), FLOOR_Y_POS);
    const floor = new THREE.Vector3(0, 0, 0);
    this.raycaster.ray.intersectPlane(floorPlane, floor);

    this.selectedTile = {
      x: Math.floor(floor.x) + 0.5,
      y: Math.floor(floor.z) + 1.5,
    };
    const point = { x: offsetX, y: offsetY };
    this.pickingPointer = point;
    const projectedMobs = this.getProjectedMobsAt(point);

    const intersections = this.raycaster.intersectObjects(
      this.scene.children.filter((child) =>
        child.userData.clickable === true && !this.projectedClickboxes.has(child.userData.unit),
      ),
      true,
    );

    // Non-cache models retain the existing Three.js raycast fallback.
    const raycastMobs = intersections
      .filter((i) => i.object.userData.unit instanceof Mob)
      .map((i) => i.object.userData.unit as Mob);
    const mobs = _.uniq(projectedMobs.concat(raycastMobs));

    // Note: we currently only handle clicking on mobs
    if (mobs.length > 0) {
      return {
        type: "entities" as const,
        mobs,
        players: [],
        groundItems: [],
        location: {
          x: this.selectedTile.x,
          y: this.selectedTile.y,
        },
      };
    }
    return {
      type: "coordinate" as const,
      location: {
        x: this.selectedTile.x,
        y: this.selectedTile.y,
      },
    };
  }

  setMapRotation(direction: CardinalDirection) {
    if (direction === CardinalDirection.SOUTH) {
      this.yaw.rotation.y = Math.PI;
    } else if (direction === CardinalDirection.NORTH) {
      this.yaw.rotation.y = 0;
    } else if (direction === CardinalDirection.EAST) {
      this.yaw.rotation.y = -Math.PI / 2;
    } else if (direction === CardinalDirection.WEST) {
      this.yaw.rotation.y = Math.PI / 2;
    }
  }

  getMapRotation(): number {
    return this.yaw.rotation.y;
  }
}
