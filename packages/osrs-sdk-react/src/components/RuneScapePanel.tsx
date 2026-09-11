import React, { HTMLAttributes } from "react";
import { INTERFACE_ASSETS } from "osrs-sdk";
import { SpriteFrame } from "./SpriteFrame";

export type RuneScapePanelProps = HTMLAttributes<HTMLDivElement>;

export function RuneScapePanel({ children, className, style, ...props }: RuneScapePanelProps) {
  return (
    <SpriteFrame
      {...props}
      assets={{ middle: INTERFACE_ASSETS.dialog.background, ...INTERFACE_ASSETS.dialog }}
      className={["osrs-ui-panel", className].filter(Boolean).join(" ")}
      overlapFrame
      slice={32}
      style={{ color: "#ff981f", padding: 32, textShadow: "1px 1px #000", ...style }}
    >
      {children}
    </SpriteFrame>
  );
}
