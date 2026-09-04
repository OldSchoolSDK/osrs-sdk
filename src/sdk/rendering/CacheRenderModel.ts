import * as THREE from "three";
import { decompressSync } from "fflate";
import { Location3 } from "../Location";
import { Renderable, RenderableListener } from "../Renderable";
import { CacheRender, CacheRenderBundle, CacheRenderBundleError } from "./CacheRenderBundle";
import { CacheRenderReference, CacheRenderSpotAnim } from "./CacheRenderReference";
import { Model } from "./Model";
import { drawLineOnTop, GROUND_OVERLAY_Y, GroundOverlayRenderOrder } from "./RenderUtils";
import { Settings } from "../Settings";
import { CACHE_RENDER_PAYLOAD_MAGIC, CACHE_RENDER_PAYLOAD_VERSION } from "../../cache-render-format";
import type { CacheRenderAnimation, CacheRenderPayload, CacheRenderRawFrame, CacheRenderTexture } from "../../cache-render-format";
import { AnimationFrameSoundPlayer, preloadAnimationFrameSounds } from "./AnimationFrameSounds";

// CPU-side frame-map animation is used for standard sequences. Animaya
// sequences continue to use the extracted baked-frame fallback.
const ENABLE_CACHE_RENDER_ANIMATIONS = true;
const DRAW_CLICKBOX_DEBUG = false;
type RawFrame = CacheRenderRawFrame;
type AnimationPayload = CacheRenderAnimation;
type TexturePayload = CacheRenderTexture;
type Payload = CacheRenderPayload;
type SpotAnimRuntime = { mesh: THREE.Mesh; basePositions: Float32Array; vertexGroups: number[][]; sourceVertices: number[]; baseAlphas: Float32Array; alphaGroups: number[][]; animationId?: number; animation?: AnimationPayload; scaleX: number; scaleY: number; rotation: number; height: number; delay: number };

// Decoded payloads are immutable bundle data, so retain them across model
// invalidations and rapid equipment swaps. Cache promises too, allowing
// concurrent swaps to share one fetch/decode operation. Failed loads are
// evicted so a later attempt can retry.
const decodedPayloadCache = new Map<string, Promise<Payload>>();

