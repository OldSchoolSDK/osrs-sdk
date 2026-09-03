import { TileMarker } from "../content/TileMarker";
import { Player } from "./Player";
import { Region } from "./Region";
import { Settings, SettingsSnapshot } from "./Settings";
import { Trainer } from "./Trainer";
import { Assets } from "./utils/Assets";
import { ImageLoader } from "./utils/ImageLoader";
import { Viewport } from "./Viewport";
import { World } from "./World";
import { MapController } from "./MapController";

export type TrainerSnapshot = Readonly<{
  player: Player | null;
  region: Region;
  settings: SettingsSnapshot;
  world: World;
}>;

export type TrainerInstanceOptions = {
  force2d?: boolean;
  readyTimer?: number;
};

export type TrainerLoadingState = Readonly<{
  assetProgress: number;
  assetsLoaded: number;
  assetsReady: boolean;
  assetsTotal: number;
  error?: Error;
  imagesReady: boolean;
  status: "idle" | "loading" | "initialising-viewport" | "ready" | "error";
  viewportReady: boolean;
}>;

export type TrainerLoadOptions = {
  onStateChange?: (state: TrainerLoadingState) => void;
};

/**
 * Owns the lifecycle and services for one trainer instance.
 * The engine still has legacy singletons internally, so only one instance may
 * be active at a time for now.
 */
export class TrainerInstance {
  readonly world = new World();
  private player: Player | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private listeners = new Set<() => void>();
  private snapshot: TrainerSnapshot;
  private unsubscribeSettings: () => void;
  private loadPromise: Promise<void> | null = null;
  private loadingListeners = new Set<(state: TrainerLoadingState) => void>();
  private loadingState: TrainerLoadingState = Object.freeze({
    assetProgress: 0,
    assetsLoaded: 0,
    assetsReady: false,
    assetsTotal: 0,
    imagesReady: false,
    status: "idle",
    viewportReady: false,
  });

  constructor(readonly region: Region, private readonly options: TrainerInstanceOptions = {}) {
    this.world.getReadyTimer = options.readyTimer ?? 6;
    region.world = this.world;
    this.world.addRegion(region);
    this.snapshot = this.createSnapshot();
    this.unsubscribeSettings = Settings.subscribe(() => this.notifyChanged());
  }

  mount(canvas: HTMLCanvasElement, resizeTarget: Element) {
    if (this.canvas && this.canvas !== canvas) throw new Error("TrainerInstance is already mounted to another canvas");
    if (this.player) return this.player;
    this.canvas = canvas;
    this.player = this.region.initialiseRegion().player;
    Viewport.setupViewport(this.region, canvas, resizeTarget, this.options.force2d ?? false);
    Viewport.viewport.setPlayer(this.player);
    TileMarker.loadAll(this.region);
    this.player.perceivedLocation = this.player.location;
    this.player.destinationLocation = this.player.location;
    this.notifyChanged();
    return this.player;
  }

  async initialiseViewport() {
    if (!this.player) throw new Error("Mount the TrainerInstance before initialising its viewport");
    await Viewport.viewport.initialise();
  }

  async load(options: TrainerLoadOptions = {}) {
    if (!this.player) throw new Error("Mount the TrainerInstance before loading its assets");
    const listener = options.onStateChange;
    if (listener) {
      this.loadingListeners.add(listener);
      listener(this.loadingState);
    }

    this.loadPromise ??= this.performLoad();
    try {
      await this.loadPromise;
    } finally {
      if (listener) this.loadingListeners.delete(listener);
    }
  }

  start() {
    this.world.startTicking();
    this.notifyChanged();
  }

  stop() {
    this.world.stopTicking();
    this.notifyChanged();
  }

  reset() {
    Trainer.reset();
    this.player = Trainer.player;
    this.notifyChanged();
    return this.player;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  dispose() {
    if (!this.world.isPaused) this.world.stopTicking();
    Viewport.viewport?.dispose();
    this.unsubscribeSettings();
    this.listeners.clear();
    this.loadingListeners.clear();
  }

  private createSnapshot(): TrainerSnapshot {
    return Object.freeze({
      player: this.player,
      region: this.region,
      settings: Settings.getSnapshot(),
      world: this.world,
    });
  }

  private notifyChanged() {
    this.snapshot = this.createSnapshot();
    this.listeners.forEach((listener) => listener());
  }

  private async performLoad() {
    const assetsTotal = Assets.assetCount;
    const assetsLoaded = assetsTotal - Assets.loadingAssetUrls.length;
    this.setLoadingState({
      assetProgress: assetsTotal === 0 ? 1 : assetsLoaded / assetsTotal,
      assetsLoaded,
      assetsReady: Assets.loadingAssetUrls.length === 0,
      assetsTotal,
      error: undefined,
      imagesReady: ImageLoader.pendingImages === ImageLoader.completedImages,
      status: "loading",
      viewportReady: false,
    });

    try {
      await Promise.all([this.waitForImages(), this.waitForAssets()]);
      this.setLoadingState({ status: "initialising-viewport" });
      await this.initialiseViewport();
      this.setLoadingState({ status: "ready", viewportReady: true });
    } catch (error) {
      const loadingError = error instanceof Error ? error : new Error(String(error));
      this.setLoadingState({ error: loadingError, status: "error" });
      throw loadingError;
    }
  }

  private waitForImages() {
    return new Promise<void>((resolve) => {
      let interval: NodeJS.Timeout;
      const onLoaded = () => {
        unsubscribe();
        if (interval) clearInterval(interval);
        MapController.controller.updateOrbsMask(this.player.currentStats, this.player.stats);
        this.setLoadingState({ imagesReady: true });
        resolve();
      };
      const unsubscribe = ImageLoader.onAllImagesLoaded(onLoaded);
      interval = setInterval(() => ImageLoader.checkImagesLoaded(interval), 50);
    });
  }

  private waitForAssets() {
    return new Promise<void>((resolve) => {
      let interval: NodeJS.Timeout;
      const unsubscribeProgress = Assets.onAssetProgress((loaded, total) => {
        this.setLoadingState({
          assetProgress: total === 0 ? 1 : loaded / total,
          assetsLoaded: loaded,
          assetsTotal: total,
        });
      });
      const onLoaded = () => {
        unsubscribeLoaded();
        unsubscribeProgress();
        if (interval) clearInterval(interval);
        const total = Assets.assetCount;
        this.setLoadingState({
          assetProgress: 1,
          assetsLoaded: total,
          assetsReady: true,
          assetsTotal: total,
        });
        resolve();
      };
      const unsubscribeLoaded = Assets.onAllAssetsLoaded(onLoaded);
      interval = setInterval(() => Assets.checkAssetsLoaded(interval), 50);
    });
  }

  private setLoadingState(patch: Partial<TrainerLoadingState>) {
    this.loadingState = Object.freeze({ ...this.loadingState, ...patch });
    this.loadingListeners.forEach((listener) => listener(this.loadingState));
  }
}
