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

type ColorSettingName = "entityIndicatorColor" | "hoveredTileColor" | "targetTileColor" | "trueTileColor";
type ColorEnabledSettingName = "entityIndicatorEnabled" | "hoveredTileEnabled" | "targetTileEnabled" | "trueTileEnabled";

function SettingRow({ children, htmlFor, label, style, ...props }: SettingRowProps) {
  return (
    <div {...props} style={{ display: "contents", ...style }}>
      <label htmlFor={htmlFor}>{label}</label>
      <div style={{ justifySelf: "end" }}>{children}</div>
    </div>
  );
}

function ColorSetting({ colorSetting, enabled, enabledSetting, id, label, value }: {
  colorSetting: ColorSettingName;
  enabled: boolean;
  enabledSetting: ColorEnabledSettingName;
  id: string;
  label: string;
  value: string;
}) {
  return (
    <SettingRow htmlFor={`${id}Enabled`} label={label}>
      <span style={{ alignItems: "center", display: "flex", gap: 8 }}>
        <input
          aria-label={`Enable ${label}`}
          checked={enabled}
          id={`${id}Enabled`}
          onChange={(event) => Settings.set({ [enabledSetting]: event.currentTarget.checked })}
          type="checkbox"
        />
        <input
          aria-label={`${label} color`}
          disabled={!enabled}
          id={id}
          onChange={(event) => Settings.set({ [colorSetting]: event.currentTarget.value })}
          type="color"
          value={value}
        />
      </span>
    </SettingRow>
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
          <ColorSetting
            colorSetting="entityIndicatorColor"
            enabled={settings.entityIndicatorEnabled}
            enabledSetting="entityIndicatorEnabled"
            id="entityIndicatorColor"
            label="Player/NPC indicator"
            value={settings.entityIndicatorColor}
          />
          <ColorSetting
            colorSetting="trueTileColor"
            enabled={settings.trueTileEnabled}
            enabledSetting="trueTileEnabled"
            id="trueTileColor"
            label="True tiles"
            value={settings.trueTileColor}
          />
          <ColorSetting
            colorSetting="hoveredTileColor"
            enabled={settings.hoveredTileEnabled}
            enabledSetting="hoveredTileEnabled"
            id="hoveredTileColor"
            label="Hovered tile"
            value={settings.hoveredTileColor}
          />
          <ColorSetting
            colorSetting="targetTileColor"
            enabled={settings.targetTileEnabled}
            enabledSetting="targetTileEnabled"
            id="targetTileColor"
            label="Target tile"
            value={settings.targetTileColor}
          />
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
