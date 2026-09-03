import React, { createContext, ReactNode, useContext } from "react";
import { createPortal } from "react-dom";

const GameOverlayTargetContext = createContext<HTMLElement | null>(null);

export function GameOverlayProvider({ target, children }: { target: HTMLElement | null; children: ReactNode }) {
  return (
    <GameOverlayTargetContext.Provider value={target}>
      {children}
    </GameOverlayTargetContext.Provider>
  );
}

export function GameOverlay({ children }: { children: ReactNode }) {
  const target = useContext(GameOverlayTargetContext);
  return target ? createPortal(children, target) : null;
}
