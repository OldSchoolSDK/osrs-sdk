import React, { ReactNode, createContext, useContext } from "react";
import { TrainerInstance } from "osrs-sdk";

const TrainerContext = createContext<TrainerInstance | null>(null);

export type TrainerProviderProps = {
  children: ReactNode;
  trainer: TrainerInstance;
};

export function TrainerProvider({ children, trainer }: TrainerProviderProps) {
  return <TrainerContext.Provider value={trainer}>{children}</TrainerContext.Provider>;
}

export function useTrainerContext() {
  const trainer = useContext(TrainerContext);
  if (!trainer) throw new Error("useTrainerContext must be used inside a TrainerProvider");
  return trainer;
}
