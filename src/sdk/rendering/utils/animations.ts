import type { CacheRenderRawFrame } from "../../../cache-render-format";
import type { CacheRenderAnimation } from "../../../cache-render-format";
import { CLIENT_CYCLES_PER_SECOND } from "../../utils/constants";

export type TransformSelection = { indices: Set<number>; include: boolean };

export type AnimationFrameSample = {
  /** Elapsed time mapped into the animation's playable range. */
  time: number;
  /** Total animation duration in seconds. */
  total: number;
  /** Frame selected for the sampled time, or -1 before playback starts. */
  frame: number;
  /** Following frame used for interpolation. */
  nextFrame: number;
  /** Interpolation progress between `frame` and `nextFrame`. */
  blend: number;
};

/** Resolve elapsed time to the current and next cache animation frames. */
export function sampleAnimation(animation: CacheRenderAnimation, elapsed: number, looping: boolean): AnimationFrameSample {
  const total = animation.lengths.reduce((sum, length) => sum + length, 0) / CLIENT_CYCLES_PER_SECOND;
  const frameCount = animation.mayaFrames?.length || animation.rawFrames?.length || animation.frames.length;
  if (frameCount <= 0 || elapsed < 0) return { time: elapsed, total, frame: -1, nextFrame: -1, blend: 0 };

  const time = total <= 0
    ? 0
    : looping
      ? elapsed % total
      : Math.max(0, Math.min(elapsed, Math.max(0, total - Number.EPSILON)));
  // Compare integral cache-cycle boundaries to avoid accumulated seconds drift.
  const cycles = time * CLIENT_CYCLES_PER_SECOND;
  let frameStart = 0;
  let frame = 0;
  while (
    frame < Math.min(animation.lengths.length, frameCount) - 1
    && cycles + 1e-9 >= frameStart + animation.lengths[frame]
  ) {
    frameStart += animation.lengths[frame];
    frame++;
  }

  frame = Math.min(frame, frameCount - 1);
  const nextFrame = looping ? (frame + 1) % frameCount : Math.min(frame + 1, frameCount - 1);
  const frameDuration = animation.lengths[frame];
  const blend = frameDuration ? Math.max(0, Math.min(1, (cycles - frameStart) / frameDuration)) : 0;
  return { time, total, frame, nextFrame, blend };
}

enum FrameType {
  Pivot = 0,
  Translate = 1,
  Rotate = 2,
  Scale = 3,
  Alpha = 5,
}

/** Reused native-coordinate buffers for legacy deformation. */
export class RawFrameWorkspace {
  x = new Float64Array(0);
  y = new Float64Array(0);
  z = new Float64Array(0);
  readonly seen = new Set<number>();

  resize(count: number) {
    if (this.x.length === count) return;
    this.x = new Float64Array(count);
    this.y = new Float64Array(count);
    this.z = new Float64Array(count);
  }
}

const rotationSine = Int32Array.from({ length: 256 }, (_, angle) => Math.floor(65536 * Math.sin(angle * Math.PI / 128)));
const rotationCosine = Int32Array.from({ length: 256 }, (_, angle) => Math.floor(65536 * Math.cos(angle * Math.PI / 128)));

/** RuneLite-style transform interpolation: deform once, wrapping rotation deltas. */
export function interpolateRawFrames(
  current: CacheRenderRawFrame, next: CacheRenderRawFrame, blend: number,
  output: CacheRenderRawFrame = { types: [], maps: [], indexFrameIds: [], x: [], y: [], z: [] },
  floatingPoint = false,
): CacheRenderRawFrame {
  // Frames from different skeletons cannot be interpolated together.
  if (current.baseId !== next.baseId || blend <= 0) return current;
  output.baseId = current.baseId;
  output.types = current.types;
  output.maps = current.maps;
  output.indexFrameIds.length = output.x.length = output.y.length = output.z.length = 0;
  let a = 0, b = 0;
  for (let slot = 0; slot < current.types.length; slot++) {
    const hasCurrent = current.indexFrameIds[a] === slot;
    const hasNext = next.indexFrameIds[b] === slot;
    if (!hasCurrent && !hasNext) continue;
    const type = current.types[slot];
    const fallback = type === FrameType.Scale ? 128 : 0;
    output.indexFrameIds.push(slot);
    for (const axis of ["x", "y", "z"] as const) {
      const from = hasCurrent ? current[axis][a] ?? fallback : fallback;
      const to = hasNext ? next[axis][b] ?? fallback : fallback;
      let value = from;
      if (type === FrameType.Rotate) {
        let delta = (to - from) & 255;
        if (delta >= 128) delta -= 256;
        value = floatingPoint ? ((from + delta * blend) % 256 + 256) % 256 : (from + Math.trunc(delta * blend)) & 255;
      } else if (type !== FrameType.Alpha) value = from + (floatingPoint ? (to - from) * blend : Math.trunc((to - from) * blend));
      else if (axis !== "x") value = 0;
      output[axis].push(value);
    }
    if (hasCurrent) a++;
    if (hasNext) b++;
  }
  return output;
}

