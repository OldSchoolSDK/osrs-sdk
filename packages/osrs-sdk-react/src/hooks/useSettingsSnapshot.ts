import { useSyncExternalStore } from "react";
import { Settings, SettingsSnapshot } from "osrs-sdk";

export function useSettingsSnapshot<T = SettingsSnapshot>(
  selector: (snapshot: SettingsSnapshot) => T = (snapshot) => snapshot as T,
) {
  const snapshot = useSyncExternalStore(Settings.subscribe, Settings.getSnapshot, Settings.getSnapshot);
  return selector(snapshot);
}
