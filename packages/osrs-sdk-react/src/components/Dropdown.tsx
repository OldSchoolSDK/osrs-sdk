import React, { CSSProperties, useRef, useState } from "react";
import { useOnClickOutside } from "../hooks/useOnClickOutside";

export type DropdownProps = {
  children: React.ReactNode;
  menuStyle?: CSSProperties;
  trigger: React.ReactNode;
};

/** A small positioned dropdown with an internally controlled open state. */
export function Dropdown({ children, menuStyle, trigger }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(dropdownRef, () => setOpen(false), open);

  return (
    <div ref={dropdownRef} style={{ height: "100%", position: "relative", width: "100%" }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
        style={{ background: "none", border: 0, cursor: "pointer", height: "100%", padding: 0, width: "100%" }}
      >
        {trigger}
      </button>
      {open && (
        <div
          style={{
            backgroundColor: "#282828",
            border: "1px solid #8f8f8f",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            left: "calc(100% + 4px)",
            padding: 4,
            position: "absolute",
            top: 0,
            zIndex: 10,
            ...menuStyle,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
