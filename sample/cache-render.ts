import { CacheRender } from "../src";

declare const __OSRS_CACHE_RENDER_MANIFEST_URL__: string;

// A manifest URL can be supplied before the sample starts when assets are hosted separately.
declare global { interface Window { OSRS_CACHE_RENDER_MANIFEST_URL?: string } }

export const DEFAULT_CACHE_RENDER_MANIFEST_URL = "/cache-assets/manifest.json";

export function configureSampleCacheRenderer() {
  CacheRender.configure(
    __OSRS_CACHE_RENDER_MANIFEST_URL__ ||
    window.OSRS_CACHE_RENDER_MANIFEST_URL ||
    DEFAULT_CACHE_RENDER_MANIFEST_URL,
  );
}
