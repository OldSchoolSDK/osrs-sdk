import * as THREE from "three";
import { Location3 } from "../Location";
import { AnimationMetadata, Renderable, RenderableListener } from "../Renderable";
import { CacheRender } from "./CacheRenderBundle";
import { CacheRenderReference, CacheRenderSpotAnim } from "./CacheRenderReference";
import { Model } from "./Model";
import { ClickboxController } from "./utils/clickbox";
import { drawLineOnTop, GROUND_OVERLAY_Y, GroundOverlayRenderOrder } from "./RenderUtils";
import { Settings } from "../Settings";
import type { CacheRenderAnimation, CacheRenderPayload, CacheRenderRawFrame } from "../../cache-render-format";
import { AnimationFrameSoundPlayer, preloadAnimationFrameSounds } from "./AnimationFrameSounds";
import { applyBlendedRawFrames, applyMayaFrame, applyRawFrame, interpolateMayaFrames, interpolateRawFrames, RawFrameWorkspace, sampleAnimation } from "./utils/animations";
import { cachedPayload, mergePayloads } from "./utils/payloadUtils";
import { CLIENT_CYCLES_PER_SECOND } from "../utils/constants";
import { cacheAlphaToOpacity, cacheColorsToRgb, cacheColorsToRgba, cacheColorToRgb, normalizeCacheAlpha, resolveCacheColor } from "./utils/colors";

const DRAW_CLICKBOX_DEBUG = false;
const DRAW_CACHE_MODEL_WIREFRAME = false;

type RawFrame = CacheRenderRawFrame;
type AnimationPayload = CacheRenderAnimation;
type Payload = CacheRenderPayload;
type SpotAnimRuntime = { interpolatedMayaFrame: number[][]; animayaGroups: number[][]; animayaScales: number[][]; posedPositions: Float32Array; posedAlphas: Float32Array; workspace: RawFrameWorkspace; interpolatedFrame: RawFrame; mesh: THREE.Mesh; basePositions: Float32Array; vertexGroups: number[][]; sourceVertices: number[]; baseAlphas: Float32Array; alphaGroups: number[][]; animationId?: number; animation?: AnimationPayload; scaleX: number; scaleY: number; rotation: number; height: number; delay: number };

function spotAnimChannel(spotAnim: CacheRenderSpotAnim) {
  return spotAnim.channel ?? String(spotAnim.id);
}

