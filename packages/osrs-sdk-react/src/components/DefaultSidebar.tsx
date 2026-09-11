import React, { HTMLAttributes, useState } from "react";
import { useSettingsSnapshot } from "../hooks/useSettingsSnapshot";
import { AdvancedSettingsPanel } from "./AdvancedSettingsPanel";
import { RuneScapeButton } from "./RuneScapeButton";
import { RuneScapePanel } from "./RuneScapePanel";

export type DefaultSidebarProps = HTMLAttributes<HTMLElement>;

export function DefaultSidebar({ children, style, ...props }: DefaultSidebarProps) {
  const settings = useSettingsSnapshot();
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);

  return (
    <>
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
        <RuneScapePanel style={{ boxSizing: "border-box", flexShrink: 0, minHeight: "100%", width: "100%" }}>
          <div>{children}</div>
          <div>
            <hr />
            <RuneScapeButton onClick={() => setAdvancedSettingsOpen(true)} style={{ width: "100%" }} type="button">
              Advanced settings
            </RuneScapeButton>
          </div>
        </RuneScapePanel>
      </aside>
      <AdvancedSettingsPanel onClose={() => setAdvancedSettingsOpen(false)} open={advancedSettingsOpen} />
    </>
  );
}
