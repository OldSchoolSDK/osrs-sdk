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
      <div>
        <hr />
        <RenderFpsControl />
      </div>
    </aside>
  );
}
