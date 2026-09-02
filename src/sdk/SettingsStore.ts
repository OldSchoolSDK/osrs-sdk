export type SettingsSnapshotOf<T extends object> = Readonly<T>;

export interface SettingsStorage<T extends object> {
  load(defaults: T): T;
  save(settings: SettingsSnapshotOf<T>): void;
}

export type SettingsStoreOptions<T extends object> = {
  defaults: T | (() => T);
  storage?: SettingsStorage<T>;
  storageKey?: string;
  version?: number;
  migrate?: (stored: unknown, storedVersion: number) => Partial<T>;
};

export type SettingsWatchOptions = {
  runImmediately?: boolean;
};

export class SettingsStore<T extends object> {
  private readonly defaults: T | (() => T);
  private readonly storage?: SettingsStorage<T>;
  private listeners = new Set<() => void>();
  private snapshot: SettingsSnapshotOf<T>;

  constructor(options: SettingsStoreOptions<T>) {
    this.defaults = options.defaults;
    this.storage = options.storage ?? (
      options.storageKey
        ? createJsonSettingsStorage<T>(options.storageKey, options.version, options.migrate)
        : undefined
    );
    this.snapshot = this.freeze(this.createDefaults());
  }

  getSnapshot = (): SettingsSnapshotOf<T> => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  load() {
    const defaults = this.createDefaults();
    this.replace(this.storage?.load(defaults) ?? defaults, false);
    return this.snapshot;
  }

  set(patch: Partial<T>, persist = true) {
    this.replace({ ...this.snapshot, ...patch } as T, persist);
    return this.snapshot;
  }

  update(updater: (settings: SettingsSnapshotOf<T>) => Partial<T>, persist = true) {
    return this.set(updater(this.snapshot), persist);
  }

  replace(settings: T, persist = true) {
    this.snapshot = this.freeze(settings);
    if (persist) this.storage?.save(this.snapshot);
    this.listeners.forEach((listener) => listener());
    return this.snapshot;
  }

  reset() {
    return this.replace(this.createDefaults());
  }

  /**
   * Watches a selected part of the settings and invokes the listener only when
   * that value changes. This is intended for game-side reactions outside
   * React; dispose the returned subscription when its owning object is reset.
   */
  watch<S>(
    selector: (settings: SettingsSnapshotOf<T>) => S,
    listener: (selected: S, previous: S) => void,
    options: SettingsWatchOptions = {},
  ) {
    let previous = selector(this.snapshot);
    if (options.runImmediately) listener(previous, previous);
    return this.subscribe(() => {
      const selected = selector(this.snapshot);
      if (Object.is(selected, previous)) return;
      const oldValue = previous;
      previous = selected;
      listener(selected, oldValue);
    });
  }

  private createDefaults() {
    const defaults = typeof this.defaults === "function"
      ? (this.defaults as () => T)()
      : this.defaults;
    return { ...defaults };
  }

  private freeze(settings: T) {
    return Object.freeze({ ...settings }) as SettingsSnapshotOf<T>;
  }
}

type StoredSettings = {
  values: unknown;
  version: number;
};

export function createJsonSettingsStorage<T extends object>(
  storageKey: string,
  version = 1,
  migrate?: (stored: unknown, storedVersion: number) => Partial<T>,
): SettingsStorage<T> {
  return {
    load(defaults) {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return { ...defaults };

      try {
        const parsed = JSON.parse(raw) as StoredSettings | Partial<T>;
        const isEnvelope = parsed
          && typeof parsed === "object"
          && "values" in parsed
          && "version" in parsed;
        const storedVersion = isEnvelope ? Number((parsed as StoredSettings).version) : 0;
        const stored = isEnvelope ? (parsed as StoredSettings).values : parsed;
        const values = migrate ? migrate(stored, storedVersion) : stored;
        if (!values || typeof values !== "object") return { ...defaults };
        return { ...defaults, ...values } as T;
      } catch {
        return { ...defaults };
      }
    },
    save(settings) {
      window.localStorage.setItem(storageKey, JSON.stringify({ version, values: settings }));
    },
  };
}

export function createSettingsStore<T extends object>(options: SettingsStoreOptions<T>) {
  return new SettingsStore(options);
}
