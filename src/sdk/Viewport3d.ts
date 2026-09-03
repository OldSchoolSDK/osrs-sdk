"use strict";
import { World } from "./World";
import { Viewport, ViewportDelegate } from "./Viewport";
import { CardinalDirection, Region } from "./Region";

import * as THREE from "three";
import Stats from "three/examples/jsm/libs/stats.module";

import { Settings } from "./Settings";
import { Player } from "./Player";
import { Mob } from "./Mob";
import { Renderable, UILayerProjector } from "./Renderable";
import { Location } from "./Location";
import { Actor } from "./rendering/Actor";
import _ from "lodash";
import { Unit } from "./Unit";
import { Trainer } from "./Trainer";
import { Pathing } from "./Pathing";
import { drawLineOnTop, GROUND_OVERLAY_Y, GroundOverlayRenderOrder } from "./rendering/RenderUtils";

// how many pixels wide should 2d elements be scaled to
const SPRITE_SCALE = 32;

const MIN_PITCH = -Math.PI / 2;
const MAX_PITCH = 0.1;

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

  private touchStart: Touch | null = null;
  private touchStart2: Touch | null = null;

  private stats = new Stats();

  private knownActors: Map<Renderable, Actor> = new Map();

  private selectedTile: Location | null = null;
  private selectedTileMesh: THREE.LineSegments;

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
    this.camera.position.set(0, 1, 0);
    this.pivot.position.set(0, 0, 0);
    // Face south
    if (faceCameraSouth) {
      this.yaw.rotation.y = Math.PI;
    }
    // Pitch down slightly
    this.pitch.rotation.x = -0.7;
    // Zoom out
    this.camera.position.z = 12;
    this.scene.add(this.pivot);
    this.pivot.add(this.yaw);
    this.yaw.add(this.pitch);
    this.pitch.add(this.camera);

    const lineMaterial = new THREE.LineBasicMaterial({
      color: "#FFFFFF",
      linewidth: 2,
    });
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1, 0, -1),
      new THREE.Vector3(1, 0, -1),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 0, 0),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    this.selectedTileMesh = new THREE.LineSegments(geometry, lineMaterial);
    drawLineOnTop(this.selectedTileMesh, GroundOverlayRenderOrder.HOVERED_TILE);
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
    if ((e.buttons & 4) !== 4) return;
    this.yaw.rotation.y -= e.movementX * ROTATE_MULT;
    const v = this.pitch.rotation.x - e.movementY * ROTATE_MULT;
    if (v > MIN_PITCH && v < MAX_PITCH) {
      this.pitch.rotation.x = v;
    }
    return false;
  }

  onDocumentMouseWheel(e: WheelEvent) {
    const v = this.camera.position.z + e.deltaY * ZOOM_MULT;
    if (v >= 2 && v <= 20) {
      this.camera.position.z = v;
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
      if (v > MIN_PITCH && v < MAX_PITCH) {
        this.pitch.rotation.x = v;
      }
      this.touchStart = e.touches[0];
    } else if (e.touches.length === 2 && this.touchStart2 !== null) {
      // pinch - zoom
      const oldDist = Pathing.dist(this.touchStart.clientX, this.touchStart.clientY, this.touchStart2.clientX, this.touchStart2.clientY);
      const currentDist = Pathing.dist(e.touches[0].clientX, e.touches[0].clientY, e.touches[1].clientX, e.touches[1].clientY);
      const delta = (oldDist - currentDist) * TOUCH_MULT;
      const v = this.camera.position.z + delta * ZOOM_MULT;
      if (v >= 2 && v <= 20) {
        this.camera.position.z = v;
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

    this.scene.add(this.selectedTileMesh);

    // preload by adding a bunch of models to the scene but out of sight
    await Trainer.player.region.preload();
    await this.renderer.compileAsync(this.scene, this.camera);
  }

  reset() {
    this.knownActors.forEach((actor) => actor.destroy(this.scene));
    this.knownActors = new Map();
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
    this.pitch.rotation.x = Math.max(Math.min(this.pitch.rotation.x + this.pitchDelta * delta, MAX_PITCH), MIN_PITCH);
  }

  draw3dScene(world: World, region: Region) {
    this.reconcileActors(region);

    const delta = this.clock.getDelta();
    region.players.forEach((player: Player) => {
      const location = player.getPerceivedLocation(world.tickPercent);
      const target = new THREE.Vector3(location.x + 0.5, 0, location.y - 0.5);
      // Frame-rate independent smoothing keeps camera and player sampling in
      // the same interpolated coordinate space.
      this.pivot.position.lerp(target, 1 - Math.exp(-8 * delta));
    });
    this.updateCamera(delta);

    this.knownActors.forEach((actor) => actor.draw(this.scene, delta, world.tickPercent));

    // highlight selected tile
    if (this.selectedTile) {
      this.selectedTileMesh.position.x = this.selectedTile.x - 0.5;
      this.selectedTileMesh.position.y = GROUND_OVERLAY_Y;
      this.selectedTileMesh.position.z = this.selectedTile.y - 0.5;
      this.selectedTileMesh.visible = !Trainer.clickController.hasSelectedMob();
    }
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
      const modelLogicalHeight = this.knownActors.get(r)?.getModel()?.getLogicalHeight?.();
      const logicalHeight = modelLogicalHeight ?? r.logicalHeight;
      const center = {
        x: perceivedLocation.x + r.size / 2,
        y: perceivedLocation.y - r.size / 2,
      };
      return {
        logicalHeight,
        atHeight: (height) => translator(center, perceivedLocation.z + height),
      };
    };
    const units: Unit[] = [...region.players, ...(world.getReadyTimer <= 0 ? region.mobs : [])];

    const renderables: Renderable[] = (units as Renderable[]).concat(region.entities);

    renderables.forEach((r) => {
      r.drawUILayer(world.tickPercent, getUILayerProjector(r), this.uiCanvasContext, SPRITE_SCALE);
    });
  }

  // return canvas coordinates from world coordinates
  projectToScreen(vector: THREE.Vector3) {
    const newVector = vector.clone();
    newVector.project(this.camera);
    const { width, height } = this.canvasDimensions;
    return {
      x: Math.round((newVector.x + 1) * (width / 2)),
      y: Math.round((-newVector.y + 1) * (height / 2)),
    };
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
    const intersections = this.raycaster.intersectObjects(
      this.scene.children.filter((c) => c.userData.clickable === true),
      true,
    );

    // check if there were any NPCs on the way.
    const mobs = intersections
      .filter((i) => i.object.userData.unit instanceof Mob)
      .map((i) => i.object.userData.unit as Mob);

    // Note: we currently only handle clicking on mobs
    if (mobs.length > 0) {
      return {
        type: "entities" as const,
        mobs: _.uniq(mobs),
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
    }
  }

  getMapRotation(): number {
    return this.yaw.rotation.y;
  }
}
