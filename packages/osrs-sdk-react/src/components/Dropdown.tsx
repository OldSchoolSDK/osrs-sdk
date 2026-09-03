import React, { CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { useOnClickOutside } from "../hooks/useOnClickOutside";

export type DropdownProps = {
  children: React.ReactNode;
  menuStyle?: CSSProperties;
  trigger: React.ReactNode;
};

type MenuLayout = {
  bottom?: number;
  left: number;
  maxHeight: number;
  top?: number;
};

/** A small positioned dropdown with an internally controlled open state. */
export function Dropdown({ children, menuStyle, trigger }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuLayout, setMenuLayout] = useState<MenuLayout | null>(null);

  useOnClickOutside(dropdownRef, () => setOpen(false), open);

  useLayoutEffect(() => {
    if (!open) {
      setMenuLayout(null);
      return;
    }

    const updateMenuLayout = () => {
      const dropdown = dropdownRef.current;
      const menu = menuRef.current;
      if (!dropdown || !menu) return;

      const trigger = dropdown.getBoundingClientRect();
      const viewportPadding = 8;
      const spaceAbove = Math.max(0, trigger.bottom - viewportPadding);
      const spaceBelow = Math.max(0, window.innerHeight - trigger.top - viewportPadding);
      const preferredMaxHeight = Math.min(window.innerHeight * 0.7, menu.scrollHeight);
      const opensAbove = spaceBelow < preferredMaxHeight && spaceAbove > spaceBelow;
      const availableHeight = opensAbove ? spaceAbove : spaceBelow;

      setMenuLayout({
        bottom: opensAbove ? window.innerHeight - trigger.bottom + 4 : undefined,
        left: trigger.right + 4,
        maxHeight: Math.max(1, Math.min(preferredMaxHeight, availableHeight)),
        top: opensAbove ? undefined : trigger.top,
      });
    };

    updateMenuLayout();
    window.addEventListener("resize", updateMenuLayout);
    window.addEventListener("scroll", updateMenuLayout, true);
    return () => {
      window.removeEventListener("resize", updateMenuLayout);
      window.removeEventListener("scroll", updateMenuLayout, true);
    };
  }, [open]);

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
          ref={menuRef}
          style={{
            backgroundColor: "#282828",
            border: "1px solid #8f8f8f",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            left: menuLayout?.left ?? "calc(100% + 4px)",
            maxHeight: menuLayout?.maxHeight ?? "70vh",
            overflowY: "auto",
            padding: 4,
            position: menuLayout ? "fixed" : "absolute",
            top: menuLayout?.top ?? 0,
            visibility: menuLayout ? "visible" : "hidden",
            zIndex: 10,
            ...menuStyle,
            ...(menuLayout?.bottom !== undefined ? { bottom: menuLayout.bottom } : {}),
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
