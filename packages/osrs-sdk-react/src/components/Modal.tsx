import React, { HTMLAttributes } from "react";

export type ModalProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  /** Whether the backdrop darkens and blocks interaction with the underlying app. */
  blocking?: boolean;
  children?: React.ReactNode;
  open: boolean;
};

/**
 * A controlled modal surface. Render it directly under TrainerApp for an
 * app-wide modal, or inside GameOverlay to constrain it to the game area.
 */
export function Modal({ blocking = true, children, open, style, ...props }: ModalProps) {
  if (!open) return null;

  return (
    <div
      {...props}
      role="dialog"
      aria-modal="true"
      style={{
        alignItems: "center",
        backgroundColor: blocking ? "rgba(0, 0, 0, 0.6)" : "transparent",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        pointerEvents: blocking ? "auto" : "none",
        position: "absolute",
        zIndex: 2000,
        ...style,
      }}
    >
      {blocking ? children : <div style={{ pointerEvents: "auto" }}>{children}</div>}
    </div>
  );
}
