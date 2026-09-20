# React UI migration TODO

Status: approved for implementation in `osrs-sdk` and its sample. Migration of
`ColosseumTrainer` is deliberately deferred until the SDK reference
implementation is complete.

## Goal

Move the SDK's screen-space game interface from canvas rendering to the
components in `@supalosa/osrs-react-ui`, while keeping simulation and
world-space rendering in `osrs-sdk`.

World-space visuals such as terrain, actors, projectiles, hitsplats, overhead
prayers, tile markers, and click markers should remain on the game canvas.
React should own screen-space interface chrome, panels, menus, tooltips, and
overlays.

The fidelity target is deliberately limited to the gameplay panels where
recognition, positioning, and interaction affect play:

- combat options;
- inventory;
- prayer book;
- worn equipment;
- spellbook.

The SDK settings tab is also required for migration parity, but it should
preserve the SDK's existing settings and custom-panel presentation rather than
emulate the live client's display-settings panel. The Stats tab is explicitly
out of scope for the initial migration.

Other tabs, including SDK settings, do not need to reproduce the current OSRS
client faithfully. They may use simpler SDK- or trainer-specific React content
inside the common panel shell.

## Package responsibilities

### `@supalosa/osrs-react-ui`

- Presentational, controlled OSRS components.
- Owns generic interface chrome and visual assets from its own resource pack.
- Must not depend on `osrs-sdk`.
- Tab-content components contain only their tab contents; containing layouts
  own backgrounds, borders, tabs, frames, and other chrome.

### `osrs-sdk`

- Owns simulation state, commands, timing, and world rendering.
- Exposes immutable UI-facing snapshots and instance-shaped commands.
- Supplies dynamic gameplay item icon URLs or descriptors.
- Resolves ordered actions for world and interface targets.

### `osrs-sdk-react`

- Subscribes React to SDK UI snapshots.
- Adapts SDK models to `@supalosa/osrs-react-ui` props.
- Composes the game canvas, OSRS layout, connected panels, blank minimap
  chrome/compass/resource orbs, and overlays.
- Keeps generic SDK-to-UI wiring out of individual trainer clients.
- Provides connected tab components for the five fidelity panels while
  allowing SDK and trainer clients to compose, replace, or add tabs explicitly
  in JSX.
- Provides the shared permanent/collapsible trainer sidebar, loadout manager,
  and advanced-settings UI because those are common to trainers rather than
  encounter-specific application features.

### Trainer clients

- Own encounter-specific settings, overlays, dialogs, branding, and links.
- Compose the connected resizable-modern interface and permanent SDK sidebar
  in their ordinary document layout.
- Must not duplicate generic inventory, equipment, prayer, combat, or minimap
  adapters.
- May register trainer-specific tab contents without changing the visual
  layout package or the SDK renderer.
- Own encounter-specific surfaces such as the wave-start modal.

## Panel customization model

The public API should use explicit JSX composition rather than requiring a
client to configure a monolithic game-client component or tab registry.
`osrs-sdk-react` may normalize these children into tab metadata internally,
but that registry is an implementation detail.

Decision: the SDK chooses every tab's exact slot. The visual React library
must render the supplied sparse positions without compacting them or assigning
game-specific defaults. Canonical ordering, unavailable-tab policy, and any
intentional rearrangement belong to `osrs-sdk-react` and the composing client.

Decision: the minimap map surface is out of scope for this migration. The
selected React layout renders its minimap frame, functional compass, and
connected resource orbs, but the central map area remains intentionally blank.
The SDK will not expose, render, or handle interaction with a minimap map image
in this pass because it does not provide value in the current trainer context.

The initial interface is resizable modern. Layout regions use compound child
components instead of `world`, `minimap`, and `sidePanel` props. The layout
does not search for or reorder arbitrary descendants: its region components
render directly and CSS places them in the correct layer. This preserves an
explicit low-level composition API without child-introspection machinery.