/**
 * Apply one legacy cache frame to a composed model in place.
 *
 * `selection` mirrors the client's two-pass animate2 operation: origin slots
 * always run, while other transform slots are selected by the primary
 * sequence's opcode-3 interleave list.
 */
export function applyRawFrame(
  positions: Float32Array,
  groups: number[][],
  sourceVertices: number[],
  frame: CacheRenderRawFrame,
  selection?: TransformSelection,
  alphas?: Float32Array,
  alphaGroups?: number[][],
  workspace = new RawFrameWorkspace(),
  floatingPoint = false,
) {
  workspace.resize(positions.length / 3);
  const { x, y, z } = workspace;

  // Work in the cache's native model units. Besides avoiding accumulating
  // scale error, this lets the fixed-point rotations match the game/client
  // implementation's signed >> 16 arithmetic.
  for (let index = 0; index < x.length; index++) {
    x[index] = positions[index * 3] * 128;
    y[index] = -positions[index * 3 + 1] * 128;
    z[index] = -positions[index * 3 + 2] * 128;
  }

  const pivot = { x: 0, y: 0, z: 0 };
  for (let index = 0; index < frame.indexFrameIds.length; index++) {
    const transform = frame.indexFrameIds[index];
    const type = frame.types[transform];
    const map = frame.maps[transform] ?? [];
    if (type !== FrameType.Pivot && selection && selection.indices.has(transform) !== selection.include) continue;

    const deltaX = frame.x[index] ?? 0;
    const deltaY = frame.y[index] ?? 0;
    const deltaZ = frame.z[index] ?? 0;
    if (type === FrameType.Alpha) {
      if (!alphas) continue;
      for (const group of map) {
        for (const vertex of alphaGroups?.[group] ?? []) {
          alphas[vertex] = Math.max(0, Math.min(255, alphas[vertex] + deltaX * 8));
        }
      }
      continue;
    }

    if (type === FrameType.Pivot) {
      let count = 0;
      pivot.x = pivot.y = pivot.z = 0;
      const seen = workspace.seen;
      seen.clear();
      for (const group of map) {
        for (const vertex of groups[group] ?? []) {
          // Textures/flat face colours expand a cache vertex into several
          // render vertices. Count that source vertex once when calculating a
          // pivot, but do not weld unrelated vertices from different items.
          const source = sourceVertices[vertex] ?? vertex;
          if (seen.has(source)) continue;
          seen.add(source);
          pivot.x += x[vertex];
          pivot.y += y[vertex];
          pivot.z += z[vertex];
          count++;
        }
      }
      if (count) {
        pivot.x = deltaX + pivot.x / count;
        pivot.y = deltaY + pivot.y / count;
        pivot.z = deltaZ + pivot.z / count;
      } else {
        pivot.x = deltaX;
        pivot.y = deltaY;
        pivot.z = deltaZ;
      }
      continue;
    }

    const sinX = floatingPoint ? Math.sin(deltaX * Math.PI / 128) : rotationSine[deltaX & 255];
    const cosX = floatingPoint ? Math.cos(deltaX * Math.PI / 128) : rotationCosine[deltaX & 255];
    const sinY = floatingPoint ? Math.sin(deltaY * Math.PI / 128) : rotationSine[deltaY & 255];
    const cosY = floatingPoint ? Math.cos(deltaY * Math.PI / 128) : rotationCosine[deltaY & 255];
    const sinZ = floatingPoint ? Math.sin(deltaZ * Math.PI / 128) : rotationSine[deltaZ & 255];
    const cosZ = floatingPoint ? Math.cos(deltaZ * Math.PI / 128) : rotationCosine[deltaZ & 255];
    for (const group of map) {
      for (const vertex of groups[group] ?? []) {
        if (type === FrameType.Translate) {
          x[vertex] += deltaX;
          y[vertex] += deltaY;
          z[vertex] += deltaZ;
          continue;
        }

        x[vertex] -= pivot.x;
        y[vertex] -= pivot.y;
        z[vertex] -= pivot.z;
        if (type === FrameType.Rotate) {
          if (floatingPoint) {
            let transformed = sinZ * y[vertex] + cosZ * x[vertex];
            y[vertex] = cosZ * y[vertex] - sinZ * x[vertex];
            x[vertex] = transformed;
            transformed = cosX * y[vertex] - sinX * z[vertex];
            z[vertex] = sinX * y[vertex] + cosX * z[vertex];
            y[vertex] = transformed;
            transformed = sinY * z[vertex] + cosY * x[vertex];
            z[vertex] = cosY * z[vertex] - sinY * x[vertex];
            x[vertex] = transformed;
          } else {
            let transformed = (sinZ * y[vertex] + cosZ * x[vertex]) >> 16;
            y[vertex] = (cosZ * y[vertex] - sinZ * x[vertex]) >> 16;
            x[vertex] = transformed;
            transformed = (cosX * y[vertex] - sinX * z[vertex]) >> 16;
            z[vertex] = (sinX * y[vertex] + cosX * z[vertex]) >> 16;
            y[vertex] = transformed;
            transformed = (sinY * z[vertex] + cosY * x[vertex]) >> 16;
            z[vertex] = (cosY * z[vertex] - sinY * x[vertex]) >> 16;
            x[vertex] = transformed;
          }
        } else if (type === FrameType.Scale) {
          x[vertex] *= deltaX / 128;
          y[vertex] *= deltaY / 128;
          z[vertex] *= deltaZ / 128;
        }
        x[vertex] += pivot.x;
        y[vertex] += pivot.y;
        z[vertex] += pivot.z;
      }
    }
  }

  for (let index = 0; index < x.length; index++) {
    positions[index * 3] = x[index] / 128;
    positions[index * 3 + 1] = -y[index] / 128;
    positions[index * 3 + 2] = -z[index] / 128;
  }
}

