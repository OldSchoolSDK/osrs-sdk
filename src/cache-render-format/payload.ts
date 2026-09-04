/** Shared JSON payload contract stored inside an OSRB binary asset. */
export const CACHE_RENDER_PAYLOAD_MAGIC = "OSRB";
export const CACHE_RENDER_PAYLOAD_VERSION = 1 as const;

export type CacheRenderRawFrame = { baseId?: number; types: number[]; maps: number[][]; indexFrameIds: number[]; x: number[]; y: number[]; z: number[] };
export type CacheRenderFrameSound = { id: number; loops: number; location: number; retain: number; weight: number };
export type CacheRenderAnimation = {
  frames: number[][];
  lengths: number[];
  rawFrames?: CacheRenderRawFrame[];
  interleaveLeave?: number[];
  mayaFrames?: number[][][];
  /** Frame index to one or more weighted sound variants from the sequence definition. */
  frameSounds?: Record<string, CacheRenderFrameSound[]>;
  soundsCrossWorldView?: boolean;
};
export type CacheRenderTexture = { width: number; height: number; pixels: number[] };
export type CacheRenderPayload = {
  version: typeof CACHE_RENDER_PAYLOAD_VERSION;
  positions: number[];
  indices?: number[]; vertexGroups?: number[][]; sourceVertices?: number[];
  animayaGroups?: number[][]; animayaScales?: number[][];
  colors?: number[]; faceColors?: number[]; alphas?: number[]; alphaGroups?: number[][];
  uvs?: number[]; textureIds?: number[]; textures?: Record<string, CacheRenderTexture>;
  normals?: number[]; color?: number; scale?: number;
  animations?: Record<string, CacheRenderAnimation>; poseMap?: Record<string, number>;
  geometryClickbox?: { positions: number[]; indices?: number[] };
  spotAnim?: { id?: number; animationId?: number; resizeX?: number; resizeY?: number; rotation?: number; height?: number; delay?: number };
  /** Spatially partitioned static geometry, used by compiled region scenes. */
  chunks?: CacheRenderStaticChunk[];
};
export type CacheRenderStaticChunk = Pick<CacheRenderPayload, "positions" | "indices" | "colors" | "faceColors" | "alphas" | "uvs" | "textureIds" | "textures"> & { x: number; y: number };
