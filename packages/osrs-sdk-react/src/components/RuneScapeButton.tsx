import React, { ButtonHTMLAttributes, useState } from "react";
import { INTERFACE_ASSETS } from "osrs-sdk";
import { SpriteFrame } from "./SpriteFrame";

export type RuneScapeButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function RuneScapeButton({ children, className, disabled, style, ...props }: RuneScapeButtonProps) {
  const [hovered, setHovered] = useState(false);
  const assets = INTERFACE_ASSETS.button[hovered && !disabled ? "selected" : "normal"];
  return (
    <button
      {...props}
      className={["osrs-ui-button", className].filter(Boolean).join(" ")}
      disabled={disabled}
      onPointerEnter={(event) => { setHovered(true); props.onPointerEnter?.(event); }}
      onPointerLeave={(event) => { setHovered(false); props.onPointerLeave?.(event); }}
      style={{
        background: "none", border: 0, color: "#fff", cursor: disabled ? "default" : "pointer",
        font: "inherit", minHeight: 30, padding: 0, textShadow: "1px 1px #000", ...style,
      }}
    >
      <SpriteFrame assets={assets} slice={6} style={{ minHeight: 30 }}>
        <span style={{ display: "block", padding: "7px 14px 6px" }}>
          {children}
        </span>
      </SpriteFrame>
    </button>
  );
}