export function cachedPayload(bundle: CacheRenderBundle, assetId: string): Promise<Payload> {
  const key = `${bundle.manifest.bundleVersion}:${assetId}`;
  const existing = decodedPayloadCache.get(key);
  if (existing) return existing;
  const pending = bundle.fetchAsset(assetId).then(decodeCacheRenderPayload);
  decodedPayloadCache.set(key, pending);
  pending.catch(() => {
    if (decodedPayloadCache.get(key) === pending) decodedPayloadCache.delete(key);
  });
  return pending;
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

export function mergePayloads(payloads: Payload[]): Payload {
  const nonEmpty = payloads.filter((payload) => (payload.indices?.length ?? 0) > 0 || payload.positions.length > 3);
  // note: mutable references so we can x = x.concat(y) instead of x.push(...y), which hits stack limits
  let positions: number[] = [];
  let indices: number[] = [];
  let vertexGroups: number[][] = [];
  let alphaGroups: number[][] = [];
  let sourceVertices: number[] = [];
  let animayaGroups: number[][] = [];
  let animayaScales: number[][] = [];
  let colors: number[] = [];
  let alphas: number[] = [];
  let uvs: number[] = [];
  let textureIds: number[] = [];
  const textures: Record<string, TexturePayload> = {};
  const animations: Record<string, AnimationPayload> = {};
  // Animation metadata may live in a geometry-free shared payload. Collect it
  // independently of the geometry merge so shared player sequences compose
  // with whatever equipment is currently selected.
  payloads.forEach((payload) => Object.entries(payload.animations ?? {}).forEach(([id, animation]) => {
    const existing = animations[id];
    if (!existing) {
      animations[id] = { frames: animation.frames.map((frame) => frame.slice()), lengths: animation.lengths.slice(), rawFrames: animation.rawFrames, interleaveLeave: animation.interleaveLeave, mayaFrames: animation.mayaFrames, frameSounds: animation.frameSounds, soundsCrossWorldView: animation.soundsCrossWorldView };
    } else if (animation.rawFrames?.length && !existing.rawFrames?.length) {
      // Prefer the shared frame-map representation when it is available.
      animations[id] = { frames: animation.frames.map((frame) => frame.slice()), lengths: animation.lengths.slice(), rawFrames: animation.rawFrames, interleaveLeave: animation.interleaveLeave, mayaFrames: animation.mayaFrames, frameSounds: animation.frameSounds, soundsCrossWorldView: animation.soundsCrossWorldView };
    } else if (!existing.rawFrames?.length && !animation.rawFrames?.length) {
      // Legacy bundles stored baked frames in every item; retain their old
      // composition behavior for those bundles.
      animation.frames.forEach((frame, index) => { if (existing.frames[index]) existing.frames[index].push(...frame); });
    }
  }));
  let vertexOffset = 0;
  let sourceVertexOffset = 0;
  nonEmpty.forEach((payload) => {
    const localVertexCount = payload.positions.length / 3;
    positions = positions.concat(payload.positions);
    if (payload.colors) colors = colors.concat(payload.colors);
    if (payload.alphas) alphas = alphas.concat(payload.alphas);
    else alphas = alphas.concat(Array(localVertexCount).fill(0));
    if (payload.uvs) uvs = uvs.concat(payload.uvs);
    if (payload.textureIds) textureIds = textureIds.concat(payload.textureIds);
    Object.assign(textures, payload.textures ?? {});
    const localSources = payload.sourceVertices?.length === localVertexCount
      ? payload.sourceVertices
      : (() => {
        // Bundles extracted before sourceVertices existed can only recover
        // identity from bind-pose coordinates. Keep that recovery local to an
        // equipment payload so coincident vertices in separate items are never
        // accidentally treated as one animation vertex.
        const ids: number[] = [], byPosition = new Map<string, number>();
        for (let index = 0; index < localVertexCount; index++) {
          const key = `${payload.positions[index * 3]},${payload.positions[index * 3 + 1]},${payload.positions[index * 3 + 2]}`;
          let source = byPosition.get(key);
          if (source == null) { source = byPosition.size; byPosition.set(key, source); }
          ids.push(source);
        }
        return ids;
      })();
    sourceVertices = sourceVertices.concat(localSources.map((index) => index + sourceVertexOffset));
    animayaGroups = animayaGroups.concat(Array.from({ length: localVertexCount }, (_, index) => payload.animayaGroups?.[index] ?? []));
    animayaScales = animayaScales.concat(Array.from({ length: localVertexCount }, (_, index) => payload.animayaScales?.[index] ?? []));
    sourceVertexOffset += Math.max(localVertexCount, localSources.reduce((max, index) => Math.max(max, index + 1), 0));
    const localIndices = payload.indices ?? Array.from({ length: payload.positions.length / 3 }, (_, index) => index);
    indices = indices.concat(localIndices.map((index) => index + vertexOffset));
    vertexOffset += payload.positions.length / 3;
    (payload.vertexGroups ?? []).forEach((group, groupIndex) => {
      vertexGroups[groupIndex] ??= [];
      vertexGroups[groupIndex].push(...group.map((index) => index + vertexOffset - payload.positions.length / 3));
    });
    (payload.alphaGroups ?? []).forEach((group, groupIndex) => {
      alphaGroups[groupIndex] ??= [];
      alphaGroups[groupIndex].push(...group.map((index) => index + vertexOffset - payload.positions.length / 3));
    });
  });
  return {
    version: 1,
    positions,
    indices,
    vertexGroups,
    alphaGroups,
    sourceVertices,
    animayaGroups, animayaScales,
    colors: colors.length ? colors : undefined,
    alphas: alphas.length ? alphas : undefined,
    uvs: uvs.length ? uvs : undefined, textureIds: textureIds.length ? textureIds : undefined,
    textures: Object.keys(textures).length ? textures : undefined,
    color: nonEmpty[0]?.color,
    scale: nonEmpty[0]?.scale,
    animations,
    poseMap: Object.assign({}, ...payloads.map((payload) => payload.poseMap ?? {})),
    geometryClickbox: payloads.find((payload) => payload.geometryClickbox)?.geometryClickbox,
  };
}

type TransformSelection = { indices: Set<number>; include: boolean };

/** Apply one legacy cache frame to a composed model.
 *
 * `selection` mirrors the client's two-pass animate2 operation: origin slots
 * always run, while other transform slots are selected by the primary
 * sequence's opcode-3 interleave list.
 */
export function applyRawFrame(positions: Float32Array, groups: number[][], sourceVertices: number[], frame: RawFrame, selection?: TransformSelection, alphas?: Float32Array, alphaGroups?: number[][]) {
  const x = new Float64Array(positions.length / 3), y = new Float64Array(x.length), z = new Float64Array(x.length);
  // Work in the cache's native model units. Besides avoiding accumulating
  // scale error, this lets the fixed-point rotations match the game/client
  // implementation's signed >> 16 arithmetic.
  for (let i = 0; i < x.length; i++) { x[i] = positions[i * 3] * 128; y[i] = -positions[i * 3 + 1] * 128; z[i] = -positions[i * 3 + 2] * 128; }
  const pivot = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < frame.indexFrameIds.length; i++) {
    const transform = frame.indexFrameIds[i];
    const type = frame.types[transform], map = frame.maps[transform] ?? [];
    if (type !== 0 && selection && selection.indices.has(transform) !== selection.include) continue;
    const dx0 = frame.x[i] ?? 0, dy0 = frame.y[i] ?? 0, dz0 = frame.z[i] ?? 0;
    if (type === 5) {
      if (!alphas) continue;
      for (const group of map) for (const index of alphaGroups?.[group] ?? []) alphas[index] = Math.max(0, Math.min(255, alphas[index] + dx0 * 8));
      continue;
    }
    if (type === 0) {
      let count = 0; pivot.x = pivot.y = pivot.z = 0; const seen = new Set<number>();
      for (const group of map) for (const index of groups[group] ?? []) {
        // Textures/flat face colours expand a cache vertex into several render
        // vertices. Count that source vertex once when calculating a pivot,
        // but do not weld unrelated coincident vertices from different items.
        const source = sourceVertices[index] ?? index;
        if (seen.has(source)) continue;
        seen.add(source); pivot.x += x[index]; pivot.y += y[index]; pivot.z += z[index]; count++;
      }
      if (count) { pivot.x = dx0 + pivot.x / count; pivot.y = dy0 + pivot.y / count; pivot.z = dz0 + pivot.z / count; }
      else { pivot.x = dx0; pivot.y = dy0; pivot.z = dz0; }
      continue;
    }
    for (const group of map) for (const index of groups[group] ?? []) {
      if (type === 1) { x[index] += dx0; y[index] += dy0; z[index] += dz0; continue; }
      x[index] -= pivot.x; y[index] -= pivot.y; z[index] -= pivot.z;
      if (type === 2) {
        let angle = (dz0 & 255) * 8, s = Math.floor(65536 * Math.sin(angle * Math.PI / 1024)), c = Math.floor(65536 * Math.cos(angle * Math.PI / 1024));
        let t = (s * y[index] + c * x[index]) >> 16; y[index] = (c * y[index] - s * x[index]) >> 16; x[index] = t;
        angle = (dx0 & 255) * 8; s = Math.floor(65536 * Math.sin(angle * Math.PI / 1024)); c = Math.floor(65536 * Math.cos(angle * Math.PI / 1024));
        t = (c * y[index] - s * z[index]) >> 16; z[index] = (s * y[index] + c * z[index]) >> 16; y[index] = t;
        angle = (dy0 & 255) * 8; s = Math.floor(65536 * Math.sin(angle * Math.PI / 1024)); c = Math.floor(65536 * Math.cos(angle * Math.PI / 1024));
        t = (s * z[index] + c * x[index]) >> 16; z[index] = (c * z[index] - s * x[index]) >> 16; x[index] = t;
      } else if (type === 3) { x[index] *= dx0 / 128; y[index] *= dy0 / 128; z[index] *= dz0 / 128; }
      x[index] += pivot.x; y[index] += pivot.y; z[index] += pivot.z;
    }
  }
  for (let i = 0; i < x.length; i++) { positions[i * 3] = x[i] / 128; positions[i * 3 + 1] = -y[i] / 128; positions[i * 3 + 2] = -z[i] / 128; }
}

