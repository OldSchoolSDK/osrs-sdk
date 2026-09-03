import React, { useState } from "react";
import {
  ControlPanelController,
  CACHE_ASSETS,
  Region,
  Settings,
  TileMarker,
  TrainerInstance,
  TrainerLoadingState,
} from "../src";
import type { Loadout as LoadoutData } from "../src";
import {
  DefaultSidebar,
  GameOverlay,
  LoadoutManager,
  TrainerApp,
  TrainerLoadingSplash,
  useSettingsSnapshot,
  useTrainerContext,
} from "osrs-sdk-react";
import { configureSampleCacheRenderer } from "./cache-render";
import { SampleRegion } from "./SampleRegion";

const sampleInventory = [
  CACHE_ASSETS.items.saradominBrew.id,
  CACHE_ASSETS.items.superCombatPotion.id,
  CACHE_ASSETS.items.bastionPotion.id,
  CACHE_ASSETS.items.superRestore.id,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
];

const loadoutTemplates: LoadoutData[] = [
  {
    name: "Melee",
    equipment: {
      weapon: CACHE_ASSETS.items.scytheOfVitur.id,
      offhand: null,
      helmet: CACHE_ASSETS.items.torvaFullHelm.id,
      necklace: CACHE_ASSETS.items.amuletOfRancour.id,
      chest: CACHE_ASSETS.items.oathplateChest.id,
      legs: CACHE_ASSETS.items.oathplateLegs.id,
      feet: CACHE_ASSETS.items.avernicTreadsMax.id,
      gloves: CACHE_ASSETS.items.ferociousGloves.id,
      ring: CACHE_ASSETS.items.ultorRing.id,
      cape: CACHE_ASSETS.items.infernalCape.id,
      ammo: CACHE_ASSETS.items.dragonArrows.id,
    },
    inventory: sampleInventory,
  },
  {
    name: "Ranged",
    equipment: {
      weapon: CACHE_ASSETS.items.twistedBow.id,
      offhand: null,
      helmet: CACHE_ASSETS.items.masoriMaskF.id,
      necklace: CACHE_ASSETS.items.necklaceOfAnguish.id,
      chest: CACHE_ASSETS.items.masoriBodyF.id,
      legs: CACHE_ASSETS.items.masoriChapsF.id,
      feet: CACHE_ASSETS.items.pegasianBoots.id,
      gloves: CACHE_ASSETS.items.zaryteVambraces.id,
      ring: CACHE_ASSETS.items.ringOfEndurance.id,
      cape: CACHE_ASSETS.items.dizanasQuiver.id,
      ammo: CACHE_ASSETS.items.dragonArrows.id,
    },
    inventory: sampleInventory,
  },
  {
    name: "Full Crystal",
    equipment: {
      weapon: CACHE_ASSETS.items.bowOfFaerdhinen.id,
      offhand: null,
      helmet: CACHE_ASSETS.items.crystalHelm.id,
      necklace: CACHE_ASSETS.items.necklaceOfAnguish.id,
      chest: CACHE_ASSETS.items.crystalBody.id,
      legs: CACHE_ASSETS.items.crystalLegs.id,
      feet: CACHE_ASSETS.items.pegasianBoots.id,
      gloves: CACHE_ASSETS.items.zaryteVambraces.id,
      ring: CACHE_ASSETS.items.ringOfEndurance.id,
      cape: CACHE_ASSETS.items.dizanasQuiver.id,
      ammo: CACHE_ASSETS.items.dragonArrows.id,
    },
    inventory: sampleInventory,
  },
];

function createTrainer() {
  configureSampleCacheRenderer();
  Settings.readFromStorage();
  const regions: Record<string, Region> = {
    "index.html": new SampleRegion(loadoutTemplates),
  };
  const regionName = window.location.pathname.split("/").pop() ?? "index.html";
  const region = regions[regionName] ?? regions["index.html"];
  return new TrainerInstance(region, { readyTimer: 6 });
}

function SampleSidebarContents({ onLoadoutToggle }: { onLoadoutToggle: () => void }) {
  const trainer = useTrainerContext();
  const settings = useSettingsSnapshot();

  return (
    <>
      <button type="button" onClick={() => trainer.reset()}>Reset</button>
      <button type="button" onClick={() => ControlPanelController.controller.setActiveControl("SETTINGS")}>Settings</button>
      <button type="button" onClick={onLoadoutToggle}>Loadout</button>
      <hr />
      <span>More settings:</span>
      <div>
        <input
          id="tileMarkerColor"
          type="color"
          value={settings.tileMarkerColor}
          onChange={(event) => {
            Settings.set({ tileMarkerColor: event.currentTarget.value });
            TileMarker.onSetColor(event.currentTarget.value);
          }}
        />
        <label htmlFor="tileMarkerColor">Tile Markers</label>
      </div>
      <div style={{ paddingBottom: 10, paddingTop: 10, textAlign: "center", width: "100%" }}>
        <div id="gpu_warning" />
      </div>
    </>
  );
}

export function SampleApp() {
  const [trainer] = useState(createTrainer);
  const [loading, setLoading] = useState<TrainerLoadingState>();
  const [loadoutOpen, setLoadoutOpen] = useState(false);

  return (
    <TrainerApp
      trainer={trainer}
      onLoadingStateChange={setLoading}
    >
      <GameOverlay>
        <TrainerLoadingSplash state={loading} />
        <LoadoutManager
          loadouts={loadoutTemplates}
          open={loadoutOpen}
          onClose={() => setLoadoutOpen(false)}
        />
      </GameOverlay>
      <div id="disclaimer_panel">Work in progress.<br />All assets are property of Jagex.</div>
      <DefaultSidebar>
        <SampleSidebarContents onLoadoutToggle={() => setLoadoutOpen((open) => !open)} />
      </DefaultSidebar>
    </TrainerApp>
  );
}