```tsx
<TrainerProvider trainer={trainer}>
  <div className="sample-app">
    <ResizableModernLayout>
      <ResizableModernLayout.World>
        <TrainerCanvas />
      </ResizableModernLayout.World>
      <ResizableModernLayout.Minimap>
        <ConnectedMinimap />
      </ResizableModernLayout.Minimap>
      <ResizableModernLayout.SidePanel>
        <ConnectedSidePanel defaultTab="inventory">
          <ConnectedCombatTab slot={0} />
          <ConnectedPrayerTab slot={2} />
          <ConnectedEquipmentTab slot={3} />
          <ConnectedInventoryTab slot={4} />
          <ConnectedSpellbookTab slot={5} />
          <ConnectedSettingsTab slot={12} />
        </ConnectedSidePanel>
      </ResizableModernLayout.SidePanel>
      <ResizableModernLayout.Overlay>
        <TrainerLoadingSplash />
        <PauseOverlay />
      </ResizableModernLayout.Overlay>
    </ResizableModernLayout>
    <CollapsibleTrainerSidebar>
      <LoadoutManager />
      <AdvancedSettings />
    </CollapsibleTrainerSidebar>
  </div>
</TrainerProvider>
```

- `TrainerProvider` remains the trainer context boundary.
- `TrainerCanvas` owns the renderer host: its sizing element, canvas, and
  mount/load/start/dispose lifecycle. It can also be rendered without an
  interface when a canvas-only host is useful.
- The OSRS layout wraps `TrainerCanvas` and allocates its world rectangle. In
  resizable modern this rectangle fills the layout beneath the chrome; a
  future fixed layout may allocate a distinct non-overlapping world region.
- The layout and visual side-panel components come from
  `@supalosa/osrs-react-ui`.
- Connected tab components come from `osrs-sdk-react`; each supplies its tab
  identity, standard icon, label, availability, hotkey behavior, connected
  content, and SDK commands.
- Each tab declaration also has a stable slot from `0` through `13`. Slots
  `0`-`6` form the first row and slots `7`-`13` form the second row. Standard
  connected tabs supply canonical defaults; callers may override `slot` when
  deliberately defining another arrangement.
- The visual tab model includes `slot: number` and `disabled?: boolean`; the UI
  package divides those explicit positions into two rows of seven.
- Missing slots remain empty rather than causing later icons to shift. Known
  but unsupported tabs may occupy their canonical slot in a disabled state.
- `@supalosa/osrs-react-ui` accepts sparse slot data and performs no compaction
  or canonical ordering of its own.
- `InterfaceTab` is the generic escape hatch for custom content such as SDK or
  trainer settings and requires an explicit slot unless it replaces a known
  standard tab.
- A trainer may reorder tabs, omit unused tabs, or add custom tabs directly in
  JSX.
- The five fidelity panels should normally use their shared connected tab
  components so gameplay behavior remains consistent.
- Only the active tab's content should be mounted. Inactive declarations may
  be inspected for metadata, but they must not create active subscriptions or
  hidden interactive DOM.
- The visual package remains unaware of SDK tab semantics; it renders the
  normalized tab metadata and selected tab's content.
- Layout and panel regions are composition boundaries. Trainer applications
  may add presentation such as panel-wide or inventory-slot overlays without
  replacing the connected SDK behavior. Extensions must not silently bypass
  the shared action, timing, or drag systems.

Most trainer applications should not have to restate the complete composition
above. `osrs-sdk-react` provides this connected default composition as
`TrainerUI`, supplying `TrainerCanvas`, the minimap, canonical tabs, and their
adapters. Ordinary `TrainerUI` children render in its top overlay layer across
the full interface area:

```tsx
<TrainerUI>
  <TrainerLoadingSplash />
  <PauseOverlay />
</TrainerUI>
```

The overlay covers the complete layout, including interface chrome in a future
fixed mode; it is not limited to the rendered canvas rectangle. Do not add a
named `Overlay` compound child merely to restate this default. A narrower API
such as `TrainerUI.CanvasOverlay` may be added later if a concrete use case
needs content clipped to or positioned against the world/canvas region. The
explicit low-level layout primitives remain available when a client genuinely
needs to replace the canonical composition.

`TrainerUI` is connected and derives interface scaling from the SDK settings
snapshot. It must not accept a separate `stretchPercent` or UI-scale prop that
could disagree with `Settings.controlPanelScale`. Adapt the stored scale to the
visual layout's scale representation in the SDK adapter; callers using the
low-level unconnected layout may still set its visual scaling directly.

The SDK settings tab should remain intentionally compact and similar in
structure to the current canvas panel. Its initial scope is:

- sound and area-sound volume/toggles;
- simulated ping/input delay;
- UI scale;
- key bindings and menu visibility only if still required by the selected
  client layout.

