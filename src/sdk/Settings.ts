"use strict";
// Note: as of 2026-09-02, we migrated to one settings blob. There'll be a one-time migration to this
// format.

import { Location } from "./Location";
import { DeserializePlayerStats, PlayerStats } from "./PlayerStats";
import { createJsonSettingsStorage, createSettingsStore, SettingsStorage } from "./SettingsStore";

const WASD = ["w", "a", "s", "d"];
export const SETTINGS_STORAGE_KEY = "osrs-sdk:settings";

export type SettingsState = {
  antiDrag: number;
  combat_key: string;
  displayFeedback: boolean;
  displayMobLoS: boolean;
  displayPlayerLoS: boolean;
  displayXpDrops: boolean;
  equipment_key: string;
  inputDelay: number;
  inventory_key: string;
  loadout: string;
  lockPOV: boolean;
  maxUiScale: number;
  menuVisible: boolean;
  metronome: boolean;
  northPillar: boolean;
  onTask: boolean;
  player_stats: PlayerStats;
  playsAreaAudio: boolean;
  playsAudio: boolean;
  prayer_key: string;
  renderFps: number;
  rotated: string;
  smoothCacheAnimations: boolean;
  southPillar: boolean;
  spellbook_key: string;
  tile_markers: Location[];
  tileMarkerColor: string;
  use3dView: boolean;
  westPillar: boolean;
  zoomScale: number;
};

export type SettingsSnapshot = Readonly<SettingsState>;

export class Settings {
  static zoomScale = 1;

  static _tileSize: number;
  static get tileSize() {
    return Settings._tileSize * Settings.zoomScale;
  }

  static tickMs = 600;
  static renderFps = 60;
  static smoothCacheAnimations = true;
  static playsAudio: boolean;
  static playsAreaAudio: boolean;
  static inputDelay = 0;
  static rotated: string;
  static region: string;
  static displayXpDrops: boolean;
  static lockPOV: boolean;
  static displayFeedback: boolean;
  static metronome: boolean;
  static antiDrag: number;

  static inventory_key: string;
  static spellbook_key: string;
  static equipment_key: string;
  static prayer_key: string;
  static combat_key: string;
  static tile_markers: Location[];

  static tileMarkerColor: string;

  static loadout: string;
  static onTask: boolean;
  static player_stats: PlayerStats;
  static is_keybinding = false;
  static southPillar = true;
  static westPillar = true;
  static northPillar = true;

  static displayPlayerLoS = false;
  static displayMobLoS = false;
  static menuVisible: boolean;

  static minimapScale: number;
  static controlPanelScale: number;

  static maxUiScale: number;
  static showPredictedHit = true;

  static _isMobileResult = null;

  static use3dView = true;

  static isUsingWasdKeybind = Settings.checkWasd();

  static subscribe(listener: () => void) {
    return settingsStore.subscribe(listener);
  }

  static getSnapshot() {
    return settingsStore.getSnapshot();
  }

  static set(patch: Partial<SettingsState>) {
    Settings.applyState({ ...Settings.toState(), ...patch });
    Settings.persistToStorage();
    return Settings.getSnapshot();
  }

  static notifyChanged() {
    settingsStore.replace(Settings.toState(), false);
  }

  static setMenuVisible(visible: boolean) {
    Settings.menuVisible = visible;
    Settings.notifyChanged();
  }

  private static checkWasd() {
    const result =
      WASD.includes(Settings.inventory_key) ||
      WASD.includes(Settings.equipment_key) ||
      WASD.includes(Settings.combat_key) ||
      WASD.includes(Settings.prayer_key);
    Settings.isUsingWasdKeybind = result;
    return result;
  }

  static mobileCheck() {
    if (Settings._isMobileResult !== null) return Settings._isMobileResult;
    Settings._isMobileResult = /Mobi/.test(navigator.userAgent);
    return Settings._isMobileResult;
  }

  static persistToStorage() {
    Settings.checkWasd();
    settingsStore.replace(Settings.toState());
  }

  /** Retained for source compatibility with trainers that read ad-hoc keys. */
  static read<T>(key: string, defaultValue: T): T {
    const val: T | null = window.localStorage.getItem(key) as T | null;
    return val === null ? defaultValue : val;
  }

  static readFromStorage() {
    Settings.minimapScale = Settings.mobileCheck() ? 0.65 : 1;
    Settings.controlPanelScale = Settings.mobileCheck() ? 0.9 : 1.5;
    Settings.applyState(settingsStore.load());

    if (Settings.mobileCheck()) {
      Settings.playsAudio = false;
      Settings.playsAreaAudio = false;
    }
    if (Settings.use3dView) Settings.rotated = "north";

    Settings.checkWasd();
    Settings.notifyChanged();
  }

  private static applyState(state: SettingsSnapshot) {
    Object.assign(Settings, state);
  }

