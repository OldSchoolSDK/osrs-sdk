import React, { HTMLAttributes } from "react";
import { useTrainerContext } from "../TrainerContext";
import { useTrainerSnapshot } from "../hooks/useTrainerSnapshot";
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
  const trainer = useTrainerContext();
  return (
    <SettingRow htmlFor={`${id}Enabled`} label={label}>
      <span style={{ alignItems: "center", display: "flex", gap: 8 }}>
        <input
          aria-label={`Enable ${label}`}
          checked={enabled}
          id={`${id}Enabled`}
          onChange={(event) => trainer.setSettings({ [enabledSetting]: event.currentTarget.checked })}
          type="checkbox"
        />
        <input
          aria-label={`${label} color`}
          disabled={!enabled}
          id={id}
          onChange={(event) => trainer.setSettings({ [colorSetting]: event.currentTarget.value })}
          type="color"
          value={value}
        />
      </span>
    </SettingRow>
  );
}

export function AdvancedSettingsPanel({ children, onClose, open, style, ...props }: AdvancedSettingsPanelProps) {
  const trainer = useTrainerContext();
  const settings = useTrainerSnapshot((snapshot) => snapshot.settings);

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
              onChange={(event) => trainer.setSettings({ tileMarkerColor: event.currentTarget.value })}
            />
          </SettingRow>
        </Section>

        <Section title="Game Settings">
          <SettingRow htmlFor="hideDeadNpcs" label="Hide dead NPCs">
            <input
              id="hideDeadNpcs"
              type="checkbox"
              checked={settings.hideDeadNpcs}
              onChange={(event) => trainer.setSettings({ hideDeadNpcs: event.currentTarget.checked })}
            />
          </SettingRow>
        </Section>

        <Section title="Camera">
          <SettingRow htmlFor="relaxCameraPitch" label="Unclamp camera pitch">
            <input
              id="relaxCameraPitch"
              type="checkbox"
              checked={settings.relaxCameraPitch}
              onChange={(event) => trainer.setSettings({ relaxCameraPitch: event.currentTarget.checked })}
            />
          </SettingRow>
        </Section>

        <Section title="Graphics">
          <SettingRow htmlFor="renderFps" label="FPS limit">
            <select
              id="renderFps"
              value={settings.renderFps}
              onChange={(event) => trainer.setSettings({ renderFps: Number(event.currentTarget.value) })}
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
              onChange={(event) => trainer.setSettings({ smoothCacheAnimations: event.currentTarget.checked })}
            />
          </SettingRow>
          <SettingRow htmlFor="displayClickboxes" label="Display clickboxes">
            <input
              id="displayClickboxes"
              type="checkbox"
              checked={settings.displayClickboxes ?? false}
              onChange={(event) => trainer.setSettings({ displayClickboxes: event.currentTarget.checked })}
            />
          </SettingRow>
        </Section>

        <Section title="Debug">
          <SettingRow htmlFor="chunkDebug" label="Chunk debug">
            <input
              id="chunkDebug"
              type="checkbox"
              checked={settings.chunkDebug}
              onChange={(event) => trainer.setSettings({ chunkDebug: event.currentTarget.checked })}
            />
          </SettingRow>
          <SettingRow htmlFor="tileCollisionDebug" label="Claimed tiles">
            <input
              id="tileCollisionDebug"
              type="checkbox"
              checked={settings.tileCollisionDebug}
              onChange={(event) => trainer.setSettings({ tileCollisionDebug: event.currentTarget.checked })}
            />
          </SettingRow>
        </Section>

        {children}
      </RuneScapePanel>
    </Modal>
  );
}