Preserve the existing division and location of SDK settings, including the
settings-tab button that expands or collapses the permanent trainer sidebar.
Use the custom panel previously established for the trainer; the
resource-pack-faithful `DisplaySettingsPanel` is not part of this migration.

## Interaction model: actions, hover text, and context menu

Hover text, default left-click behavior, and the context menu are one system.
They must be derived from the same ordered list of actions.

```ts
type ContextAction = Readonly<{
  id: string;
  label: readonly MultiColorTextBlock[];
  execute: () => void;
}>;

type PointerActions = Readonly<{
  actions: readonly ContextAction[];
  anchor: Readonly<{ x: number; y: number }>;
}>;
```

- The hover label displays `actions[0].label`.
- Default left-click executes the first action when the target supports a
  default action.
- Right-click opens a menu containing the same actions in the same order.
- `Choose Option` and `Cancel` are presentation-only context-menu rows and do
  not belong in `actions`.
- Moving to a new world entity, inventory item, equipment item, prayer, or
  spell replaces the pointer-action state.
- Leaving the target clears the pointer-action state unless an opened context
  menu has captured it.
- Executing an action closes the menu and refreshes the derived hover label.
- Existing `hoverAction()` implementations should eventually be removed.
  Targets should expose a single `contextActions()` result instead.

The React context menu must be viewport-clamped and retain the current
multi-color text behavior. This interaction system should be migrated as one
unit rather than as separate hover and context-menu features.

## Missing or incomplete UI components

### Required for the big-bang replacement

- [ ] Add a React context menu driven by ordered SDK actions.
- [ ] Add the hover-action label derived from the first ordered action.
- [ ] Connect default left-click to the same ordered action list.
- [ ] Add the connected default composition for `TrainerCanvas`, the
      resizable-modern layout, blank minimap chrome/compass/orbs, tabs, active
      panel, and overlays.
- [ ] Add immutable, reactive SDK UI snapshots for gameplay state.
- [ ] Remove legacy canvas UI drawing and UI-region hit testing while
      preserving world input. There is no legacy/React mode switch.

### Existing components requiring behavioral parity

#### Inventory

- [ ] Connect item left-click actions through SDK commands and input timing.
- [ ] Connect the shared action/context-menu system.
- [ ] Preserve item selection and selected-item highlighting.
- [ ] Mirror RuneLite Anti Drag rather than the current React or trainer drag
      behavior: a drag starts only after both the configured client-tick delay
      has elapsed and pointer movement leaves the drag dead-zone. Preserve the
      client default of five 20 ms client ticks when anti-drag is inactive;
      default the RuneLite-style override to one 600 ms game tick while Shift
      is held; support the optional Control-key bypass; and reset held-key
      state and the delay to the client default on focus loss.
- [ ] Preserve optimistic drag reordering while the authoritative swap waits
      for its world tick.
- [ ] Expose stack or quantity data where item models support it.

#### Equipment

- [ ] Add the missing weight display to the React component.
- [ ] Connect unequip actions through SDK commands.
- [ ] Connect the shared action/context-menu system.
- [ ] Define or disable equipment stats, guide prices, items-kept-on-death,
      and call-follower actions.
- [ ] Map SDK equipment slot names to React UI slot names in one adapter.

#### Prayer book

- [ ] Preserve the distinction between client-tick lit state and server-tick
      active state.
- [ ] Connect quick prayers to the minimap prayer orb.
- [ ] Add prayer-filter behavior if it remains part of the supported client.
- [ ] Derive hover/default/context actions from the shared action list.

#### Spellbook

- [ ] Map SDK spells to React spell definitions.
- [ ] Preserve manual-cast selection and selected-spell state.
- [ ] Derive hover/default/context actions from the shared action list.
- [ ] Complete ancient-spellbook parity before wiring currently unused books.

#### Combat options

- [ ] Map weapon name, combat level, available styles, style icons, selected
      style, auto-retaliate, special-attack availability, state, and energy.
- [ ] Route actions through SDK commands so world-tick/input-delay behavior is
      retained.

#### Settings

- [ ] Add the SDK custom settings panel connected to the SDK settings store.
- [ ] Preserve the current settings, their existing division between the tab
      and advanced settings, and the control that expands/collapses the
      permanent trainer sidebar.
- [ ] Do not use the faithful OSRS `DisplaySettingsPanel` for the trainer.
- [ ] Replace canvas key-binding capture with an accessible React flow.

