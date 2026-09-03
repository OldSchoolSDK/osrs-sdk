import React, { HTMLAttributes } from "react";
import { Settings } from "osrs-sdk";
import { useSettingsSnapshot } from "../hooks/useSettingsSnapshot";

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
      <label>
        <input
          id="smoothCacheAnimations"
          type="checkbox"
          checked={settings.smoothCacheAnimations}
          onChange={(event) => Settings.set({ smoothCacheAnimations: event.currentTarget.checked })}
        />
        Smooth cache animations
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
        background: "black",
        display: settings.menuVisible ? "flex" : "none",
        flex: "0 0 auto",
        flexDirection: "column",
        height: "100%",
        minWidth: 0,
        overflowY: "auto",
        padding: "30px 10px",
        width: 200,
        ...style,
      }}
    >
      <div>{children}</div>
      <div style={{ marginTop: "auto" }}>
        <hr />
        <RenderFpsControl />
      </div>
    </aside>
  );
}
