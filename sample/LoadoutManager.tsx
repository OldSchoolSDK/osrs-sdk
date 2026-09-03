import React, { useEffect, useState } from "react";
import { Modal } from "osrs-sdk-react";
import { CACHE_ASSETS, loadLoadoutRegistry } from "../src";
import type { Loadout as LoadoutData } from "../src";
import { Loadout } from "./Loadout";
import type { LoadoutRegistry } from "./Loadout";

export type LoadoutManagerProps = {
  onClose: () => void;
  open: boolean;
};

const initialLoadout: LoadoutData = {
  equipment: {
    weapon: 22325,
    offhand: null,
    helmet: 26382,
    necklace: 19547,
    chest: 26384,
    legs: 26386,
    feet: 13239,
    gloves: 22981,
    ring: 25485,
    cape: 21295,
    ammo: 11212,
  },
  inventory: Object.values(CACHE_ASSETS.items)
    .slice(0, 28)
    .map(({ id }) => id),
};

export function LoadoutManager({ onClose, open }: LoadoutManagerProps) {
  const [loadout] = useState<LoadoutData>(initialLoadout);
  const [registry, setRegistry] = useState<LoadoutRegistry>();

  useEffect(() => {
    if (!open || registry) return;

    let mounted = true;

    // The registry imports and constructs every item class, so keep it out of
    // the initial app bundle and load it only when the loadout UI is opened.
    loadLoadoutRegistry().then((loadedRegistry) => {
      if (mounted) setRegistry(loadedRegistry);
    });

    return () => {
      mounted = false;
    };
  }, [open, registry]);

  return (
    <Modal open={open}>
      <div
        style={{
          backgroundColor: "#282828",
          border: "1px solid #FFFF00",
          color: "#FFFF00",
          minWidth: 320,
          padding: 20,
        }}
      >
        <h2>Loadout</h2>
        <Loadout loadout={loadout} registry={registry} />
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