#### Tabs and layouts

- [ ] Add disabled/unavailable tab support.
- [ ] Change `@supalosa/osrs-react-ui` side panels to accept sparse stable
      slots and remove compacting behavior.
- [ ] Add hotkey-driven tab selection.
- [ ] Treat mobile UI as a non-goal for the first pass. Avoid accidental
      breakage where practical, but do not compromise the desktop interface or
      add a separate mobile layout.
- [ ] Remove `fixed-classic` from the advertised `InterfaceMode` until an
      implementation exists.
- [ ] Use resizable modern as the SDK and sample migration target.

### Screen-space UI deliberately retained on the canvas

- [ ] Retain the boss health bar.
- [ ] Retain XP drops and the XP toggle.
- [ ] Retain the boosted-stat panel.
- [ ] Retain the `GET READY` countdown.
- [ ] Inventory other feedback or status overlays individually rather than
      assuming every screen-space drawing must move to React.

These retained drawings do not constitute a parallel legacy UI mode. They are
non-DOM renderer features that remain on the canvas while the interactive
control panel, tabs, minimap chrome/orbs, hover actions, and context menu move
to React.

Chat, quests, friends, clan, account, emotes, and music are currently absent
or placeholders in the SDK. They should remain disabled placeholders unless
real behavior is deliberately added; they do not block migration of existing
functionality.

The Stats tab is also deliberately out of scope for initial parity.

## SDK UI state and command bridge

The current `TrainerInstance` snapshot is insufficient for React gameplay UI:
it exposes mutable `Player` and `World` references and is normally notified
only for lifecycle and settings changes.

- [ ] Introduce a dedicated immutable `TrainerUiSnapshot` or equivalent
      instance-owned UI store.
- [ ] Copy UI-relevant primitive values and arrays into snapshots instead of
      relying on mutations to existing object references.
- [ ] Expose `subscribe` and `getSnapshot` methods compatible with
      `useSyncExternalStore`.
- [ ] Mark UI state dirty when relevant simulation state changes.
- [ ] Coalesce notifications so React does not render once for every mutation.
- [ ] Publish after relevant world ticks, relevant client-tick actions,
      resets, and immediate UI-only changes.
- [ ] Do not publish animation-frame state through the main React tree.

The UI snapshot is expected to include at least:

- active interface tab;
- base and current player stats;
- inventory item descriptors;
- equipment item descriptors and weight;
- active and client-lit prayers;
- selected spell;
- weapon/combat-style state;
- auto-retaliate and special-attack state;
- run energy and run state;
- resource values, orb state, and compass rotation used by the blank minimap
  chrome;
- ordered pointer actions and context-menu open state;
- boss health and ready-countdown state where applicable.

Add instance-shaped commands instead of asking React components to mutate
`Player`, `ControlPanelController`, or other legacy singletons directly. The
command surface should cover:

- tab selection;
- inventory activation and movement;
- equipment activation/unequip;
- prayer and quick-prayer toggles;
- spell selection;
- combat style, auto-retaliate, and special-attack toggles;
- run toggle and compass reset;
- context-action execution;
- settings updates.

Commands must continue to use `InputController` where the current interaction
is delayed to a client or world tick.

## Canvas migration boundary

- [ ] Remove canvas drawing of the control panel and tabs in the same migration
      that connects their React replacements.
- [ ] Remove canvas minimap chrome and resource-orb drawing when the connected
      React minimap is added.
- [ ] Do not migrate the canvas minimap map image or map interactions; leave
      the React minimap's central content area blank while retaining compass
      rotation and click-to-reset behavior.
- [ ] Remove canvas context-menu and hover-label drawing when the shared React
      action system is connected.
- [ ] Retain canvas boss health, XP drops, boosts, and ready-countdown drawing
      in this migration.
- [ ] Remove canvas control-panel/minimap pointer interception.
- [ ] Preserve world picking, camera controls, tile actions, click animations,
      and other world-space behavior.

This is a big-bang migration. Do not add or retain parallel legacy and React
UI modes. Initial parity requires wired combat options, inventory, equipment,
prayer, spellbook, and SDK settings tabs. The Stats tab is not a parity gate.
Do not change the SDK major version for this UI work; the surrounding renderer
rewrite already constitutes the project's broader breaking generation.

## `osrs-sdk-react` application shell

