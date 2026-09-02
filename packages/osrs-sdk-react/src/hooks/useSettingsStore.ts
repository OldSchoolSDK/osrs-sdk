import { useSyncExternalStore } from "react";
import { SettingsStore } from "osrs-sdk";

export function useSettingsStore<T extends object>(store: SettingsStore<T>) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
