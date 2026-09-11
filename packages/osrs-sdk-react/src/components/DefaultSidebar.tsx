import React, { HTMLAttributes } from "react";
import { Settings } from "osrs-sdk";
import { useSettingsSnapshot } from "../hooks/useSettingsSnapshot";
import { RuneScapePanel } from "./RuneScapePanel";

export type DefaultSidebarProps = HTMLAttributes<HTMLElement>;

function RenderFpsControl() {
  const settings = useSettingsSnapshot();

  return (
    <div>
      <label htmlFor="render_fps">Render FPS</label>
      <select
        id="render_fps"
        value={settings.renderFps}
        onChange={(event) => Settings.set({ renderFps: Number(event.currentTarget.value) })}
      >
        <option value={30}>30</option>
        <option value={60}>60</option>
        <option value={120}>120</option>
        <option value={0}>Unlimited</option>
      </select>
      <label style={{ alignItems: "center", display: "flex", gap: 4, marginTop: 6 }}>
        <input
          id="smoothCacheAnimations"
          type="checkbox"
          checked={settings.smoothCacheAnimations}
          onChange={(event) => Settings.set({ smoothCacheAnimations: event.currentTarget.checked })}
        />
        Smooth cache animations
      </label>
      <label style={{ alignItems: "center", display: "flex", gap: 4, marginTop: 6 }}>
        <input
          id="displayClickboxes"
          type="checkbox"
          checked={settings.displayClickboxes ?? false}
          onChange={(event) => Settings.set({ displayClickboxes: event.currentTarget.checked })}
        />
        Display clickboxes
      </label>
    </div>
  );
}

export function DefaultSidebar({ children, style, ...props }: DefaultSidebarProps) {
  const settings = useSettingsSnapshot();

  return (
    <aside
      id="right_panel"
      {...props}
      style={{
        display: settings.menuVisible ? "flex" : "none",
        flex: "0 0 auto",
        flexDirection: "column",
        height: "100%",
        minWidth: 0,
        overflowY: "auto",
        width: 240,
        ...style,
      }}
    >
      <RuneScapePanel style={{ boxSizing: "border-box", minHeight: "100%", width: "100%" }}>
        <div>{children}</div>
        <div>
          <hr style={{ border: 0, borderTop: "1px solid #6b5b3e" }} />
          <RenderFpsControl />
        </div>
      </RuneScapePanel>
    </aside>
  );
}