Refactor canvas lifecycle away from the current fixed `TrainerApp` document
layout:

- [ ] Keep `TrainerProvider` as the context boundary.
- [ ] Extract `TrainerCanvas`, owning the renderer sizing element, canvas,
      mount/load/start/dispose lifecycle, and resize target.
- [ ] Remove the fixed `TrainerApp` composition rather than retain a legacy
      compatibility wrapper.
- [ ] Add `TrainerUI` as the connected default composition for the common
      interface while keeping the same low-level compound components available
      for explicit composition.
- [ ] Add connected adapters for inventory, equipment, prayer, spellbook,
      combat options, settings, minimap compass/resource orbs, and overlays.
- [ ] Add declarative connected tab components plus a generic `InterfaceTab`
      for custom tab contents.
- [ ] Render ordinary `TrainerUI` children as overlays across its complete
      interface area. Defer narrower canvas- or panel-specific extension
      regions until a concrete use case requires them.
- [ ] Migrate duplicate visual primitives in `osrs-sdk-react` to
      `@supalosa/osrs-react-ui`, then deprecate or re-export the canonical
      implementations.
- [ ] Remove `GameOverlay` and `GameOverlayProvider`; render game-scoped
      transient UI in the layout's ordinary overlay region and use `Modal`
      for application-wide modal stacking.
- [ ] Do not add a named SDK outer-layout component. Each trainer's ordinary
      application CSS composes the OSRS layout and permanent SDK sidebar.

Proposed composition:

```text
TrainerProvider
├── TrainerUI
│   └── ResizableModernLayout
│       ├── World
│       │   └── TrainerCanvas
│       │       ├── BossHealthBar
│       │       ├── XpDrops
│       │       ├── BoostedStats
│       │       └── ReadyCountdown
│       ├── Minimap
│       │   └── ConnectedMinimap
│       ├── SidePanel
│       │   └── Connected active-tab content
│       └── Overlay
│           ├── ActionContextMenu
│           ├── HoverAction
│           └── TrainerUI children
└── CollapsibleTrainerSidebar
    ├── LoadoutManager
    └── AdvancedSettings
```

## Inventory and equipment item icons

Trainer clients should not import or map item icons themselves.

During migration, `osrs-sdk-react` can translate the SDK's existing
`item.inventorySprite` image into the `ReactNode` accepted by the UI package:

```tsx
const image = item.inventorySprite;

const uiItem = {
  id: item.serialNumber,
  name: String(item.itemName),
  sprite: (
    <img
      src={image.currentSrc || image.src}
      width={image.naturalWidth}
      height={image.naturalHeight}
      draggable={false}
    />
  ),
};
```

This reuses the exact current item image, including dose-dependent potion
sprites. It does not copy SDK interface chrome into the UI package: generic UI
chrome remains owned by `@supalosa/osrs-react-ui`, while gameplay item artwork
is supplied by the SDK.

- [ ] Add an SDK-neutral item-icon descriptor containing `src`, width, and
      height.
- [ ] Remove `inventorySprite` once React item descriptors replace its remaining
      UI uses; world rendering must not depend on this screen-space image.
- [ ] Add optional quantity/stack information to the UI item descriptor.
- [ ] Use an item's serial number as the inventory-instance identity.
- [ ] Centralize the SDK-to-React equipment slot-name mapping.
- [ ] Verify that item icons resolve from production SDK bundles and from local
      linked builds.

## Webpack and deployment

Webpack does not need to be replaced. The sample and eventual trainer client
configurations already handle TypeScript, JSX, ESM dependencies, and imported
image assets. They do not currently process CSS imports.

Recommended initial deployment approach:

- [ ] Add an exact dependency on `@supalosa/osrs-react-ui`.
- [ ] Add `style-loader` and `css-loader` to trainer development dependencies.
- [ ] Add a `test: /\.css$/i` webpack rule using `style-loader` and
      `css-loader`.
- [ ] Import `@supalosa/osrs-react-ui/styles.css` once from the application
      entry point.
- [ ] Confirm that only one React runtime is bundled.

The UI package's current production stylesheet embeds its fonts and visual
assets as data URLs, so it does not require new `CopyPlugin` rules. Injecting
the stylesheet through `main.js` also avoids adding a new link to each copied
HTML entry point.