export function applyBlendedRawFrames(positions: Float32Array, groups: number[][], sourceVertices: number[], primary: RawFrame, pose: RawFrame, interleave: number[], alphas?: Float32Array, alphaGroups?: number[][]) {
  const selection = new Set(interleave.filter((index) => index !== 9999999));
  applyRawFrame(positions, groups, sourceVertices, primary, { indices: selection, include: false }, alphas, alphaGroups);
  applyRawFrame(positions, groups, sourceVertices, pose, { indices: selection, include: true }, alphas, alphaGroups);
}

export function decodeCacheRenderPayload(bytes: ArrayBuffer): Payload {
  const input = new Uint8Array(bytes);
  if (input.length < 8 || String.fromCharCode(input[0], input[1], input[2], input[3]) !== CACHE_RENDER_PAYLOAD_MAGIC) throw new CacheRenderBundleError("manifest", "Invalid cache render binary payload");
  const length = new DataView(bytes).getUint32(4, true);
  if (length !== input.length - 8) throw new CacheRenderBundleError("manifest", "Truncated cache render binary payload");
  let encoded = input.slice(8);
  // Extracted bundles use gzip for transfer efficiency. Keep accepting raw
  // JSON payloads so existing bundles remain valid.
  if (encoded[0] === 0x1f && encoded[1] === 0x8b) encoded = decompressSync(encoded);
  const payload = JSON.parse(new TextDecoder().decode(encoded));
  if (payload.version !== CACHE_RENDER_PAYLOAD_VERSION || !Array.isArray(payload.positions) || payload.positions.length % 3) throw new CacheRenderBundleError("manifest", "Unsupported cache render payload schema");
  return payload;
}