function enableVertexAlpha(material: THREE.Material) {
  material.transparent = true;
  material.alphaTest = 0.01;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float cacheAlpha; varying float vCacheAlpha;\n${shader.vertexShader}`
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvCacheAlpha = cacheAlpha;");
    shader.fragmentShader = `varying float vCacheAlpha;\n${shader.fragmentShader}`
      .replace("void main() {", "void main() {\n\tif (vCacheAlpha < 0.01) discard;")
      .replace("#include <alphatest_fragment>", "diffuseColor.a *= vCacheAlpha;\n\t#include <alphatest_fragment>")
      .replace("#include <output_fragment>", "#include <output_fragment>\n\tgl_FragColor.a *= vCacheAlpha;");
  };
}

function needsVertexAlpha(payload: Payload) {
  // A model with only opaque faces must stay in Three.js's opaque render
  // queue. Putting it in the transparent queue changes its sorting against
  // effects such as Sol's sand pools, even though cacheAlpha is always one.
  // Include legacy type-5 transforms because they can animate face alpha
  // after an initially-opaque model has loaded.
  return Boolean(
    payload.alphas?.some((alpha) => alpha !== 0) ||
    Object.values(payload.animations ?? {}).some((animation) =>
      animation.rawFrames?.some((frame) => frame.types.includes(5)),
    ),
  );
}

export type CacheRenderModelOptions = {
  /** Delay applied to every cache-authored animation frame sound. */
  frameSoundDelayMs?: number;
  /** Called once when a spotanim-only renderable reaches the end of its sequence. */
  onSpotAnimComplete?: () => void;
  /**
   * Optional additional root yaw in radians. Cache spotanims used as
   * standalone world graphics use a zero-degree basis, while spotanims used
   * as projectile models share the actor/model cache basis.
   */
  basisRotation?: number;
  /** Repeat spotanim sequences for the lifetime of the owning renderable. */
  loopSpotAnims?: boolean;
};

/** Three.js implementation for decoded cache geometry. Cache extraction owns the conversion from OSRS frames to this payload. */
export class CacheRenderModel implements Model, RenderableListener {
  private root = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private ready: Promise<void> | null = null;
  private lastPose = -1;
  private activeAnimation = -1;
  private animations: Record<string, AnimationPayload> = {};
  private poseMap: Record<string, number> = {};
  private animationTime = 0;
  private animationRevision = 0;
  private presentedAnimationRevision = -1;
  private presentedAnimationFraction = -1;
  private presentedSmoothAnimations: boolean | undefined;
  private readonly interpolatedMayaFrame: number[][] = [];
  private animationStartsOnNextCycle = false;
  private poseAnimationTime = 0;
  private animationPlaying = false;
  private animationCanBlendWithPose = false;
  private animationPromiseResolve: (() => void) | null = null;
  private frameSoundPlayer: AnimationFrameSoundPlayer;
  private spotFrameSoundPlayers = new Map<number, AnimationFrameSoundPlayer>();
  private frameSoundsReady: Promise<void> = Promise.resolve();
  private basePositions: Float32Array | null = null;
  private posedPositions = new Float32Array(0);
  private posedAlphas = new Float32Array(0);
  private readonly rawFrameWorkspace = new RawFrameWorkspace();
  private readonly interpolatedFrame: RawFrame = { types: [], maps: [], indexFrameIds: [], x: [], y: [], z: [] };
  private baseAlphas: Float32Array | null = null;
  private vertexGroups: number[][] = [];
  private alphaGroups: number[][] = [];
  private sourceVertices: number[] = [];
  private logicalHeight: number | null = null;
  private animayaGroups: number[][] = [];
  private animayaScales: number[][] = [];
  private spotAnims: SpotAnimRuntime[] = [];
  private activeSpotAnims: CacheRenderSpotAnim[] = [];
  // Attached spotanims have their own one-shot clock. They follow the actor's
  // world transform, but must not depend on whether the actor is currently
  // playing an idle, walk, or one-shot animation.
  private spotAnimClock = 0;
  private spotAnimStarts = new Map<string, number>();
  private spotAnimPlacements = new Map<string, CacheRenderSpotAnim>();
  private spotAnimCompletionNotified = false;
  private outline: THREE.LineSegments | null = null;
  private trueTile: THREE.LineSegments;
  private clickbox: THREE.Mesh | null = null;
  private modelGeneration = 0;
  private meshGeneration = -1;
  private readonly clickboxController: ClickboxController;

  constructor(
    private renderable: Renderable,
    private reference: CacheRenderReference,
    private options: CacheRenderModelOptions = {},
  ) {
    this.clickboxController = new ClickboxController(() => this.renderable.size);
    this.frameSoundPlayer = new AnimationFrameSoundPlayer(options.frameSoundDelayMs);
    this.setActiveSpotAnims(this.currentSpotAnims(reference.kind === "model" || reference.kind === "asset" ? undefined : reference.spotAnims));
    // A spotanim-only renderable has no actor animation transition to start
    // playback. Its own graphic timeline begins once geometry is ready.
    if (reference.kind === "spotAnim") {
      this.animationPlaying = true;
      this.animationStartsOnNextCycle = true;
    }
    // Viewport3d filters scene roots before recursively raycasting children.
    // Mark this group as belonging to the renderable so its box hitbox is
    // considered as a click target.
    this.root.userData.clickable = renderable.selectable;
    this.root.userData.unit = renderable;
    const size = renderable.size;
    const points = [
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(size, 0, 0),
      new THREE.Vector3(size, 0, 0), new THREE.Vector3(size, 0, -size),
      new THREE.Vector3(size, 0, -size), new THREE.Vector3(0, 0, -size),
      new THREE.Vector3(0, 0, -size), new THREE.Vector3(0, 0, 0),
    ];
    this.trueTile = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: Settings.trueTileColor ?? "#00FFFF" }),
    );
  }
  static forRenderable(renderable: Renderable, reference: CacheRenderReference, options?: CacheRenderModelOptions) {
    return new CacheRenderModel(renderable, reference, options);
  }
  getClickboxVertices() { return this.clickboxController.getVertices(); }
  getClickboxBounds() { return this.clickboxController.getBounds(); }
  getClickboxTriangles() { return this.clickboxController.getTriangles(); }
  spotAnimChanged(spotAnims: CacheRenderSpotAnim[]) { this.setActiveSpotAnims(spotAnims); }
  private setActiveSpotAnims(spotAnims: CacheRenderSpotAnim[]) {
    const starts = new Map<string, number>();
    const placements = new Map<string, CacheRenderSpotAnim>();
    spotAnims.forEach((spotAnim) => {
      const channel = spotAnimChannel(spotAnim);
      const previous = this.spotAnimPlacements.get(channel);
      starts.set(channel, previous === spotAnim ? (this.spotAnimStarts.get(channel) ?? this.spotAnimClock) : this.spotAnimClock + 1 / CLIENT_CYCLES_PER_SECOND);
      placements.set(channel, spotAnim);
    });
    this.activeSpotAnims = spotAnims.slice();
    this.spotAnimStarts = starts;
    this.spotAnimPlacements = placements;
    this.animationRevision++;
  }
  private currentSpotAnims(fallback?: CacheRenderSpotAnim[]) {
    const attached = this.renderable.spotAnims;
    return attached.length ? attached.slice() : (fallback ?? []).slice();
  }
  animationChanged(id: number, blend: boolean): Promise<void> {
    this.animationRevision++;
    // SDK callers use semantic pose indices (e.g. FireBow = 6), while the
    // bundle is keyed by the actual cache sequence ID (e.g. 426).
    this.activeAnimation = this.poseMap[String(id)] ?? id;
    this.animationTime = 0;
    this.animationStartsOnNextCycle = true;
    this.animationPlaying = true;
    this.animationCanBlendWithPose = blend;
    this.frameSoundPlayer.reset();
    return new Promise<void>((resolve) => {
      this.animationPromiseResolve = resolve;
    });
  }
  getAnimationMetadata(id: number): AnimationMetadata | undefined {
    const animation = this.animations[String(this.poseMap[String(id)] ?? id)];
    if (!animation) return undefined;
    return {
      precedenceAnimating: animation.precedenceAnimating,
      priority: animation.priority,
    };
  }
  getActiveAnimationMetadata(): AnimationMetadata | undefined {
    if (!this.animationPlaying) return undefined;
    const animation = this.animations[String(this.activeAnimation)];
    if (!animation) return undefined;
    return {
      precedenceAnimating: animation.precedenceAnimating,
      priority: animation.priority,
    };
  }
  modelChanged() {
    const next = this.renderable.get3dModel();
    const nextPrimary = (next as any)?.getPrimaryModel?.();
    if (next instanceof CacheRenderModel && next !== this) this.reference = next.reference;
    else if (nextPrimary instanceof CacheRenderModel) this.reference = nextPrimary.reference;
    this.ready = null;
    this.modelGeneration++;
    this.meshGeneration = -1;
    this.animations = {};
    this.poseMap = {};
    this.lastPose = -1;
    this.activeAnimation = -1;
    this.animationTime = 0;
    this.animationStartsOnNextCycle = false;
    this.poseAnimationTime = 0;
    this.animationPlaying = false;
    this.animationCanBlendWithPose = false;
    this.frameSoundPlayer.reset();
    this.spotFrameSoundPlayers.clear();
    this.frameSoundsReady = Promise.resolve();
    this.basePositions = null;
    this.baseAlphas = null;
    this.vertexGroups = [];
    this.alphaGroups = [];
    this.sourceVertices = [];
    this.logicalHeight = null;
    this.animayaGroups = [];
    this.animayaScales = [];
    this.spotAnims = [];
    this.setActiveSpotAnims(this.currentSpotAnims(this.reference.kind === "model" || this.reference.kind === "asset" ? undefined : this.reference.spotAnims));
    this.spotAnimCompletionNotified = false;
  }
  async preload() {
    await this.ensureLoaded();
    await this.frameSoundsReady;
  }

  private async ensureLoaded() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const generation = this.modelGeneration;
      const previousChildren = this.root.children.slice();
      const previousOutline = this.outline;
      const previousClickbox = this.clickbox;
      const bundle = await CacheRender.bundle();
      const assetIds = bundle.assetIds(this.reference);
      const sharedAssetIds = bundle.sharedAssetIds(this.reference);
      const payloads = await Promise.all([...assetIds, ...sharedAssetIds].map((id) => cachedPayload(bundle, id)));
      // Preload effect meshes independently of the active list. Gameplay can
      // attach a Spotanim later without invalidating/rebuilding the base model.
      // Spotanim-only effects should load only the requested graphic. Actor
      // models retain the eager path because gameplay may attach effects later.
      const spotIds = this.reference.kind === "spotAnim"
        ? bundle.spotAnimIds(this.reference)
        : bundle.allSpotAnimIds();
      const spotPayloads = await Promise.all(spotIds.map((id) => cachedPayload(bundle, id)));
      if (generation !== this.modelGeneration) return;
      const payload = mergePayloads(payloads);
      Object.assign(this.animations, payload.animations ?? {});
      Object.assign(this.poseMap, payload.poseMap ?? {});
      this.frameSoundsReady = preloadAnimationFrameSounds([
        ...Object.values(this.animations),
        ...spotPayloads.reduce<AnimationPayload[]>((all, spotPayload) => all.concat(Object.values(spotPayload.animations ?? {})), []),
      ]).catch((error) => console.error("[osrs-sdk] Cache animation sound preload failed", error));
      if (this.animationPlaying && !this.animations[String(this.activeAnimation)]) {
        this.activeAnimation = this.poseMap[String(this.activeAnimation)] ?? this.activeAnimation;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(payload.positions, 3));
      if (payload.uvs?.length === (payload.positions.length / 3) * 2) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(payload.uvs, 2));
      if (payload.colors && payload.colors.length * 3 === payload.positions.length) {
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(cacheColorsToRgb(payload.colors), 3));
      }
      const rawAlphas = payload.alphas?.length === payload.positions.length / 3
        ? payload.alphas.map(normalizeCacheAlpha)
        : Array(payload.positions.length / 3).fill(0);
      const hasVertexAlpha = needsVertexAlpha(payload);
      const alphaValues = rawAlphas.map(cacheAlphaToOpacity);
      geometry.setAttribute("cacheAlpha", new THREE.Float32BufferAttribute(alphaValues, 1));
      geometry.setIndex(payload.indices ?? []);
      geometry.computeBoundingSphere();
      // Cache payload colours already contain the game client's model lighting.
      const materials: THREE.Material[] = [new THREE.MeshBasicMaterial({ color: payload.color ?? 0xffffff, vertexColors: Boolean(payload.colors?.length), wireframe: DRAW_CACHE_MODEL_WIREFRAME })];
      if (hasVertexAlpha && !DRAW_CACHE_MODEL_WIREFRAME) enableVertexAlpha(materials[0]);
      const textureMaterial = new Map<number, number>();
      Object.entries(payload.textures ?? {}).forEach(([id, texture]) => {
        const rgba = new Uint8Array(texture.pixels.length * 4);
        texture.pixels.forEach((pixel, index) => { const value = pixel >>> 0; rgba[index * 4] = value >> 16 & 255; rgba[index * 4 + 1] = value >> 8 & 255; rgba[index * 4 + 2] = value & 255; rgba[index * 4 + 3] = value >> 24 & 255; });
        const image = new THREE.DataTexture(rgba, texture.width, texture.height, THREE.RGBAFormat); image.flipY = false; image.needsUpdate = true;
        textureMaterial.set(Number(id), materials.length);
        const textureMaterialInstance = new THREE.MeshBasicMaterial({ map: image, vertexColors: Boolean(payload.colors?.length), wireframe: DRAW_CACHE_MODEL_WIREFRAME });
        if (hasVertexAlpha && !DRAW_CACHE_MODEL_WIREFRAME) enableVertexAlpha(textureMaterialInstance);
        materials.push(textureMaterialInstance);
      });
      if (payload.textureIds?.length) {
        geometry.clearGroups();
        for (let vertex = 0; vertex < payload.textureIds.length; vertex += 3) geometry.addGroup(vertex, 3, textureMaterial.get(payload.textureIds[vertex]) ?? 0);
      }
      const mesh = new THREE.Mesh(geometry, materials.length > 1 ? materials : materials[0]);
      const modelScale = payload.scale ?? 1;
      this.root.scale.set(modelScale, modelScale, modelScale);
      this.updateLogicalHeight(geometry.getAttribute("position") as THREE.BufferAttribute);
      this.basePositions = new Float32Array(payload.positions);
      this.posedPositions = new Float32Array(payload.positions.length);
      this.posedAlphas = new Float32Array(rawAlphas.length);
      this.baseAlphas = new Float32Array(rawAlphas);
      this.vertexGroups = payload.vertexGroups ?? [];
      this.alphaGroups = payload.alphaGroups ?? [];
      this.sourceVertices = payload.sourceVertices ?? Array.from({ length: payload.positions.length / 3 }, (_, index) => index);
      this.animayaGroups = payload.animayaGroups ?? [];
      this.animayaScales = payload.animayaScales ?? [];
      mesh.userData.clickable = this.renderable.selectable;
      mesh.userData.unit = this.renderable;
      mesh.userData.cacheAnimations = payload.animations ?? {};
      this.root.add(mesh);
      if (DRAW_CLICKBOX_DEBUG) {
        // Share the animated geometry so this shows the exact model surface
        // that Three.js tests when no custom clickbox is supplied.
        const clickGeometryDebug = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.7, depthTest: false, depthWrite: false, wireframe: true }),
        );
        clickGeometryDebug.renderOrder = 10;
        clickGeometryDebug.raycast = () => { };
        this.root.add(clickGeometryDebug);
      }
      this.clickbox = null;
      const clickboxRadius = this.renderable.clickboxRadius;
      if (payload.geometryClickbox) {
        const clickGeometry = new THREE.BufferGeometry();
        clickGeometry.setAttribute("position", new THREE.Float32BufferAttribute(payload.geometryClickbox.positions, 3));
        clickGeometry.setIndex(payload.geometryClickbox.indices ?? []);
        const hitbox = new THREE.Mesh(clickGeometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        hitbox.userData.cacheGeometryClickbox = true;
        hitbox.userData.clickable = this.renderable.selectable;
        hitbox.userData.unit = this.renderable;
        this.clickbox = hitbox;
      } else if (clickboxRadius !== null) {
        // Keep targeting reliable when the decoded model has sparse or unusual
        // triangles. Models without an explicit radius use their geometry.
        const hitbox = new THREE.Mesh(
          new THREE.BoxGeometry(clickboxRadius * 2, this.renderable.clickboxHeight ?? this.renderable.size, clickboxRadius * 2),
          new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: DRAW_CLICKBOX_DEBUG ? 0.35 : 0, depthWrite: false, wireframe: DRAW_CLICKBOX_DEBUG }),
        );
        hitbox.position.y = (this.renderable.clickboxHeight ?? this.renderable.size) / 2 - 0.49;
        hitbox.userData.clickable = this.renderable.selectable;
        hitbox.userData.unit = this.renderable;
        this.clickbox = hitbox;
      }
      if (this.renderable.drawOutline) {
        const size = this.renderable.size;
        const outlinePoints = [
          new THREE.Vector3(0, 0, 0), new THREE.Vector3(size, 0, 0),
          new THREE.Vector3(size, 0, 0), new THREE.Vector3(size, 0, -size),
          new THREE.Vector3(size, 0, -size), new THREE.Vector3(0, 0, -size),
          new THREE.Vector3(0, 0, -size), new THREE.Vector3(0, 0, 0),
        ];
        const outline = new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(outlinePoints),
          new THREE.LineBasicMaterial({ color: Settings.entityIndicatorColor ?? "#FFFFFF" }),
        );
        if (this.renderable.outlineRenderOrder !== null) outline.renderOrder = this.renderable.outlineRenderOrder;
        this.outline = outline;
      }
      this.mesh = mesh;
      this.clickboxController.configure(mesh, this.sourceVertices,
        this.clickbox?.userData.cacheGeometryClickbox ? this.clickbox : null);
      this.meshGeneration = generation;
      spotPayloads.forEach((spotPayload) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(spotPayload.positions, 3));
        const spotAlphas = spotPayload.alphas?.map(normalizeCacheAlpha)
          ?? Array(spotPayload.positions.length / 3).fill(0);
        if (spotPayload.colors && spotPayload.colors.length * 3 === spotPayload.positions.length) {
          geometry.setAttribute("color", new THREE.Float32BufferAttribute(cacheColorsToRgba(spotPayload.colors, spotAlphas), 4));
        }
        geometry.setIndex(spotPayload.indices ?? []);
        const effect = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: spotPayload.color ?? 0xffffff, vertexColors: Boolean(spotPayload.colors?.length), transparent: true, wireframe: DRAW_CACHE_MODEL_WIREFRAME }));
        const metadata = spotPayload.spotAnim ?? {};
        const placement = this.activeSpotAnims[0];
        effect.userData.spotAnimId = metadata.id;
        effect.userData.cacheBaseColors = spotPayload.colors ?? [];
        effect.userData.cacheFaceColors = spotPayload.faceColors ?? [];
        effect.visible = false;
        // Actor roots already carry the NPC definition's model scale. Cache
        // spotanim resize values are world-space scales in the client, so
        // compensate for the inherited root scale instead of multiplying the
        // two definitions together (Sol uses 300 for both).
        effect.scale.set(
          (metadata.resizeX ?? 128) / 128 / this.root.scale.x,
          (metadata.resizeY ?? 128) / 128 / this.root.scale.y,
          (metadata.resizeX ?? 128) / 128 / this.root.scale.z,
        );
        effect.rotation.y = ((placement?.rotation ?? metadata.rotation) ?? 0) * Math.PI / 1024;
        this.root.add(effect);
        this.spotAnims.push({ interpolatedMayaFrame: [], animayaGroups: spotPayload.animayaGroups ?? [], animayaScales: spotPayload.animayaScales ?? [], posedPositions: new Float32Array(spotPayload.positions.length), posedAlphas: new Float32Array(spotAlphas.length), workspace: new RawFrameWorkspace(), interpolatedFrame: { types: [], maps: [], indexFrameIds: [], x: [], y: [], z: [] }, mesh: effect, basePositions: new Float32Array(spotPayload.positions), vertexGroups: spotPayload.vertexGroups ?? [], sourceVertices: spotPayload.sourceVertices ?? [], baseAlphas: new Float32Array(spotAlphas), alphaGroups: spotPayload.alphaGroups ?? [], animationId: metadata.animationId, animation: metadata.animationId >= 0 ? spotPayload.animations?.[String(metadata.animationId)] : undefined, scaleX: metadata.resizeX ?? 128, scaleY: metadata.resizeY ?? 128, rotation: metadata.rotation ?? 0, height: placement?.height ?? 0, delay: placement?.delay ?? 0 });
      });
      // A queued actor animation may have begun while its cache geometry was
      // loading. Start it once the mesh is ready so short spawn sequences are
      // not skipped.
      if (this.animationPlaying || this.reference.kind === "spotAnim") {
        this.animationTime = 0;
        this.animationStartsOnNextCycle = true;
      }
      this.frameSoundPlayer.reset();
      this.spotFrameSoundPlayers.clear();
      previousChildren.forEach((child) => {
        if (child.parent === this.root) this.root.remove(child);
      });
      if (previousOutline?.parent) previousOutline.parent.remove(previousOutline);
      if (previousClickbox?.parent) previousClickbox.parent.remove(previousClickbox);
    })();
    return this.ready;
  }

  draw(scene: THREE.Scene, _clockDelta: number, _tickPercent: number, location: Location3, rotation: number, pitch: number, visible: boolean, modelOffsets: Location3[], clientTickFraction = 0) {
    this.clickboxController.invalidate();
    this.startLoading();
    this.updateSceneObjects(scene, location, rotation, pitch, visible, modelOffsets);
    if (!this.mesh || this.meshGeneration !== this.modelGeneration || this.lastPose < 0) return;
    const fraction = Settings.smoothCacheAnimations ? Math.max(0, Math.min(1, clientTickFraction)) : 0;
    if (this.presentedAnimationRevision === this.animationRevision
      && this.presentedAnimationFraction === fraction
      && this.presentedSmoothAnimations === Settings.smoothCacheAnimations) return;
    this.presentActorAnimation(this.lastPose, fraction / CLIENT_CYCLES_PER_SECOND);
    this.updateSpotAnimations(0, null, fraction / CLIENT_CYCLES_PER_SECOND);
    this.presentedAnimationRevision = this.animationRevision;
    this.presentedAnimationFraction = fraction;
    this.presentedSmoothAnimations = Settings.smoothCacheAnimations;
  }

  private startLoading() {
    if (this.ready) return;
    this.ensureLoaded().catch((error) => console.error("[osrs-sdk] Cache render preload failed", error));
  }

  clientTick() {
    this.renderable.setAnimationListener(this);
    this.startLoading();
    // Loading and equipment swaps must not consume animation time on an old mesh.
    if (!this.mesh || this.meshGeneration !== this.modelGeneration) return;
    const location = this.renderable.getTrueLocation();
    const size = this.renderable.size;
    const soundLocation = { x: location.x + (size - 1) / 2, y: location.y - (size - 1) / 2 };
    const pose = this.renderable.animationIndex;
    this.updateActorAnimation(1 / CLIENT_CYCLES_PER_SECOND, soundLocation, pose);
    this.updateSpotAnimations(1 / CLIENT_CYCLES_PER_SECOND, soundLocation);
    this.lastPose = pose;
    this.animationRevision++;
    this.clickboxController.invalidate();
  }

  private updateSceneObjects(scene: THREE.Scene, location: Location3, rotation: number, pitch: number, visible: boolean, modelOffsets: Location3[]) {
    if (this.root.parent !== scene) {
      scene.add(this.root);
      this.renderable.setAnimationListener(this);
    }
    const size = this.renderable.size;
    this.root.visible = visible && (this.mesh !== null || this.spotAnims.length > 0);
    const outlineColor = Settings.entityIndicatorColor;
    if (this.outline) {
      (this.outline.material as THREE.LineBasicMaterial).color.set(outlineColor);
      this.outline.visible = visible && this.renderable.drawOutline && Settings.entityIndicatorEnabled;
    }
    this.root.position.set(location.x + size / 2, location.z - 0.49, location.y - size / 2);
    this.root.rotation.order = "YXZ";
    // The client submits standalone GraphicsObjects to the scene with yaw 0.
    // Actor/model renderables use the SDK's west-zero facing convention and
    // need the quarter-turn cache-basis correction.
    const basisRotation = this.options.basisRotation ?? (this.reference.kind === "spotAnim" ? 0 : Math.PI / 2);
    this.root.rotation.set(pitch, rotation + basisRotation, 0);
    if (this.outline) {
      if (this.outline.parent !== scene) scene.add(this.outline);
      drawLineOnTop(
        this.outline,
        this.renderable.outlineRenderOrder ?? GroundOverlayRenderOrder.ENTITY_INDICATOR,
      );
      this.outline.position.set(location.x, -0.49, location.y);
      this.outline.rotation.set(0, 0, 0);
    }
    if (this.clickbox) {
      if (this.clickbox.parent !== scene) scene.add(this.clickbox);
      if (this.clickbox.userData.cacheGeometryClickbox) {
        this.clickbox.position.copy(this.root.position);
        this.clickbox.rotation.copy(this.root.rotation);
        this.clickbox.scale.copy(this.root.scale);
      } else {
        const clickboxHeight = this.renderable.clickboxHeight ?? this.renderable.size;
        this.clickbox.position.set(location.x + this.renderable.size / 2, clickboxHeight / 2 - 0.49, location.y - this.renderable.size / 2);
        this.clickbox.rotation.set(0, 0, 0);
      }
      this.clickbox.visible = this.renderable.selectable;
    }
    if (this.trueTile) {
      if (this.trueTile.parent !== scene) scene.add(this.trueTile);
      const trueLocation = this.renderable.getTrueLocation();
      drawLineOnTop(this.trueTile, this.renderable.trueTileRenderOrder ?? GroundOverlayRenderOrder.TRUE_TILE);
      this.trueTile.position.set(trueLocation.x, GROUND_OVERLAY_Y, trueLocation.y);
      const trueTileColor = Settings.trueTileColor;
      (this.trueTile.material as THREE.LineBasicMaterial).color.set(trueTileColor);
      const indicatorCoversTrueTile = this.outline?.visible
        && Settings.entityIndicatorEnabled
        && location.x === trueLocation.x
        && location.y === trueLocation.y;
      this.trueTile.visible = this.renderable.drawTrueTile
        && visible
        && Settings.trueTileEnabled
        && !indicatorCoversTrueTile;
    }
    this.root.children.forEach((child, index) => {
      const offset = modelOffsets[index]; child.position.set(offset?.x ?? 0, offset?.z ?? 0, offset?.y ?? 0);
    });
  }
  private updateActorAnimation(clockDelta: number, soundLocation: { x: number; y: number }, pose: number) {
    if (pose !== this.lastPose) this.poseAnimationTime = 0;
    else this.poseAnimationTime = Math.round((this.poseAnimationTime + clockDelta) * CLIENT_CYCLES_PER_SECOND) / CLIENT_CYCLES_PER_SECOND;
    if (!this.animationPlaying && pose !== this.lastPose) {
      this.activeAnimation = this.poseMap[String(pose)] ?? pose;
      this.animationTime = 0;
      this.animationStartsOnNextCycle = true;
    }
    // A transition can happen between client cycles. Present its first frame
    // at t=0 once before consuming a complete client cycle.
    if (!this.animationStartsOnNextCycle) this.animationTime = Math.round((this.animationTime + clockDelta) * CLIENT_CYCLES_PER_SECOND) / CLIENT_CYCLES_PER_SECOND;
    this.animationStartsOnNextCycle = false;
    const animationId = this.activeAnimation;
    const animation = this.animations[String(animationId)];
    if (animation && (animation.frames.length || animation.rawFrames?.length || animation.mayaFrames?.length) && this.root.children.length) {
      const sample = sampleAnimation(animation, this.animationTime, !this.animationPlaying);
      if (this.animationPlaying && this.animationTime >= sample.total) {
        this.frameSoundPlayer.advance(animationId, animation, sample.total, false, soundLocation);
        this.frameSoundPlayer.reset();
        this.animationPlaying = false;
        this.animationCanBlendWithPose = false;
        this.activeAnimation = this.poseMap[String(pose)] ?? pose;
        this.animationTime = 0;
        this.animationStartsOnNextCycle = true;
        this.animationPromiseResolve?.();
        this.animationPromiseResolve = null;
        // Presentation reads the new pose directly; its sounds begin on the next tick.
        return;
      }
      this.frameSoundPlayer.advance(animationId, animation, this.animationTime, !this.animationPlaying, soundLocation);
    }
  }

  /** Present a pose without advancing clocks, emitting sounds, or completing animations. */
  private presentActorAnimation(pose: number, renderOffset: number) {
    const animation = this.animations[String(this.activeAnimation)];
    if (animation && (animation.frames.length || animation.rawFrames?.length || animation.mayaFrames?.length)) {
      const sample = sampleAnimation(animation, this.animationTime + renderOffset, !this.animationPlaying);
      const frame = sample.frame;
      const blend = sample.blend;
      const vertices = animation.frames[frame];
      const position = this.mesh?.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (position && this.basePositions) {
        const transformed = this.posedPositions;
        transformed.set(this.basePositions);
        const transformedAlphas = this.baseAlphas ? this.posedAlphas : undefined;
        if (transformedAlphas) transformedAlphas.set(this.baseAlphas!);
        if (animation.mayaFrames?.[frame]) {
          // Matrix interpolation is an approximation until extraction includes the original curves.
          const matrices = Settings.smoothCacheAnimations
            ? interpolateMayaFrames(animation.mayaFrames[frame], animation.mayaFrames[sample.nextFrame], blend, this.interpolatedMayaFrame)
            : animation.mayaFrames[frame];
          applyMayaFrame(transformed, matrices, this.animayaGroups, this.animayaScales);
        } else if (animation.rawFrames?.[frame]) {
          const poseSequence = this.poseMap[String(pose)] ?? pose;
          const poseAnimation = this.animations[String(poseSequence)];
          const interleave = animation.interleaveLeave ?? [];
          const composePose = this.animationPlaying && this.animationCanBlendWithPose
            && this.renderable.shouldBlendAnimationWithPose && interleave.some((index) => index !== 9999999)
            && poseAnimation?.rawFrames?.length;
          if (composePose) {
            // RuneLite deliberately retains the native two-pass attack/pose path.
            const poseFrame = sampleAnimation(poseAnimation, this.poseAnimationTime, true).frame;
            applyBlendedRawFrames(transformed, this.vertexGroups, this.sourceVertices,
              animation.rawFrames[frame], poseAnimation.rawFrames[poseFrame] ?? poseAnimation.rawFrames[0],
              interleave, transformedAlphas, this.alphaGroups, this.rawFrameWorkspace);
          } else {
            const current = animation.rawFrames[frame];
            // Looping poses interpolate into their first frame; one-shots hold their last pose.
            const following = animation.rawFrames[sample.nextFrame];
            const rawFrame = Settings.smoothCacheAnimations && following
              ? interpolateRawFrames(current, following, blend, this.interpolatedFrame, true) : current;
            applyRawFrame(transformed, this.vertexGroups, this.sourceVertices, rawFrame,
              undefined, transformedAlphas, this.alphaGroups, this.rawFrameWorkspace, Settings.smoothCacheAnimations);
          }
        } else if (vertices && position.count * 3 === vertices.length) {
          const following = animation.frames[sample.nextFrame];
          if (Settings.smoothCacheAnimations && following?.length === vertices.length) {
            for (let index = 0; index < transformed.length; index++) transformed[index] = vertices[index] + (following[index] - vertices[index]) * blend;
          } else transformed.set(vertices);
        }
        position.array.set(transformed);
        position.needsUpdate = true;
        this.updateLogicalHeight(position);
        const cacheAlpha = this.mesh?.geometry.getAttribute("cacheAlpha") as THREE.BufferAttribute | undefined;
        if (cacheAlpha && transformedAlphas) {
          for (let i = 0; i < transformedAlphas.length; i++) cacheAlpha.array[i] = cacheAlphaToOpacity(transformedAlphas[i]);
          cacheAlpha.needsUpdate = true;
        }
        // MeshBasicMaterial uses the cache's baked colours; posed normals are unused.
      }
    }
  }
  private updateSpotAnimations(clockDelta: number, soundLocation: { x: number; y: number } | null, renderOffset = 0) {
    if (soundLocation) this.spotAnimClock = Math.round((this.spotAnimClock + Math.max(0, clockDelta)) * CLIENT_CYCLES_PER_SECOND) / CLIENT_CYCLES_PER_SECOND;
    for (const spot of this.spotAnims) {
      const animation = spot.animation;
      const placement = this.activeSpotAnims.filter((spotAnim) => spotAnim.id === spot.mesh.userData.spotAnimId)[0];
      const delay = placement?.delay ?? spot.delay;
      const placementStart = placement == null ? this.spotAnimClock : this.spotAnimStarts.get(spotAnimChannel(placement)) ?? this.spotAnimClock;
      const effectTime = (Math.round((this.spotAnimClock - placementStart) * CLIENT_CYCLES_PER_SECOND) - delay) / CLIENT_CYCLES_PER_SECOND;
      const activationAnimation = placement?.animation == null ? true : (this.poseMap[String(placement.animation)] ?? placement.animation) === this.activeAnimation;
      // Attached spotanims are normally one-shot graphics. Projectile
      // spotanims repeat until their owning ProjectileGraphic is destroyed.
      const looping = this.options.loopSpotAnims === true;
      const sample = animation ? sampleAnimation(animation, effectTime + (effectTime >= 0 ? renderOffset : 0), looping) : undefined;
      const total = sample?.total ?? 0;
      const hasFrames = Boolean(animation?.frames.length || animation?.rawFrames?.length || animation?.mayaFrames?.length);
      spot.mesh.visible = activationAnimation && Boolean(placement) && effectTime >= 0
        && (looping ? total > 0 : effectTime < total) && hasFrames;
      if (soundLocation) {
        const spotAnimationId = spot.animationId ?? -1;
        let spotSoundPlayer = this.spotFrameSoundPlayers.get(spotAnimationId);
        if (!spotSoundPlayer) {
          spotSoundPlayer = new AnimationFrameSoundPlayer(this.options.frameSoundDelayMs);
          this.spotFrameSoundPlayers.set(spotAnimationId, spotSoundPlayer);
        }
        if (
          !looping &&
          this.reference.kind === "spotAnim" &&
          !this.spotAnimCompletionNotified &&
          effectTime >= 0 &&
          (!animation || !hasFrames || total <= 0 || effectTime >= total)
        ) {
          this.spotAnimCompletionNotified = true;
          this.options.onSpotAnimComplete?.();
        }
        if (!spot.mesh.visible || !animation) {
          spotSoundPlayer.reset();
          continue;
        }
        spotSoundPlayer.advance(spotAnimationId, animation, effectTime, looping, soundLocation);
        continue; // Geometry is evaluated once by the next draw, rather than also on this tick.
      }
      if (!spot.mesh.visible || !animation) continue;
      const frame = sample!.frame;
      const transformed = spot.posedPositions;
      const alphaValues = spot.posedAlphas;
      transformed.set(spot.basePositions);
      alphaValues.set(spot.baseAlphas);
      if (animation.mayaFrames?.[frame]) {
        const matrices = Settings.smoothCacheAnimations
          ? interpolateMayaFrames(animation.mayaFrames[frame], animation.mayaFrames[sample!.nextFrame], sample!.blend, spot.interpolatedMayaFrame)
          : animation.mayaFrames[frame];
        applyMayaFrame(transformed, matrices, spot.animayaGroups, spot.animayaScales);
      } else if (animation.rawFrames?.[frame]) {
        const current = animation.rawFrames[frame], following = animation.rawFrames[sample!.nextFrame];
        const rawFrame = Settings.smoothCacheAnimations && following
          ? interpolateRawFrames(current, following, sample!.blend, spot.interpolatedFrame, true) : current;
        applyRawFrame(transformed, spot.vertexGroups, spot.sourceVertices, rawFrame,
          undefined, alphaValues, spot.alphaGroups, spot.workspace, Settings.smoothCacheAnimations);
      } else if (animation.frames[frame] && transformed.length === animation.frames[frame].length) {
        const current = animation.frames[frame], following = animation.frames[sample!.nextFrame];
        if (Settings.smoothCacheAnimations && following?.length === current.length) {
          for (let index = 0; index < transformed.length; index++) transformed[index] = current[index] + (following[index] - current[index]) * sample!.blend;
        } else transformed.set(current);
      }
      (spot.mesh.geometry.getAttribute("position") as THREE.BufferAttribute).array.set(transformed);
      (spot.mesh.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      const color = spot.mesh.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
      if (color && color.itemSize === 4) {
        const recolor = placement?.recolor ?? {};
        const baseColors = spot.mesh.userData.cacheBaseColors as number[];
        const faceColors = spot.mesh.userData.cacheFaceColors as number[];
        for (let i = 0; i < alphaValues.length; i++) {
          if (baseColors[i] != null) {
            const rgb = cacheColorToRgb(resolveCacheColor(baseColors[i], faceColors[i], recolor));
            color.array[i * 4] = rgb[0]; color.array[i * 4 + 1] = rgb[1]; color.array[i * 4 + 2] = rgb[2];
          }
          color.array[i * 4 + 3] = cacheAlphaToOpacity(alphaValues[i]);
        }
        color.needsUpdate = true;
      }
      // Spotanim height/offset placement is supplied by the actor update,
      // not by the cache definition. Keep it in the actor's local frame so
      // the effect follows the player's facing direction.
      const offset = placement?.offset;
      if (offset) {
        // Convert world tile offset into the player's local frame because
        // the effect remains a child of the rotated player root.
        const yaw = this.root.rotation.y;
        const cos = Math.cos(yaw), sin = Math.sin(yaw);
        spot.mesh.position.set(cos * offset.x - sin * offset.y, placement?.height ?? spot.height, sin * offset.x + cos * offset.y);
      } else spot.mesh.position.set(0, placement?.height ?? spot.height, 0);
      // Actor spotanims are merged into the actor model by the client and
      // inherit its yaw. Spotanim-only renderables use the same cache-space
      // basis correction as every other world renderable.
      spot.mesh.rotation.y = (placement?.rotation ?? spot.rotation) * Math.PI / 1024;
    }
  }
  private updateLogicalHeight(position: THREE.BufferAttribute) {
    let maxY = -Infinity;
    for (let vertex = 0; vertex < position.count; vertex++) maxY = Math.max(maxY, position.getY(vertex));
    this.logicalHeight = Number.isFinite(maxY) ? Math.max(0, maxY * this.root.scale.y) : null;
  }
  getLogicalHeight() { return this.logicalHeight; }
  destroy(scene: THREE.Scene) {
    if (this.root.parent === scene) scene.remove(this.root);
    if (this.outline?.parent === scene) scene.remove(this.outline);
    if (this.trueTile?.parent === scene) scene.remove(this.trueTile);
    if (this.clickbox?.parent === scene) scene.remove(this.clickbox);
    this.renderable.clearAnimationListener();
  }
  getWorldPosition() { return this.root.getWorldPosition(new THREE.Vector3()); }
}
