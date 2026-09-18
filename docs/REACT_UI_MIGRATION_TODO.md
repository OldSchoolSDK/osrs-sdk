# React UI migration TODO

Status: planning only. Do not begin the migration until this plan is approved.

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

### Trainer clients

- Own encounter-specific settings, overlays, dialogs, branding, and links.
- Select an interface mode and provide optional application-specific slots.
- Must not duplicate generic inventory, equipment, prayer, combat, or minimap
  adapters.
- May register trainer-specific tab contents without changing the visual
  layout package or the SDK renderer.

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

```tsx
<TrainerRoot trainer={trainer}>
  <ResizableClassicLayout
    world={<TrainerViewport />}
    minimap={<ConnectedClassicMinimap />}
    sidePanel={
      <ConnectedClassicSidePanel defaultTab="inventory">
        <ConnectedCombatTab />
        <ConnectedInventoryTab />
        <ConnectedPrayerTab />
        <ConnectedEquipmentTab />
        <ConnectedSpellbookTab />
        <InterfaceTab id="settings" icon={settingsIcon} label="Settings">
          <SdkSettingsPanel />
        </InterfaceTab>
      </ConnectedClassicSidePanel>
    }
  />
</TrainerRoot>
```

- `TrainerRoot` owns trainer context and lifecycle but does not prescribe a
  visual layout.
- `TrainerViewport` owns and mounts the world canvas in the layout's `world`
  slot.
- The layout and visual side-panel components come from
  `@supalosa/osrs-react-ui`.
- Connected tab components come from `osrs-sdk-react`; each supplies its tab
  identity, standard icon, label, availability, hotkey behavior, connected
  content, and SDK commands.
- Each tab declaration also has a stable slot from `0` through `13`. Slots
  `0`-`6` form the first row and slots `7`-`13` form the second row. Standard
  connected tabs supply canonical defaults; callers may override `slot` when
  deliberately defining another arrangement.
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

The SDK settings tab should remain intentionally compact and similar in
structure to the current canvas panel. Its initial scope is:

- sound and area-sound volume/toggles;
- simulated ping/input delay;
- UI scale;
- key bindings and menu visibility only if still required by the selected
  client layout.

It should be composed from reusable UI primitives, but it does not need to use
or emulate the resource-pack-faithful `DisplaySettingsPanel`.

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

### Required before disabling legacy canvas UI

- [ ] Add a React context menu driven by ordered SDK actions.
- [ ] Add the hover-action label derived from the first ordered action.
- [ ] Connect default left-click to the same ordered action list.
- [ ] Add an SDK-connected game-client shell that composes the world canvas,
      selected layout, blank minimap chrome/compass/orbs, tabs, active panel,
      and overlays.
- [ ] Add immutable, reactive SDK UI snapshots for gameplay state.
- [ ] Add an explicit React UI mode that disables legacy canvas UI drawing and
      UI-region hit testing while preserving world input.

### Existing components requiring behavioral parity

#### Inventory

- [ ] Connect item left-click actions through SDK commands and input timing.
- [ ] Connect the shared action/context-menu system.
- [ ] Preserve item selection and selected-item highlighting.
- [ ] Decide whether to preserve anti-drag timing exactly.
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

- [ ] Add a compact SDK settings panel connected to the SDK settings store.
- [ ] Preserve the current panel's essential structure: sound/area sound,
      simulated ping/input delay, and UI scale.
- [ ] Decide whether metronome, hotkeys, and menu visibility remain in this
      panel or move to advanced trainer settings.
- [ ] Do not treat faithful OSRS display-settings emulation as a migration
      requirement.
- [ ] Replace canvas key-binding capture with an accessible React flow.

#### Tabs and layouts

- [ ] Add disabled/unavailable tab support.
- [ ] Change `@supalosa/osrs-react-ui` side panels to accept sparse stable
      slots and remove compacting behavior.
- [ ] Add hotkey-driven tab selection.
- [ ] Define mobile behavior.
- [ ] Implement `fixed-classic` or remove it from the advertised
      `InterfaceMode` until it exists.
- [ ] Decide which resizable layout becomes the initial migration target.

### Remaining canvas-rendered screen-space UI

- [ ] Boss health bar.
- [ ] XP drops and XP toggle.
- [ ] Boosted-stat panel.
- [ ] `GET READY` countdown.
- [ ] Any feedback or status overlays that are not world-anchored.

Chat, quests, friends, clan, account, emotes, and music are currently absent
or placeholders in the SDK. They should remain disabled placeholders unless
real behavior is deliberately added; they do not block migration of existing
functionality.

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

- [ ] Add a mode such as `"legacy-canvas" | "react"` to the viewport or
      trainer instance.
- [ ] In React mode, stop drawing the control panel and tabs.
- [ ] Stop drawing minimap chrome and resource orbs after the React minimap is
      connected.
- [ ] Do not migrate the canvas minimap map image or map interactions; leave
      the React minimap's central content area blank while retaining compass
      rotation and click-to-reset behavior.