  private static toState(): SettingsState {
    return {
      antiDrag: Settings.antiDrag,
      combat_key: Settings.combat_key,
      displayFeedback: Settings.displayFeedback,
      displayMobLoS: Settings.displayMobLoS,
      displayPlayerLoS: Settings.displayPlayerLoS,
      displayXpDrops: Settings.displayXpDrops,
      equipment_key: Settings.equipment_key,
      inputDelay: Settings.inputDelay,
      inventory_key: Settings.inventory_key,
      loadout: Settings.loadout,
      lockPOV: Settings.lockPOV,
      maxUiScale: Settings.maxUiScale,
      menuVisible: Settings.menuVisible,
      metronome: Settings.metronome,
      northPillar: Settings.northPillar,
      onTask: Settings.onTask,
      player_stats: Settings.player_stats,
      playsAreaAudio: Settings.playsAreaAudio,
      playsAudio: Settings.playsAudio,
      prayer_key: Settings.prayer_key,
      renderFps: Settings.renderFps,
      rotated: Settings.rotated,
      smoothCacheAnimations: Settings.smoothCacheAnimations,
      southPillar: Settings.southPillar,
      spellbook_key: Settings.spellbook_key,
      tile_markers: Settings.tile_markers,
      tileMarkerColor: Settings.tileMarkerColor,
      use3dView: Settings.use3dView,
      westPillar: Settings.westPillar,
      zoomScale: Settings.zoomScale,
    };
  }
}

function createDefaults(): SettingsState {
  const mobile = Settings.mobileCheck();
  return {
    antiDrag: 5,
    combat_key: "F5",
    displayFeedback: true,
    displayMobLoS: false,
    displayPlayerLoS: false,
    displayXpDrops: true,
    equipment_key: "F1",
    inputDelay: 0,
    inventory_key: "F4",
    loadout: "max_tbow_speed",
    lockPOV: false,
    maxUiScale: 1,
    menuVisible: !mobile,
    metronome: false,
    northPillar: true,
    onTask: false,
    player_stats: DeserializePlayerStats(null),
    playsAreaAudio: false,
    playsAudio: false,
    prayer_key: "F3",
    renderFps: 60,
    rotated: "south",
    smoothCacheAnimations: true,
    southPillar: true,
    spellbook_key: "F2",
    tile_markers: null,
    tileMarkerColor: "#FF0000",
    use3dView: true,
    westPillar: true,
    zoomScale: 1,
  };
}

// Legacy code. Should be removed in a few months - lets say after december 2026

function legacyBoolean(key: string, defaultValue: boolean) {
  const value = window.localStorage.getItem(key);
  return value === null ? defaultValue : value === "true";
}

const legacyStorage: SettingsStorage<SettingsState> = {
  load(defaults) {
    const menuVisible = window.localStorage.getItem("menuVisible");
    return {
      antiDrag: parseInt(window.localStorage.getItem("antiDrag") ?? "5"),
      combat_key: window.localStorage.getItem("combat_key") || defaults.combat_key,
      displayFeedback: window.localStorage.getItem("displayFeedback") !== "false",
      displayMobLoS: legacyBoolean("displayMobLoS", false),
      displayPlayerLoS: legacyBoolean("displayPlayerLoS", false),
      displayXpDrops: window.localStorage.getItem("displayXpDrops") !== "false",
      equipment_key: window.localStorage.getItem("equipment_key") || defaults.equipment_key,
      inputDelay: parseInt(window.localStorage.getItem("inputDelay") ?? "0"),
      inventory_key: window.localStorage.getItem("inventory_key") || defaults.inventory_key,
      loadout: window.localStorage.getItem("loadout") || defaults.loadout,
      lockPOV: false,
      maxUiScale: parseFloat(window.localStorage.getItem("maxUiScale")) || 1,
      menuVisible: menuVisible === "true" ? true : menuVisible === "false" ? false : defaults.menuVisible,
      metronome: legacyBoolean("metronome", false),
      northPillar: window.localStorage.getItem("northPillar") !== "false",
      onTask: legacyBoolean("onTask", false),
      player_stats: DeserializePlayerStats(window.localStorage.getItem("stats")),
      playsAreaAudio: legacyBoolean("playsAreaAudio", false),
      playsAudio: legacyBoolean("playsAudio", false),
      prayer_key: window.localStorage.getItem("prayer_key") || defaults.prayer_key,
      renderFps: parseInt(window.localStorage.getItem("renderFps") || "60", 10) || 60,
      rotated: window.localStorage.getItem("rotated") || defaults.rotated,
      smoothCacheAnimations: window.localStorage.getItem("smoothCacheAnimations") !== "false",
      southPillar: window.localStorage.getItem("southPillar") !== "false",
      spellbook_key: window.localStorage.getItem("spellbook_key") || defaults.spellbook_key,
      tile_markers: JSON.parse(window.localStorage.getItem("tile_markers")),
      tileMarkerColor: window.localStorage.getItem("tileMarkerColor") || defaults.tileMarkerColor,
      use3dView: window.localStorage.getItem("use3dView") !== "false",
      westPillar: window.localStorage.getItem("westPillar") !== "false",
      zoomScale: parseFloat(window.localStorage.getItem("zoomScale")) || 1,
    };
  },
  save() {
    // Legacy keys are read once and deliberately left untouched.
  },
};

const jsonStorage = createJsonSettingsStorage<SettingsState>(SETTINGS_STORAGE_KEY, 1);
const migratingStorage: SettingsStorage<SettingsState> = {
  load(defaults) {
    if (window.localStorage.getItem(SETTINGS_STORAGE_KEY) !== null) {
      return jsonStorage.load(defaults);
    }
    const migrated = legacyStorage.load(defaults);
    jsonStorage.save(migrated);
    return migrated;
  },
  save(settings) {
    jsonStorage.save(settings);
  },
};

const settingsStore = createSettingsStore({
  defaults: createDefaults,
  storage: migratingStorage,
});
