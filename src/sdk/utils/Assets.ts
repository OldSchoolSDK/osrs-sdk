declare const __OSRS_ASSET_BASE_URL__: string;

/** Public CDN used by default for GLB and UI assets. Build-time configuration
 * can still override this for a development or self-hosted deployment. */
export const DEFAULT_OSRS_ASSET_BASE_URL = "https://assets-soltrainer.netlify.app";

export class Assets {
  static assetCount = 0;
  static loadingAssetUrls = [];
  static onProgressFns: ((loaded: number, total: number) => void)[] = [];
  static onLoadFns: (() => void)[] = [];

  static loadedAssets = {};
  /**
   * Returns the appropriate URL for an asset and also schedules it for preloading.
   */
  static getAssetUrl(asset: string) {
    const configuredBaseUrl = typeof __OSRS_ASSET_BASE_URL__ !== "undefined"
      ? __OSRS_ASSET_BASE_URL__
      : "";
    const baseUrl = configuredBaseUrl || DEFAULT_OSRS_ASSET_BASE_URL;
    const url = `${baseUrl.replace(/\/$/, "")}/${asset}`;
    if (Assets.loadedAssets[url]) {
      return url;
    }
    Assets.loadingAssetUrls.push(url);
    Assets.assetCount++;
    Promise.resolve().then(async () => {
      console.debug(`Preloading asset: ${url}`);
      const response = await fetch(url);
      const bytes = await response.arrayBuffer();
      console.debug(`Preloaded asset: ${url}, ${response.statusText}: ${bytes.byteLength}`);
      Assets.onProgressFns.forEach((onProgressFns) =>
        onProgressFns(this.assetCount - this.loadingAssetUrls.length, this.assetCount),
      );
      Assets.loadingAssetUrls = this.loadingAssetUrls.filter((u) => u !== url);
      Assets.loadedAssets[url] = true;
    });
    return url;
  }

  static onAssetProgress(progressFn: (loaded: number, total: number) => void) {
    Assets.onProgressFns.push(progressFn);
    return () => {
      Assets.onProgressFns = Assets.onProgressFns.filter((listener) => listener !== progressFn);
    };
  }

  static onAllAssetsLoaded(loadFn: () => void) {
    Assets.onLoadFns.push(loadFn);
    return () => {
      Assets.onLoadFns = Assets.onLoadFns.filter((listener) => listener !== loadFn);
    };
  }

  static checkAssetsLoaded(timer: NodeJS.Timeout) {
    if (Assets.loadingAssetUrls.length === 0) {
      Assets.onLoadFns.forEach((onLoadFunction) => onLoadFunction());
      clearInterval(timer);
    }
  }
}
