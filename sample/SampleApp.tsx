import React, { useState } from "react";
import {
  ControlPanelController,
  Region,
  Settings,
  TileMarker,
  TrainerInstance,
  TrainerLoadingState,
} from "../src";
import { DefaultSidebar, GameOverlay, TrainerApp, TrainerLoadingSplash, useSettingsSnapshot, useTrainerContext } from "osrs-sdk-react";
import { configureSampleCacheRenderer } from "./cache-render";
import { Loadout } from "./Loadout";
import { SampleRegion } from "./SampleRegion";

function createTrainer() {
  configureSampleCacheRenderer();
  Settings.readFromStorage();
  const regions: Record<string, Region> = {
    "index.html": new SampleRegion(),
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
        <Loadout open={loadoutOpen} onClose={() => setLoadoutOpen(false)} />
      </GameOverlay>
      <div id="disclaimer_panel">Work in progress.<br />All assets are property of Jagex.</div>
      <DefaultSidebar>
        <SampleSidebarContents onLoadoutToggle={() => setLoadoutOpen((open) => !open)} />
      </DefaultSidebar>
    </TrainerApp>
  );
}