- [ ] Stop drawing context menus and hover labels after the shared React action
      system is connected.
- [ ] Stop drawing boss health, XP drops, boosts, and the ready countdown only
      after their React replacements exist.
- [ ] Stop canvas control-panel/minimap pointer interception in React mode.
- [ ] Preserve world picking, camera controls, tile actions, click animations,
      and other world-space behavior.
- [ ] Retain legacy mode until supported clients pass parity checks.

## `osrs-sdk-react` application shell

Refactor canvas lifecycle away from the current fixed `TrainerApp` document
layout:

- [ ] Keep `TrainerProvider` as the context boundary.
- [ ] Extract `TrainerViewport`, owning the playable-area element, canvas,
      mount/load/start/dispose lifecycle, and resize target.
- [ ] Keep `TrainerApp` as a backward-compatible wrapper for existing clients.
- [ ] Add an optional convenience `OsrsGameClient` preset only if repeated
      client composition proves valuable; it must be implemented using the
      same public compositional components.
- [ ] Add connected adapters for inventory, equipment, prayer, spellbook,
      combat options, settings, minimap compass/resource orbs, and overlays.
- [ ] Add declarative connected tab components plus a generic `InterfaceTab`
      for custom tab contents.
- [ ] Accept slots for trainer-specific overlays and auxiliary controls.
- [ ] Migrate duplicate visual primitives in `osrs-sdk-react` to
      `@supalosa/osrs-react-ui`, then deprecate or re-export the canonical
      implementations.

Proposed composition:

```text
OsrsGameClient
└── ResizableModernLayout / ResizableClassicLayout
    ├── world: TrainerViewport
    ├── minimap: ConnectedMinimap
    ├── sidePanel: ConnectedSidePanel
    │   └── Connected active-tab content
    └── overlays
        ├── ActionContextMenu
        ├── HoverAction
        ├── BossHealthBar
        ├── XpDrops
        └── ReadyCountdown
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
- [ ] Retain `inventorySprite` only for legacy canvas rendering during the
      transition.
- [ ] Add optional quantity/stack information to the UI item descriptor.
- [ ] Use an item's serial number as the inventory-instance identity.
- [ ] Centralize the SDK-to-React equipment slot-name mapping.
- [ ] Verify that item icons resolve from production SDK bundles and from local
      linked builds.

## Webpack and deployment

Webpack does not need to be replaced. The trainer's existing configuration
already handles TypeScript, JSX, ESM dependencies, and imported image assets.
It does not currently process CSS imports.

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

## Expected trainer-client changes

`ColosseumTrainer` is already React-based, so it should not require a rewrite.
Most migration work belongs in `osrs-sdk` and `osrs-sdk-react`.

- [ ] Replace the current `TrainerApp` plus `DefaultSidebar` composition with
      `OsrsGameClient`.
- [ ] Keep `WaveStartModal`, boss/wave-specific settings, loadout selection,
      credits, branding, and external links in the trainer.
- [ ] Pass trainer-specific controls through an auxiliary-panel or overlay
      slot.
- [ ] Replace calls to `ControlPanelController.setActiveControl()` with the new
      instance-shaped UI command.
- [ ] Keep `LoadoutManager` initially and migrate its visuals separately.
- [ ] Scope or remove the global HTML button styles so they do not override the
      OSRS React UI.
- [ ] Remove redundant remote font declarations after all consumers use the
      packaged UI fonts.

## Rollout phases

### Phase 1: integration foundation

- [ ] Add the UI snapshot/store and command facade.
- [ ] Add `TrainerViewport` and `OsrsGameClient`.
- [ ] Add React/legacy UI mode without removing legacy behavior.
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
- [ ] Disable canvas panel/minimap drawing and interception in React mode.

### Phase 4: remaining overlays

- [ ] Migrate boss health, XP drops, boosted stats, and ready countdown.
- [ ] Remove their canvas drawing paths only after parity is demonstrated.

### Phase 5: client adoption and cleanup

- [ ] Migrate the SDK sample first so it becomes the reference trainer
      template.
- [ ] Migrate `ColosseumTrainer`.
- [ ] Compare legacy and React modes in visual and interaction harnesses.
- [ ] Make React mode the default after parity.
- [ ] Remove legacy canvas UI after all supported clients have migrated.

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

## Open decisions

- [ ] Choose the first supported interface mode: resizable modern or
      resizable classic.
- [ ] Decide whether fixed classic is in the initial migration scope.
- [ ] Decide whether legacy anti-drag timing is desirable in the DOM UI.
- [ ] Decide whether trainer-specific auxiliary controls live beside the OSRS
      layout, inside a modal, or in a dedicated settings surface.
- [ ] Decide whether metronome, hotkeys, and menu visibility belong in the
      compact SDK settings tab or the existing advanced-settings UI.
- [ ] Define the legacy canvas UI removal/versioning policy.
