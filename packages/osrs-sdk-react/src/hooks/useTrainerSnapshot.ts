import { useSyncExternalStore } from "react";
import { TrainerSnapshot } from "osrs-sdk";
import { useTrainerContext } from "../TrainerContext";

export function useTrainerSnapshot<T = TrainerSnapshot>(
  selector: (snapshot: TrainerSnapshot) => T = (snapshot) => snapshot as T,
) {
  const trainer = useTrainerContext();
  const snapshot = useSyncExternalStore(trainer.subscribe, trainer.getSnapshot, trainer.getSnapshot);
  return selector(snapshot);
}
