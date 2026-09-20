import { decompressSync } from "fflate";
import { CACHE_RENDER_PAYLOAD_MAGIC, CACHE_RENDER_PAYLOAD_VERSION } from "../../../cache-render-format";
import type { CacheRenderAnimation, CacheRenderPayload, CacheRenderTexture } from "../../../cache-render-format";
import { CacheRenderBundle, CacheRenderBundleError } from "../CacheRenderBundle";

// Decoded payloads are immutable bundle data, so retain them across model
// invalidations and rapid equipment swaps. Cache promises too, allowing
// concurrent swaps to share one fetch/decode operation. Failed loads are
// evicted so a later attempt can retry.
const decodedPayloadCache = new Map<string, Promise<CacheRenderPayload>>();

export function cachedPayload(bundle: CacheRenderBundle, assetId: string): Promise<CacheRenderPayload> {
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

export function decodeCacheRenderPayload(bytes: ArrayBuffer): CacheRenderPayload {
  const input = new Uint8Array(bytes);
  if (input.length < 8 || String.fromCharCode(input[0], input[1], input[2], input[3]) !== CACHE_RENDER_PAYLOAD_MAGIC) {
    throw new CacheRenderBundleError("manifest", "Invalid cache render binary payload");
  }

  const length = new DataView(bytes).getUint32(4, true);
  if (length !== input.length - 8) {
    throw new CacheRenderBundleError("manifest", "Truncated cache render binary payload");
  }

  let encoded = input.slice(8);
  // Extracted bundles use gzip for transfer efficiency. Keep accepting raw
  // JSON payloads so existing bundles remain valid.
  if (encoded[0] === 0x1f && encoded[1] === 0x8b) encoded = decompressSync(encoded);

  const payload = JSON.parse(new TextDecoder().decode(encoded));
  if (payload.version !== CACHE_RENDER_PAYLOAD_VERSION || !Array.isArray(payload.positions) || payload.positions.length % 3) {
    throw new CacheRenderBundleError("manifest", "Unsupported cache render payload schema");
  }
  return payload;
}

export function mergePayloads(payloads: CacheRenderPayload[]): CacheRenderPayload {
  const nonEmpty = payloads.filter((payload) => (payload.indices?.length ?? 0) > 0 || payload.positions.length > 3);
  // Mutable references allow concatenation without spread operations, which
  // hit stack limits for large payloads.
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
  const textures: Record<string, CacheRenderTexture> = {};
  const animations: Record<string, CacheRenderAnimation> = {};

  // Animation metadata may live in a geometry-free shared payload. Collect it
  // independently of the geometry merge so shared player sequences compose
  // with whatever equipment is currently selected.
  payloads.forEach((payload) => Object.entries(payload.animations ?? {}).forEach(([id, animation]) => {
    const existing = animations[id];
    if (!existing) {
      animations[id] = { frames: animation.frames.map((frame) => frame.slice()), lengths: animation.lengths.slice(), precedenceAnimating: animation.precedenceAnimating, priority: animation.priority, rawFrames: animation.rawFrames, interleaveLeave: animation.interleaveLeave, mayaFrames: animation.mayaFrames, frameSounds: animation.frameSounds, soundsCrossWorldView: animation.soundsCrossWorldView };
    } else if (animation.rawFrames?.length && !existing.rawFrames?.length) {
      // Prefer the shared frame-map representation when it is available.
      animations[id] = { frames: animation.frames.map((frame) => frame.slice()), lengths: animation.lengths.slice(), precedenceAnimating: animation.precedenceAnimating, priority: animation.priority, rawFrames: animation.rawFrames, interleaveLeave: animation.interleaveLeave, mayaFrames: animation.mayaFrames, frameSounds: animation.frameSounds, soundsCrossWorldView: animation.soundsCrossWorldView };
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
    version: CACHE_RENDER_PAYLOAD_VERSION,
    positions,
    indices,
    vertexGroups,
    alphaGroups,
    sourceVertices,
    animayaGroups,
    animayaScales,
    colors: colors.length ? colors : undefined,
    alphas: alphas.length ? alphas : undefined,
    uvs: uvs.length ? uvs : undefined,
    textureIds: textureIds.length ? textureIds : undefined,
    textures: Object.keys(textures).length ? textures : undefined,
    color: nonEmpty[0]?.color,
    scale: nonEmpty[0]?.scale,
    animations,
    poseMap: Object.assign({}, ...payloads.map((payload) => payload.poseMap ?? {})),
    geometryClickbox: payloads.find((payload) => payload.geometryClickbox)?.geometryClickbox,
  };
}