Later, `mini-css-extract-plugin` may be used for separate stylesheet caching,
but it is not required for the first migration and would add another emitted
deployment artifact.

Deployment remains the trainer's complete `dist` directory:

- `main.js`, including the injected UI CSS;
- copied HTML entry points and manifest;
- `osrs-assets` cache-render manifest and payloads;
- existing SDK-imported image/audio bundles where still required.

Development and beta workflows also need updates:

- [ ] Extend the local link command to build/link the UI package.
- [ ] Make beta builds install an exact published UI version or a packed
      sibling UI tarball.
- [ ] Include the UI package version in build diagnostics.

## Deferred `ColosseumTrainer` changes

`ColosseumTrainer` is already React-based, so it should not require a rewrite.
Most migration work belongs in `osrs-sdk`, `osrs-sdk-react`, and the SDK sample.
Do not change `ColosseumTrainer` as part of the initial migration. Revisit these
items after the SDK sample is the working reference implementation.

- [ ] Replace the current `TrainerApp` composition with the connected default
      interface and permanent SDK sidebar composition.
- [ ] Keep `WaveStartModal`, boss/wave-specific settings, loadout selection,
      credits, branding, and external links in the trainer.
- [ ] Pass trainer-specific controls through an auxiliary-panel or overlay
      slot.
- [ ] Replace calls to `ControlPanelController.setActiveControl()` with the new
      instance-shaped UI command.
- [ ] Reuse the shared SDK `LoadoutManager` and `AdvancedSettings` components.
- [ ] Scope or remove the global HTML button styles so they do not override the
      OSRS React UI.
- [ ] Remove redundant remote font declarations after all consumers use the
      packaged UI fonts.

## Rollout phases

### Phase 1: integration foundation

- [ ] Add the UI snapshot/store and command facade.
- [ ] Add `TrainerCanvas`, compound layout regions, and the connected default
      interface composition.
- [ ] Add package and webpack CSS integration.

### Phase 2: core side panel

- [ ] Connect inventory, equipment, prayer, spellbook, combat, and settings.
- [ ] Connect tabs and hotkeys.
- [ ] Connect dynamic item icons.
- [ ] Verify input timing and optimistic interaction behavior.

### Phase 3: unified action system and minimap chrome

- [ ] Migrate action resolution, hover label, default click, and context menu
      together.
- [ ] Support world, inventory, equipment, prayer, and spell targets.
- [ ] Connect the existing React minimap frame, functional compass, and
      resource orbs with a blank central map area.
- [ ] Remove canvas panel/minimap drawing and interception.

### Phase 4: remaining overlays

- [ ] Verify that retained canvas boss health, XP drops, boosted stats, and
      ready countdown remain correctly positioned beneath the React interface.
- [ ] Verify their canvas rendering uses the world rectangle allocated by the
      selected layout rather than the complete application width.

### Phase 5: client adoption and cleanup

- [ ] Migrate the SDK sample first so it becomes the reference trainer
      template.
- [ ] Verify the six in-scope tabs and shared interactions in the SDK sample.
- [ ] Remove the remaining legacy canvas UI code once the sample reaches
      parity.
- [ ] Plan `ColosseumTrainer` adoption as a separate follow-up.

## Acceptance criteria

- [ ] UI chrome is not copied or derived from `osrs-sdk` assets.
- [ ] Inventory and equipment icons update when equipment changes, consumables
      change state, or items move.
- [ ] Hover text, default left-click, and context-menu ordering always derive
      from the same action list.
- [ ] Input delay, prayer client ticks, equipment swaps, combat styles, and
      special attacks retain existing timing.
- [ ] Context menus work over world, inventory, equipment, prayer, and spell
      targets and remain within the viewport.
- [ ] Canvas world picking remains correct under every supported layout and UI
      scale.
- [ ] Trainer clients contain no generic OSRS panel adapters.
- [ ] Production asset URLs work for published packages and local linked
      builds.
- [ ] Production deployment remains a static `dist` deployment.

## Settled disabled-tab treatment

- [ ] Add `disabled?: boolean` to the `@supalosa/osrs-react-ui` tab model and
      render disabled tabs as native disabled buttons.
- [ ] Apply CSS `filter: grayscale(1)` to the complete disabled tab button so
      both its background sprite and nested icon become grayscale together.
- [ ] Retain canonical icons for known unsupported tabs, including Stats, but
      prevent selection and expose the disabled state to assistive technology.
