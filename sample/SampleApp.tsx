import React, { useState } from "react";
import {
  ControlPanelController,
  CACHE_ASSETS,
  Region,
  Settings,
  TrainerInstance,
  TrainerLoadingState,
} from "../src";
import type { Loadout as LoadoutData } from "../src";
import {
  DefaultSidebar,
  GameOverlay,
  LoadoutManager,
  RuneScapeButton,
  TrainerApp,
  TrainerLoadingSplash,
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
  const trainer = new TrainerInstance(region, { readyTimer: 6 });
  // Temporary internal flag to make the manticore aggressive, for automated visual testing of its spotanim
  if (new URLSearchParams(window.location.search).get("visual-harness") === "1") {
    (window as Window & { __OSRS_VISUAL_HARNESS__?: unknown }).__OSRS_VISUAL_HARNESS__ = {
      trainer,
      startManticoreAttack() {
        const player = trainer.getSnapshot().player;
        const manticore = trainer.region.mobs.find((mob) => mob.mobName() === "Manticore");
        if (!player || !manticore) throw new Error("Manticore scenario is not initialised");
        manticore.setAggro(player);
      },
    };
  }
  return trainer;
}

function SampleSidebarContents({ onLoadoutToggle }: { onLoadoutToggle: () => void }) {
  const trainer = useTrainerContext();

  return (
    <>
      <RuneScapeButton type="button" onClick={() => trainer.reset()}>Reset</RuneScapeButton>
      <RuneScapeButton type="button" onClick={() => ControlPanelController.controller.setActiveControl("SETTINGS")}>Ingame Settings</RuneScapeButton>
      <RuneScapeButton type="button" onClick={onLoadoutToggle}>Loadout</RuneScapeButton>
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
