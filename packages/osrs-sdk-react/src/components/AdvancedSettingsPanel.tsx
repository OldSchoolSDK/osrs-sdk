import React, { HTMLAttributes } from "react";
import { Settings, TileMarker } from "osrs-sdk";
import { useSettingsSnapshot } from "../hooks/useSettingsSnapshot";
import { Modal } from "./Modal";
import { RuneScapeButton } from "./RuneScapeButton";
import { RuneScapePanel } from "./RuneScapePanel";
import { Section } from "./Section";

export type AdvancedSettingsPanelProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  children?: React.ReactNode;
  onClose: () => void;
  open: boolean;
};

type SettingRowProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  children: React.ReactNode;
  htmlFor?: string;
  label: React.ReactNode;
};

function SettingRow({ children, htmlFor, label, style, ...props }: SettingRowProps) {
  return (
    <div {...props} style={{ display: "contents", ...style }}>
      <label htmlFor={htmlFor}>{label}</label>
      <div style={{ justifySelf: "end" }}>{children}</div>
    </div>
  );
}

export function AdvancedSettingsPanel({ children, onClose, open, style, ...props }: AdvancedSettingsPanelProps) {
  const settings = useSettingsSnapshot();

  return (
    <Modal aria-label="Advanced settings" open={open} onClick={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <RuneScapePanel
        {...props}
        style={{ boxSizing: "border-box", maxHeight: "calc(100% - 32px)", maxWidth: "calc(100% - 32px)", overflowY: "auto", width: 440, ...style }}
      >
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ color: "#ffffff", minWidth: 250, margin: 0 }}>Advanced settings</h2>
          <RuneScapeButton aria-label="Close advanced settings" onClick={onClose} style={{ minWidth: 72 }} type="button">
            Close
          </RuneScapeButton>
        </div>

        <Section title="Tile Indicators">
          <SettingRow htmlFor="tileMarkerColor" label="Tile marker color">
            <input
              id="tileMarkerColor"
              type="color"
              value={settings.tileMarkerColor}
              onChange={(event) => {
                Settings.set({ tileMarkerColor: event.currentTarget.value });
                TileMarker.onSetColor(event.currentTarget.value);
              }}
            />
          </SettingRow>
        </Section>

        <Section title="Graphics">
          <SettingRow htmlFor="renderFps" label="FPS limit">
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
          </SettingRow>
          <SettingRow htmlFor="smoothCacheAnimations" label="Animation smoothing">
            <input
              id="smoothCacheAnimations"
              type="checkbox"
              checked={settings.smoothCacheAnimations}
              onChange={(event) => Settings.set({ smoothCacheAnimations: event.currentTarget.checked })}
            />
          </SettingRow>
          <SettingRow htmlFor="displayClickboxes" label="Display clickboxes">
            <input
              id="displayClickboxes"
              type="checkbox"
              checked={settings.displayClickboxes ?? false}
              onChange={(event) => Settings.set({ displayClickboxes: event.currentTarget.checked })}
            />
          </SettingRow>
        </Section>

        {children}
      </RuneScapePanel>
    </Modal>
  );
}
