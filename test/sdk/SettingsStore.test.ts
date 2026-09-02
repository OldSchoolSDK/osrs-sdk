import { SETTINGS_STORAGE_KEY, Settings } from "../../src/sdk/Settings";
import { createSettingsStore } from "../../src/sdk/SettingsStore";

describe("Settings legacy migration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Settings._isMobileResult = false;
  });

  it("migrates existing per-key values into the versioned settings object", () => {
    window.localStorage.setItem("zoomScale", "1.5");
    window.localStorage.setItem("renderFps", "120");
    window.localStorage.setItem("smoothCacheAnimations", "false");
    window.localStorage.setItem("playsAudio", "true");
    window.localStorage.setItem("inputDelay", "80");
    window.localStorage.setItem("loadout", "legacy_loadout");
    window.localStorage.setItem("inventory_key", "w");
    window.localStorage.setItem("tileMarkerColor", "#123456");
    window.localStorage.setItem("tile_markers", JSON.stringify([{ x: 12, y: 34 }]));
    window.localStorage.setItem("menuVisible", "false");
    window.localStorage.setItem("use3dView", "false");
    window.localStorage.setItem("stats", JSON.stringify({ attack: 88, prayer: 77 }));

    Settings.readFromStorage();

    expect(Settings.zoomScale).toBe(1.5);
    expect(Settings.renderFps).toBe(120);
    expect(Settings.smoothCacheAnimations).toBe(false);
    expect(Settings.playsAudio).toBe(true);
    expect(Settings.inputDelay).toBe(80);
    expect(Settings.loadout).toBe("legacy_loadout");
    expect(Settings.inventory_key).toBe("w");
    expect(Settings.isUsingWasdKeybind).toBe(true);
    expect(Settings.tileMarkerColor).toBe("#123456");
    expect(Settings.tile_markers).toEqual([{ x: 12, y: 34 }]);
    expect(Settings.menuVisible).toBe(false);
    expect(Settings.use3dView).toBe(false);
    expect(Settings.player_stats.attack).toBe(88);
    expect(Settings.player_stats.prayer).toBe(77);

    const migrated = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY));
    expect(migrated.version).toBe(1);
    expect(migrated.values.renderFps).toBe(120);
    expect(migrated.values.tileMarkerColor).toBe("#123456");
    expect(window.localStorage.getItem("renderFps")).toBe("120");
  });

  it("uses the migrated object thereafter and persists atomic updates", () => {
    window.localStorage.setItem("renderFps", "30");
    Settings.readFromStorage();

    Settings.set({ renderFps: 120, smoothCacheAnimations: false });
    window.localStorage.setItem("renderFps", "60");
    Settings.readFromStorage();

    expect(Settings.renderFps).toBe(120);
    expect(Settings.smoothCacheAnimations).toBe(false);
    expect(Settings.getSnapshot().renderFps).toBe(120);
  });
});

describe("SettingsStore", () => {
  beforeEach(() => window.localStorage.clear());

  it("persists a versioned JSON object and merges newly introduced defaults", () => {
    const original = createSettingsStore({
      defaults: { difficulty: 1, showTiles: false },
      storageKey: "test:settings",
      version: 2,
    });
    original.set({ difficulty: 3 });

    const expanded = createSettingsStore({
      defaults: { difficulty: 1, showNames: true, showTiles: false },
      storageKey: "test:settings",
      version: 2,
    });

    expect(expanded.load()).toEqual({ difficulty: 3, showNames: true, showTiles: false });
  });

  it("notifies watchers only when their selected value changes", () => {
    const store = createSettingsStore({ defaults: { flareLevel: 1, showNames: false } });
    const effect = jest.fn();
    const unsubscribe = store.watch((state) => state.flareLevel, effect, { runImmediately: true });

    store.set({ showNames: true });
    store.set({ flareLevel: 2 });
    unsubscribe();
    store.set({ flareLevel: 3 });

    expect(effect).toHaveBeenCalledTimes(2);
    expect(effect).toHaveBeenLastCalledWith(2, 1);
  });
});
