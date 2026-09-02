# Trainer UI standards

Trainer applications use React for their document shell and ordinary interface
elements. The game renderer continues to own the canvas and its existing
in-game UI. Migrating canvas UI to React is optional and should happen one
feature at a time.

## Packages

- `osrs-sdk` contains the game engine, `TrainerInstance`, settings stores, and
  other framework-independent APIs.
- `osrs-sdk-react` contains the React application shell, context, components,
  and hooks that integrate with `osrs-sdk`.
- `react` and `react-dom` are peer dependencies of `osrs-sdk-react`. Every
  trainer application installs compatible versions itself so its bundle has
  one React runtime.

During local development, a sibling trainer can build and link both packages:

```sh
npm --prefix ../osrs-sdk run build
npm link ../osrs-sdk ../osrs-sdk/packages/osrs-sdk-react
```

Published trainers should depend on published package versions instead of
committing local filesystem dependencies.

## Application shape

The entry point should only find the document root and render the trainer's
top-level component:

```tsx
const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(<MyTrainerApp />);
```

The top-level component owns construction of the region, settings, and
`TrainerInstance`. Create the trainer once with a lazy state initializer; a new
instance on every render would repeatedly initialise the game:

```tsx
function createTrainer() {
  Settings.readFromStorage();
  trainerSettings.load();
  return new TrainerInstance(new MyRegion(), { readyTimer: 6 });
}

export function MyTrainerApp() {
  const [trainer] = useState(createTrainer);
  const [loading, setLoading] = useState<TrainerLoadingState>();

  return (
    <TrainerApp trainer={trainer} onLoadingStateChange={setLoading}>
      <TrainerLoading state={loading} />
      <Sidebar />
    </TrainerApp>
  );
}
```

`TrainerApp` is the root layout and lifecycle boundary. It creates and mounts
the world canvas, loads assets, starts the trainer by default, provides the
trainer through React context, and disposes it on unmount. Its children are
ordinary DOM siblings rendered over or alongside the absolutely positioned
canvas. It is valid to render `TrainerApp` with no children.

## Layout and overlays

Keep the canvas inside the React-owned root. This gives the canvas, sidebar,
modals, loading state, and overlays one positioning context and one lifecycle.
Prefer normal CSS layout for sidebars and absolute positioning relative to the
root for overlays; do not calculate document coordinates manually when CSS can
express the relationship.

For a non-interactive overlay layer, use `pointer-events: none` and restore
`pointer-events: auto` only on interactive descendants. This prevents empty
overlay space from blocking canvas input. Use an explicit stacking order for
the canvas, overlays, sidebars, and modals.

Canvas backing dimensions can differ from its CSS dimensions. Any feature that
converts pointer or projected world positions must account for the canvas
bounding rectangle and scale. World-to-screen and picking capabilities should
be exposed through `TrainerInstance` APIs and React hooks; client UI should not
reach into renderer globals or private Three.js objects. Until such an API is
added, keep world-anchored UI in the existing renderer.

## React and game state

React is suitable for controls, inventory and equipment interfaces, drag
previews, sidebars, dialogs, menus, and other event-driven UI. Do not mirror the
entire game state into React on every render frame. The game loop remains the
authority for simulation and animation.

Use the narrowest synchronization mechanism that fits the state:

- Call methods on `TrainerInstance`, the region, or another game service for
  UI commands such as reset, changing a live encounter mechanic, or selecting
  a tile.
- Use `useTrainerContext()` when a descendant needs the owning
  `TrainerInstance` without prop drilling.
- Use `useTrainerSnapshot(selector)` for trainer state exposed by the instance.
  Subscribe to stable, meaningful state rather than frame-by-frame animation
  values.
- Use refs, CSS transforms, or a dedicated external store for visuals that
  genuinely need frame-rate updates. Keep those updates local rather than
  rerendering the complete application tree.

React event handlers may update the store and invoke a region method when a
setting has an immediate world-side effect. For example, changing a solar-flare
level persists the value and tells the region to rebuild the active flares.

## Settings

Shared SDK settings use `Settings` and `useSettingsSnapshot()`. Trainer-specific
settings should use `createSettingsStore()` and `useSettingsStore()` instead of
implementing another subscription system:

```tsx
type TrainerSettings = {
  showMarkers: boolean;
};

export const trainerSettings = createSettingsStore<TrainerSettings>({
  defaults: { showMarkers: false },
  storageKey: "my-trainer:settings",
  version: 1,
});

function MarkerToggle() {
  const settings = useSettingsStore(trainerSettings);
  return (
    <input
      type="checkbox"
      checked={settings.showMarkers}
      onChange={(event) => trainerSettings.set({ showMarkers: event.currentTarget.checked })}
    />
  );
}
```

Game code can read `trainerSettings.getSnapshot()` at a decision point. If the
world must react whenever a value changes independently of the UI command, use
`trainerSettings.watch()`, retain the returned unsubscribe function, and clean
it up with the owning object's lifecycle.

Persist related settings as one versioned JSON value. Use a trainer-specific
`SettingsStorage` adapter for one-time migration from legacy keys; migration
rules are application concerns and do not need to be generalized into the SDK.

## Ownership rules

- React owns document structure, interaction controls, accessibility, and
  transient interface state such as whether a modal is open.
- `TrainerInstance` owns one trainer's lifecycle and is the boundary through
  which reusable React UI should access the game.
- The region owns encounter rules and world mutations.
- Settings stores own persistent configuration and notifications.
- The renderer owns frame-rate drawing, camera state, and canvas-native game
  visuals.

Some engine internals are still legacy singletons, so only one active
`TrainerInstance` is currently supported on a page. New UI APIs should still be
instance-shaped so those internals can move behind `TrainerInstance` without
changing client components.
