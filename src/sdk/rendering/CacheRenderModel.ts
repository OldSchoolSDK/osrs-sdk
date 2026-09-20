import * as THREE from "three";
import { Location3 } from "../Location";
import { AnimationMetadata, Renderable, RenderableListener } from "../Renderable";
import { CacheRender } from "./CacheRenderBundle";
import { CacheRenderReference, CacheRenderSpotAnim } from "./CacheRenderReference";
import { Model } from "./Model";
import { drawLineOnTop, GROUND_OVERLAY_Y, GroundOverlayRenderOrder } from "./RenderUtils";
import { Settings } from "../Settings";
import type { CacheRenderAnimation, CacheRenderPayload, CacheRenderRawFrame } from "../../cache-render-format";
import { AnimationFrameSoundPlayer, preloadAnimationFrameSounds } from "./AnimationFrameSounds";
import { applyBlendedRawFrames, applyMayaFrame, applyRawFrame, sampleAnimation } from "./utils/animations";
import { cachedPayload, mergePayloads } from "./utils/payloadUtils";
import { CLIENT_CYCLES_PER_SECOND } from "../utils/constants";

const DRAW_CLICKBOX_DEBUG = false;
const DRAW_CACHE_MODEL_WIREFRAME = false;

type RawFrame = CacheRenderRawFrame;
type AnimationPayload = CacheRenderAnimation;
type Payload = CacheRenderPayload;
type SpotAnimRuntime = { mesh: THREE.Mesh; basePositions: Float32Array; vertexGroups: number[][]; sourceVertices: number[]; baseAlphas: Float32Array; alphaGroups: number[][]; animationId?: number; animation?: AnimationPayload; scaleX: number; scaleY: number; rotation: number; height: number; delay: number };

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
  private animationStartsOnNextDraw = false;
  private poseAnimationTime = 0;
  private animationPlaying = false;
  private animationCanBlendWithPose = false;
  private animationPromiseResolve: (() => void) | null = null;
  private frameSoundPlayer: AnimationFrameSoundPlayer;
  private spotFrameSoundPlayers = new Map<number, AnimationFrameSoundPlayer>();
  private frameSoundsReady: Promise<void> = Promise.resolve();
  private basePositions: Float32Array | null = null;
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

  constructor(
    private renderable: Renderable,
    private reference: CacheRenderReference,
    private options: CacheRenderModelOptions = {},
  ) {
    this.frameSoundPlayer = new AnimationFrameSoundPlayer(options.frameSoundDelayMs);
    this.setActiveSpotAnims(this.currentSpotAnims(reference.kind === "model" || reference.kind === "asset" ? undefined : reference.spotAnims));
    // A spotanim-only renderable has no actor animation transition to start
    // playback. Its own graphic timeline begins as soon as it is created.
    if (reference.kind === "spotAnim") {
      this.animationPlaying = true;
      this.animationStartsOnNextDraw = true;
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
  getClickboxVertices() {
    if (!this.mesh || !this.mesh.visible) return [];
    this.root.updateWorldMatrix(true, true);
    const position = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!position) return [];
    const vertices: THREE.Vector3[] = [];
    const seen = new Set<number>();
    for (let index = 0; index < position.count; index++) {
      const source = this.sourceVertices[index] ?? index;
      if (seen.has(source)) continue;
      seen.add(source);
      vertices.push(new THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index))
        .applyMatrix4(this.mesh.matrixWorld));
    }
    return vertices;
  }
  spotAnimChanged(spotAnims: CacheRenderSpotAnim[]) { this.setActiveSpotAnims(spotAnims); }
  private setActiveSpotAnims(spotAnims: CacheRenderSpotAnim[]) {
    const starts = new Map<string, number>();
    const placements = new Map<string, CacheRenderSpotAnim>();
    spotAnims.forEach((spotAnim) => {
      const channel = spotAnimChannel(spotAnim);
      const previous = this.spotAnimPlacements.get(channel);
      starts.set(channel, previous === spotAnim ? (this.spotAnimStarts.get(channel) ?? this.spotAnimClock) : this.spotAnimClock);
      placements.set(channel, spotAnim);
    });
    this.activeSpotAnims = spotAnims.slice();
    this.spotAnimStarts = starts;
    this.spotAnimPlacements = placements;
  }
  private currentSpotAnims(fallback?: CacheRenderSpotAnim[]) {
    const attached = this.renderable.spotAnims;
    return attached.length ? attached.slice() : (fallback ?? []).slice();
  }
  animationChanged(id: number, blend: boolean): Promise<void> {
    // SDK callers use semantic pose indices (e.g. FireBow = 6), while the
    // bundle is keyed by the actual cache sequence ID (e.g. 426).
    this.activeAnimation = this.poseMap[String(id)] ?? id;
    this.animationTime = 0;
    this.animationStartsOnNextDraw = true;
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
    this.animationStartsOnNextDraw = false;
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
        const colorValues: number[] = [];
        payload.colors.forEach((value) => { const color = new THREE.Color(value); colorValues.push(color.r, color.g, color.b); });
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colorValues, 3));
      }
      const rawAlphas = payload.alphas?.length === payload.positions.length / 3
        ? payload.alphas.map((value) => value & 255)
        : Array(payload.positions.length / 3).fill(0);
      const hasVertexAlpha = needsVertexAlpha(payload);
      const alphaValues = rawAlphas.map((value) => 1 - value / 255);
      geometry.setAttribute("cacheAlpha", new THREE.Float32BufferAttribute(alphaValues, 1));
      geometry.setIndex(payload.indices ?? []);
      geometry.computeVertexNormals();
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
      this.meshGeneration = generation;
      spotPayloads.forEach((spotPayload) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(spotPayload.positions, 3));
        if (spotPayload.colors && spotPayload.colors.length * 3 === spotPayload.positions.length) {
          const values: number[] = [];
          spotPayload.colors.forEach((value, index) => { const color = new THREE.Color(value); values.push(color.r, color.g, color.b, 1 - (spotPayload.alphas?.[index] ?? 0) / 255); });
          geometry.setAttribute("color", new THREE.Float32BufferAttribute(values, 4));
        }
        geometry.setIndex(spotPayload.indices ?? []);
        geometry.computeVertexNormals();
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
        this.spotAnims.push({ mesh: effect, basePositions: new Float32Array(spotPayload.positions), vertexGroups: spotPayload.vertexGroups ?? [], sourceVertices: spotPayload.sourceVertices ?? [], baseAlphas: new Float32Array(spotPayload.alphas ?? Array(spotPayload.positions.length / 3).fill(0)), alphaGroups: spotPayload.alphaGroups ?? [], animationId: metadata.animationId, animation: metadata.animationId >= 0 ? spotPayload.animations?.[String(metadata.animationId)] : undefined, scaleX: metadata.resizeX ?? 128, scaleY: metadata.resizeY ?? 128, rotation: metadata.rotation ?? 0, height: placement?.height ?? 0, delay: placement?.delay ?? 0 });
      });
      // A queued actor animation may have begun while its cache geometry was
      // loading. Start it once the mesh is ready so short spawn sequences are
      // not skipped.
      if (this.animationPlaying || this.reference.kind === "spotAnim") {
        this.animationTime = 0;
        this.animationStartsOnNextDraw = true;
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

  draw(scene: THREE.Scene, clockDelta: number, _tickPercent: number, location: Location3, rotation: number, pitch: number, visible: boolean, modelOffsets: Location3[]) {
    this.ensureLoaded().catch((error) => {
      // Keep cache integration failures visible (bad URL, integrity failure, or
      // an absent render reference).
      console.error("[osrs-sdk] Cache render preload failed", error);
    });
    this.updateSceneObjects(scene, location, rotation, pitch, visible, modelOffsets);

    const size = this.renderable.size;
    const soundLocation = { x: location.x + (size - 1) / 2, y: location.y - (size - 1) / 2 };

    const pose = this.renderable.animationIndex;
    this.updateActorAnimation(clockDelta, soundLocation, pose);
    this.updateSpotAnimations(clockDelta, soundLocation);
    // Do not mark the pose as handled until the replacement mesh exists.
    // During an equipment swap ensureLoaded() is asynchronous; recording the
    // pose while mesh is null would prevent it from being initialized once
    // the new payload arrives.
    if (this.mesh && this.meshGeneration === this.modelGeneration) {
      this.lastPose = pose;
    }
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
    else this.poseAnimationTime += clockDelta;
    if (!this.animationPlaying && pose !== this.lastPose) {
      this.activeAnimation = this.poseMap[String(pose)] ?? pose;
      this.animationTime = 0;
      this.animationStartsOnNextDraw = true;
    }
    // animationChanged can run between draws. The supplied delta includes
    // time from before that transition, so render the newly-started animation
    // at t=0 once instead of giving it a render-frame head start.
    if (!this.animationStartsOnNextDraw) this.animationTime += clockDelta;
    this.animationStartsOnNextDraw = false;
    const animationId = this.activeAnimation;
    const animation = this.animations[String(animationId)];
    if (animation && (animation.frames.length || animation.rawFrames?.length || animation.mayaFrames?.length) && this.root.children.length) {
      let sample = sampleAnimation(animation, this.animationTime, !this.animationPlaying);
      let animationEnded = false;
      if (this.animationPlaying && this.animationTime >= sample.total) {
        this.frameSoundPlayer.advance(animationId, animation, sample.total, false, soundLocation);
        this.frameSoundPlayer.reset();
        this.animationPlaying = false;
        this.animationCanBlendWithPose = false;
        this.activeAnimation = this.poseMap[String(pose)] ?? pose;
        this.animationTime = 0;
        this.animationStartsOnNextDraw = true;
        this.animationPromiseResolve?.();
        this.animationPromiseResolve = null;
        sample = sampleAnimation(animation, 0, false);
        animationEnded = true;
      }
      if (!animationEnded) this.frameSoundPlayer.advance(animationId, animation, this.animationTime, !this.animationPlaying, soundLocation);
      // Looping pose animations need to blend the final frame back to the
      // first frame; holding the final frame creates a visible snap at the
      // run-cycle boundary. One-shot attack animations still clamp normally.
      const frame = sample.frame;
      const next = sample.nextFrame;
      const blend = sample.blend;
      const vertices = animation.frames[frame];
      const nextVertices = animation.frames[next];
      const position = this.mesh?.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (position && this.basePositions) {
        const transformed = new Float32Array(this.basePositions);
        const transformedAlphas = this.baseAlphas ? new Float32Array(this.baseAlphas) : undefined;
        if (animation.mayaFrames?.[frame]) {
          applyMayaFrame(transformed, animation.mayaFrames[frame], this.animayaGroups, this.animayaScales);
          if (Settings.smoothCacheAnimations && animation.mayaFrames[next] && next !== frame) {
            const nextTransformed = new Float32Array(this.basePositions);
            applyMayaFrame(nextTransformed, animation.mayaFrames[next], this.animayaGroups, this.animayaScales);
            for (let i = 0; i < transformed.length; i++) transformed[i] += (nextTransformed[i] - transformed[i]) * blend;
          }
          position.array.set(transformed);
        } else if (animation.rawFrames?.[frame]) {
          const poseSequence = this.poseMap[String(pose)] ?? pose;
          const poseAnimation = this.animations[String(poseSequence)];
          const interleave = animation.interleaveLeave?.filter((index) => index !== 9999999) ?? [];
          // Evaluate a frame in the same way as the game client, including
          // animate2's interleaved pose/attack sequence composition. Keeping
          // this in one function is important: smoothing must not discard the
          // lower-body pose when interpolating an attack animation.
          const applyAnimationFrame = (target: Float32Array, rawFrame: RawFrame, targetAlphas?: Float32Array) => {
            if (
              this.animationPlaying
              && this.animationCanBlendWithPose
              && this.renderable.shouldBlendAnimationWithPose
              && interleave.length
              && poseAnimation?.rawFrames?.length
            ) {
              const poseFrame = sampleAnimation(poseAnimation, this.poseAnimationTime, true).frame;
              applyBlendedRawFrames(target, this.vertexGroups, this.sourceVertices, rawFrame, poseAnimation.rawFrames[poseFrame] ?? poseAnimation.rawFrames[0], interleave, targetAlphas, this.alphaGroups);
            } else applyRawFrame(target, this.vertexGroups, this.sourceVertices, rawFrame, undefined, targetAlphas, this.alphaGroups);
          };
          applyAnimationFrame(transformed, animation.rawFrames[frame], transformedAlphas);
          if (Settings.smoothCacheAnimations && animation.rawFrames[next] && next !== frame) {
            const nextTransformed = new Float32Array(this.basePositions);
            const nextAlphas = this.baseAlphas ? new Float32Array(this.baseAlphas) : undefined;
            applyAnimationFrame(nextTransformed, animation.rawFrames[next], nextAlphas);
            for (let i = 0; i < transformed.length; i++) transformed[i] += (nextTransformed[i] - transformed[i]) * blend;
            if (transformedAlphas && nextAlphas) for (let i = 0; i < transformedAlphas.length; i++) transformedAlphas[i] += (nextAlphas[i] - transformedAlphas[i]) * blend;
          }
          position.array.set(transformed);
        } else if (position.count * 3 === vertices.length) {
          for (let i = 0; i < vertices.length; i++) position.array[i] = vertices[i] + (nextVertices[i] - vertices[i]) * blend;
        }
        position.needsUpdate = true;
        this.updateLogicalHeight(position);
        const cacheAlpha = this.mesh?.geometry.getAttribute("cacheAlpha") as THREE.BufferAttribute | undefined;
        if (cacheAlpha && transformedAlphas) {
          for (let i = 0; i < transformedAlphas.length; i++) cacheAlpha.array[i] = 1 - Math.max(0, Math.min(255, transformedAlphas[i])) / 255;
          cacheAlpha.needsUpdate = true;
        }
        this.mesh?.geometry.computeVertexNormals();
      }
    }
  }
  private updateSpotAnimations(clockDelta: number, soundLocation: { x: number; y: number }) {
    this.spotAnimClock += Math.max(0, clockDelta);
    for (const spot of this.spotAnims) {
      const animation = spot.animation;
      const placement = this.activeSpotAnims.filter((spotAnim) => spotAnim.id === spot.mesh.userData.spotAnimId)[0];
      const delay = placement?.delay ?? spot.delay;
      const placementStart = placement == null ? this.spotAnimClock : this.spotAnimStarts.get(spotAnimChannel(placement)) ?? this.spotAnimClock;
      const effectTime = this.spotAnimClock - placementStart - delay / CLIENT_CYCLES_PER_SECOND;
      const activationAnimation = placement?.animation == null ? true : (this.poseMap[String(placement.animation)] ?? placement.animation) === this.activeAnimation;
      // Attached spotanims are normally one-shot graphics. Projectile
      // spotanims repeat until their owning ProjectileGraphic is destroyed.
      const looping = this.options.loopSpotAnims === true;
      const sample = animation ? sampleAnimation(animation, effectTime, looping) : undefined;
      const total = sample?.total ?? 0;
      const hasFrames = Boolean(animation?.frames.length || animation?.rawFrames?.length || animation?.mayaFrames?.length);
      spot.mesh.visible = activationAnimation && Boolean(placement) && effectTime >= 0
        && (looping ? total > 0 : effectTime < total) && hasFrames;
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
      const frame = sample!.frame;
      const next = sample!.nextFrame;
      const blend = sample!.blend;
      const transformed = new Float32Array(spot.basePositions);
      const alphaValues = new Float32Array(spot.baseAlphas);
      if (animation.rawFrames?.[frame]) applyRawFrame(transformed, spot.vertexGroups, spot.sourceVertices, animation.rawFrames[frame], undefined, alphaValues, spot.alphaGroups);
      else if (animation.frames[frame] && transformed.length === animation.frames[frame].length) {
        const nextFrame = animation.frames[next] ?? animation.frames[frame];
        for (let i = 0; i < transformed.length; i++) transformed[i] = animation.frames[frame][i] + (nextFrame[i] - animation.frames[frame][i]) * blend;
      }
      (spot.mesh.geometry.getAttribute("position") as THREE.BufferAttribute).array.set(transformed);
      (spot.mesh.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      const color = spot.mesh.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
      if (color && color.itemSize === 4) {
        const recolor = placement?.recolor ?? {};
        const baseColors = spot.mesh.userData.cacheBaseColors as number[];
        const faceColors = spot.mesh.userData.cacheFaceColors as number[];
        for (let i = 0; i < alphaValues.length; i++) {
          const replacement = recolor[String(faceColors[i])];
          if (replacement != null) {
            const rgb = new THREE.Color(replacement);
            color.array[i * 4] = rgb.r; color.array[i * 4 + 1] = rgb.g; color.array[i * 4 + 2] = rgb.b;
          } else if (baseColors[i] != null) {
            const rgb = new THREE.Color(baseColors[i]);
            color.array[i * 4] = rgb.r; color.array[i * 4 + 1] = rgb.g; color.array[i * 4 + 2] = rgb.b;
          }
          color.array[i * 4 + 3] = 1 - alphaValues[i] / 255;
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
