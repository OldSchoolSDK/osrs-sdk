import type { CacheAssets } from "osrs-sdk/asset-manifest";

export type SceneTouchups = {
  replacements?: Array<{ x: number; y: number; z?: number; objectId: number; orientation?: number }>;
  rectangleReplacements?: Array<{
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    z?: number;
    objectId: number;
    orientation?: number;
  }>;
  removals?: Array<{ xMin: number; xMax: number; yMin: number; yMax: number; z?: number }>;
};
export type AssetConfig = {
  cache: { openrs2: number };
  assets?: CacheAssets;
  /** Explicit whole-entry replacements; ordinary requirements merge additively. */
  overrides?: CacheAssets;
  outDir?: string;
  cacheDir?: string;
  readerPath?: string;
  scenes?: Record<number, SceneTouchups>;
  /** Build-only escape hatch; never import this config into browser code. */
  hooks?: {
    sceneLocation?: (regionId: number, location: any) => any | null;
    clickboxFilter?: Record<number, (model: { faceAlphas?: number[] }, face: number) => boolean>;
  };
};
export function defineConfig<T extends AssetConfig>(config: T): T;
export function mergeAssets(base: CacheAssets, client?: CacheAssets, overrides?: CacheAssets): Required<CacheAssets>;
export function buildAssets(options?: {
  config?: string;
  cwd?: string;
  cacheId?: number;
  cacheDir?: string;
  readerPath?: string;
  outDir?: string;
}): Promise<any>;