/** Approximate fractional Maya poses from the extracted matrix samples, reusing bone buffers. */
export function interpolateMayaFrames(current: number[][], next: number[][], blend: number, output: number[][]): number[][] {
  if (blend <= 0 || current === next) return current;
  output.length = current.length;
  for (let bone = 0; bone < current.length; bone++) {
    const from = current[bone], to = next[bone] ?? from;
    const matrix = output[bone] ?? (output[bone] = new Array<number>(16));
    for (let component = 0; component < 16; component++) matrix[component] = from[component] + (to[component] - from[component]) * blend;
  }
  return output;
}

/**
 * Blend a one-shot animation with a looping pose using the cache client's
 * two-pass `animate2` behavior.
 *
 * The primary frame is applied to transforms excluded by `interleave`; the
 * pose frame is then applied to transforms included by it. Pivot transforms
 * run in both passes so each pass calculates the correct transform origin.
 * Both frames mutate the supplied positions, and optionally face alphas, in
 * place.
 *
 * @param positions Render-space vertex positions initialized to the bind pose.
 * @param groups Frame-map groups containing render vertex indices.
 * @param sourceVertices Identity mapping used to count expanded render vertices
 *   only once when calculating transform pivots.
 * @param primary The active one-shot frame, such as an attack animation.
 * @param pose The concurrent looping pose frame, such as walk or idle.
 * @param interleave Transform indices assigned to the pose pass. The cache
 *   sentinel value `9999999` is ignored.
 * @param alphas Optional mutable face-alpha values initialized to the bind pose.
 * @param alphaGroups Frame-map groups containing face-alpha indices.
 */
export function applyBlendedRawFrames(
  positions: Float32Array,
  groups: number[][],
  sourceVertices: number[],
  primary: CacheRenderRawFrame,
  pose: CacheRenderRawFrame,
  interleave: number[],
  alphas?: Float32Array,
  alphaGroups?: number[][],
  workspace?: RawFrameWorkspace,
) {
  const selection = new Set(interleave.filter((index) => index !== 9999999));
  applyRawFrame(positions, groups, sourceVertices, primary, { indices: selection, include: false }, alphas, alphaGroups, workspace);
  applyRawFrame(positions, groups, sourceVertices, pose, { indices: selection, include: true }, alphas, alphaGroups, workspace);
}

/**
 * Apply an Animaya bone frame to a model's positions in place.
 *
 * Animaya weights are byte contributions to an accumulated skin matrix. They
 * are intentionally not normalized because authored weights do not always sum
 * to exactly 255.
 */
export function applyMayaFrame(
  positions: Float32Array,
  frame: number[][],
  vertexGroups: number[][],
  vertexScales: number[][],
) {
  for (let vertex = 0; vertex < positions.length / 3; vertex++) {
    const bones = vertexGroups[vertex] ?? [];
    const scales = vertexScales[vertex] ?? [];
    if (!bones.length) continue;

    const x = positions[vertex * 3];
    const y = positions[vertex * 3 + 1];
    const z = positions[vertex * 3 + 2];
    let outputX = 0;
    let outputY = 0;
    let outputZ = 0;
    let hasWeight = false;

    for (let index = 0; index < bones.length; index++) {
      const bone = bones[index];
      const matrix = frame[bone];
      if (!matrix) continue;
      const scale = (scales[index] ?? 255) / 255;
      hasWeight = true;
      outputX += (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12] / 128) * scale;
      outputY += (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13] / 128) * scale;
      outputZ += (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14] / 128) * scale;
    }

    if (hasWeight) {
      positions[vertex * 3] = outputX;
      positions[vertex * 3 + 1] = outputY;
      positions[vertex * 3 + 2] = outputZ;
    }
  }
}