export function advanceAnimationTimeForDraw(animationTime: number, clockDelta: number, startsOnThisDraw: boolean) {
  return startsOnThisDraw ? animationTime : animationTime + clockDelta;
}

export type CacheRenderModelOptions = {
  /** Delay applied to every cache-authored animation frame sound. */
  frameSoundDelayMs?: number;
  /** Called once when a spotanim-only renderable reaches the end of its sequence. */
  onSpotAnimComplete?: () => void;
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
  private animationCanBlend = false;
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
    this.activeSpotAnims = this.currentSpotAnims(reference.kind === "model" || reference.kind === "asset" ? undefined : reference.spotAnims);
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
      new THREE.LineBasicMaterial({ color: 0x00ffff }),
    );
  }
  static forRenderable(renderable: Renderable, reference: CacheRenderReference, options?: CacheRenderModelOptions) {
    return new CacheRenderModel(renderable, reference, options);
  }
  spotAnimChanged(spotAnims: CacheRenderSpotAnim[]) { this.activeSpotAnims = spotAnims.slice(); }
  private currentSpotAnims(fallback?: CacheRenderSpotAnim[]) {
    const attached = this.renderable.spotAnims;
    return attached.length ? attached.slice() : (fallback ?? []).slice();
  }
  async animationChanged(id: number, blend: boolean) {
    if (ENABLE_CACHE_RENDER_ANIMATIONS) {
      // SDK callers use semantic pose indices (e.g. FireBow = 6), while the
      // bundle is keyed by the actual cache sequence ID (e.g. 426).
      this.activeAnimation = this.poseMap[String(id)] ?? id;
      this.animationTime = 0;
      this.animationStartsOnNextDraw = true;
      this.animationPlaying = true;
      this.animationCanBlend = blend;
      this.frameSoundPlayer.reset();
    }
    return Promise.resolve();
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
    this.animationCanBlend = false;
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
    this.activeSpotAnims = this.currentSpotAnims(this.reference.kind === "model" || this.reference.kind === "asset" ? undefined : this.reference.spotAnims);
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
      const materials: THREE.Material[] = [new THREE.MeshStandardMaterial({ color: payload.color ?? 0xffffff, vertexColors: Boolean(payload.colors?.length), flatShading: true })];
      if (hasVertexAlpha) enableVertexAlpha(materials[0]);
      const textureMaterial = new Map<number, number>();
      Object.entries(payload.textures ?? {}).forEach(([id, texture]) => {
        const rgba = new Uint8Array(texture.pixels.length * 4);
        texture.pixels.forEach((pixel, index) => { const value = pixel >>> 0; rgba[index * 4] = value >> 16 & 255; rgba[index * 4 + 1] = value >> 8 & 255; rgba[index * 4 + 2] = value & 255; rgba[index * 4 + 3] = value >> 24 & 255; });
        const image = new THREE.DataTexture(rgba, texture.width, texture.height, THREE.RGBAFormat); image.flipY = false; image.needsUpdate = true;
        textureMaterial.set(Number(id), materials.length);
        const textureMaterialInstance = new THREE.MeshStandardMaterial({ map: image, vertexColors: false, flatShading: true });
        if (hasVertexAlpha) enableVertexAlpha(textureMaterialInstance);
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
        clickGeometryDebug.raycast = () => {};
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
          new THREE.LineBasicMaterial({ color: this.renderable.colorHex }),
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
        const effect = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: spotPayload.color ?? 0xffffff, vertexColors: Boolean(spotPayload.colors?.length), flatShading: true, transparent: true }));
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
      // FallbackModel keeps the viewport alive, but do not hide why cache rendering
      // was skipped (bad URL, integrity failure, or an absent loadout reference).
      console.error("[osrs-sdk] Cache render preload failed; using GLTF fallback", error);
    });
    if (this.root.parent !== scene) {
      scene.add(this.root);
      this.renderable.setAnimationListener(this);
    }
    const size = this.renderable.size;
    this.root.visible = visible && (this.mesh !== null || this.spotAnims.length > 0);
    if (this.outline) this.outline.visible = visible && this.renderable.drawOutline;
    this.root.position.set(location.x + size / 2, location.z - 0.49, location.y - size / 2);
    this.root.rotation.order = "YXZ";
    // The client submits standalone GraphicsObjects to the scene with yaw 0.
    // Actor/model renderables use the SDK's west-zero facing convention and
    // need the quarter-turn cache-basis correction.
    const basisRotation = this.reference.kind === "spotAnim" ? 0 : Math.PI / 2;
    this.root.rotation.set(pitch, rotation + basisRotation, 0);
    if (this.outline) {
      if (this.outline.parent !== scene) scene.add(this.outline);
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
      this.trueTile.visible = this.renderable.drawTrueTile && visible;
    }
    this.root.children.forEach((child, index) => {
      const offset = modelOffsets[index]; child.position.set(offset?.x ?? 0, offset?.z ?? 0, offset?.y ?? 0);
    });
    const pose = this.renderable.animationIndex;
    if (!ENABLE_CACHE_RENDER_ANIMATIONS) { this.lastPose = pose; return; }
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
    this.animationTime = advanceAnimationTimeForDraw(this.animationTime, clockDelta, this.animationStartsOnNextDraw);
    this.animationStartsOnNextDraw = false;
    const animationId = this.activeAnimation;
    const animation = this.animations[String(animationId)];
    if (animation && (animation.frames.length || animation.rawFrames?.length || animation.mayaFrames?.length) && this.root.children.length) {
      const total = animation.lengths.reduce((sum, length) => sum + length, 0) / 50;
      let time = this.animationTime;
      let animationEnded = false;
      if (this.animationPlaying && time >= total) {
        this.frameSoundPlayer.advance(animationId, animation, total, false);
        this.frameSoundPlayer.reset();
        this.animationPlaying = false;
        this.animationCanBlend = false;
        this.activeAnimation = this.poseMap[String(pose)] ?? pose;
        this.animationTime = 0;
        this.animationStartsOnNextDraw = true;
        time = 0;
        animationEnded = true;
      } else if (total > 0) time %= total;
      if (!animationEnded) this.frameSoundPlayer.advance(animationId, animation, this.animationTime, !this.animationPlaying);
      let elapsed = 0;
      let frame = 0;
      for (; frame < animation.lengths.length - 1 && time >= elapsed + animation.lengths[frame] / 50; frame++) elapsed += animation.lengths[frame] / 50;
      // Looping pose animations need to blend the final frame back to the
      // first frame; holding the final frame creates a visible snap at the
      // run-cycle boundary. One-shot attack animations still clamp normally.
      const frameCount = animation.mayaFrames?.length || animation.rawFrames?.length || animation.frames.length;
      const next = !this.animationPlaying
        ? (frame + 1) % frameCount
        : Math.min(frame + 1, frameCount - 1);
      const blend = animation.lengths[frame] ? Math.min(1, (time - elapsed) / (animation.lengths[frame] / 50)) : 0;
      const vertices = animation.frames[frame];
      const nextVertices = animation.frames[next];
      const position = this.mesh?.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (position && this.basePositions) {
        const transformed = new Float32Array(this.basePositions);
        const transformedAlphas = this.baseAlphas ? new Float32Array(this.baseAlphas) : undefined;
        const applyMayaFrame = (target: Float32Array, mayaFrame: number[][]) => {
          for (let vertex = 0; vertex < target.length / 3; vertex++) {
            const bones = this.animayaGroups[vertex] ?? [];
            const scales = this.animayaScales[vertex] ?? [];
            if (!bones.length) continue;
            const x = target[vertex * 3], y = target[vertex * 3 + 1], z = target[vertex * 3 + 2];
            let ox = 0, oy = 0, oz = 0, hasWeight = false;
            bones.forEach((bone, index) => {
              const matrix = mayaFrame[bone]; if (!matrix) return;
              const scale = (scales[index] ?? 255) / 255; hasWeight = true;
              ox += (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12] / 128) * scale;
              oy += (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13] / 128) * scale;
              oz += (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14] / 128) * scale;
            });
            // Animaya weights are byte contributions to an accumulated skin
            // matrix. Match the client/reader and do not renormalise them;
            // doing so changes vertices whose authored weights do not sum to
            // exactly 255.
            if (hasWeight) { target[vertex * 3] = ox; target[vertex * 3 + 1] = oy; target[vertex * 3 + 2] = oz; }
          }
        };
        if (animation.mayaFrames?.[frame]) {
          applyMayaFrame(transformed, animation.mayaFrames[frame]);
          if (Settings.smoothCacheAnimations && animation.mayaFrames[next] && next !== frame) {
            const nextTransformed = new Float32Array(this.basePositions);
            applyMayaFrame(nextTransformed, animation.mayaFrames[next]);
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
            if (this.animationPlaying && this.animationCanBlend && interleave.length && poseAnimation?.rawFrames?.length) {
              const poseTotal = poseAnimation.lengths.reduce((sum, length) => sum + length, 0) / 50;
              const poseTime = poseTotal > 0 ? this.poseAnimationTime % poseTotal : 0;
              let poseElapsed = 0, poseFrame = 0;
              for (; poseFrame < poseAnimation.lengths.length - 1 && poseTime >= poseElapsed + poseAnimation.lengths[poseFrame] / 50; poseFrame++) poseElapsed += poseAnimation.lengths[poseFrame] / 50;
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
      for (const spot of this.spotAnims) {
        const animation = spot.animation;
        const placement = this.activeSpotAnims.filter((spotAnim) => spotAnim.id === spot.mesh.userData.spotAnimId)[0];
        const delay = placement?.delay ?? spot.delay;
        const effectTime = this.animationTime - delay / 50;
        const activationAnimation = placement?.animation == null ? true : (this.poseMap[String(placement.animation)] ?? placement.animation) === this.activeAnimation;
        // Attached spotanims are one-shot graphics. Ground effects often live
        // for several ticks, so wrapping with `% total` would replay the
        // graphic before the entity is destroyed.
        const total = animation?.lengths.reduce((sum, length) => sum + length, 0) / 50 || 0;
        const hasFrames = Boolean(animation?.frames.length || animation?.rawFrames?.length || animation?.mayaFrames?.length);
        spot.mesh.visible = this.animationPlaying && activationAnimation && Boolean(placement) && effectTime >= 0 && effectTime < total && hasFrames;
        const spotAnimationId = spot.animationId ?? -1;
        let spotSoundPlayer = this.spotFrameSoundPlayers.get(spotAnimationId);
        if (!spotSoundPlayer) {
          spotSoundPlayer = new AnimationFrameSoundPlayer(this.options.frameSoundDelayMs);
          this.spotFrameSoundPlayers.set(spotAnimationId, spotSoundPlayer);
        }
        if (
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
        spotSoundPlayer.advance(spotAnimationId, animation, effectTime, false);
        const time = Math.max(0, Math.min(effectTime, Math.max(0, total - 1e-6)));
        let elapsed = 0, frame = 0;
        for (; frame < animation.lengths.length - 1 && time >= elapsed + animation.lengths[frame] / 50; frame++) elapsed += animation.lengths[frame] / 50;
        const next = Math.min(frame + 1, animation.frames.length - 1);
        const blend = animation.lengths[frame] ? Math.min(1, (time - elapsed) / (animation.lengths[frame] / 50)) : 0;
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
      // Do not mark the pose as handled until the replacement mesh exists.
      // During an equipment swap ensureLoaded() is asynchronous; recording the
      // pose while mesh is null would prevent it from being initialized once
      // the new payload arrives.
      if (this.mesh && this.meshGeneration === this.modelGeneration) this.lastPose = pose;
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
