import { CacheRender } from "../src";

// Deploy this immutable manifest with the derived payloads. A local URL can be supplied
// before the sample starts (for example window.OSRS_CACHE_RENDER_MANIFEST_URL = "/bundle/manifest.json").
declare global { interface Window { OSRS_CACHE_RENDER_MANIFEST_URL?: string } }

export const DEFAULT_CACHE_RENDER_MANIFEST_URL = "http://127.0.0.1:8081/manifest.json";

export function configureSampleCacheRenderer() {
  CacheRender.configure(window.OSRS_CACHE_RENDER_MANIFEST_URL || DEFAULT_CACHE_RENDER_MANIFEST_URL);
}
