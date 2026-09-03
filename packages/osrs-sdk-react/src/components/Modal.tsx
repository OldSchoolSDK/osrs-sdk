import React, { HTMLAttributes } from "react";

export type ModalProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  children?: React.ReactNode;
  open: boolean;
};

/**
 * A controlled modal surface. Render it directly under TrainerApp for an
 * app-wide modal, or inside GameOverlay to constrain it to the game area.
 */
export function Modal({ children, open, style, ...props }: ModalProps) {
  if (!open) return null;

  return (
    <div
      {...props}
      role="dialog"
      aria-modal="true"
      style={{
        alignItems: "center",
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        position: "absolute",
        zIndex: 2000,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
