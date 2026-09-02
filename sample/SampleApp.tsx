import React, { useState } from "react";
import {
  ControlPanelController,
  Region,
  Settings,
  TileMarker,
  TrainerInstance,
  TrainerLoadingState,
} from "../src";
import { TrainerApp, TrainerLoading, useSettingsSnapshot } from "osrs-sdk-react";
import { configureSampleCacheRenderer } from "./cache-render";
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

function SampleSidebar({ trainer }: { trainer: TrainerInstance }) {
  const settings = useSettingsSnapshot();

  return (
    <div id="right_panel" className={settings.menuVisible ? undefined : "hidden"}>
      <div dangerouslySetInnerHTML={{ __html: trainer.region.getSidebarContent() }} />
      <button type="button" onClick={() => trainer.reset()}>Reset</button>
      <button type="button" onClick={() => ControlPanelController.controller.setActiveControl("SETTINGS")}>Settings</button>
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
      <div>
        <label htmlFor="renderFps">Render FPS</label>
        <select
          id="renderFps"
          value={settings.renderFps}
          onChange={(event) => Settings.set({ renderFps: Number(event.currentTarget.value) })}
        >
          <option value={30}>30</option>
          <option value={60}>60</option>
          <option value={120}>120</option>
          <option value={0}>Unlimited</option>
        </select>
      </div>
      <div>
        <input
          id="smoothCacheAnimations"
          type="checkbox"
          checked={settings.smoothCacheAnimations}
          onChange={(event) => Settings.set({ smoothCacheAnimations: event.currentTarget.checked })}
        />
        <label htmlFor="smoothCacheAnimations">Smooth cache animations</label>
      </div>
      <div style={{ paddingBottom: 10, paddingTop: 10, textAlign: "center", width: "100%" }}>
        <div id="gpu_warning" />
      </div>
    </div>
  );
}

export function SampleApp() {
  const [trainer] = useState(createTrainer);
  const [loading, setLoading] = useState<TrainerLoadingState>();

  return (
    <TrainerApp trainer={trainer} onLoadingStateChange={setLoading}>
      <TrainerLoading state={loading} style={{ left: '50%', position: "absolute", top: '50%', fontSize: '16pt' }} />
      <div id="disclaimer_panel">Work in progress.<br />All assets are property of Jagex.</div>
      <SampleSidebar trainer={trainer} />
    </TrainerApp>
  );
}
