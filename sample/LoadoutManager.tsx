import React, { useEffect, useState } from "react";
import { Modal } from "osrs-sdk-react";
import { CACHE_ASSETS, loadLoadoutRegistry } from "../src";
import type { Loadout as LoadoutData, LoadoutItemId, UnitEquipment } from "../src";
import { Loadout } from "./Loadout";
import type { LoadoutRegistry, LoadoutSlot } from "./Loadout";

export type LoadoutManagerProps = {
  loadouts: LoadoutData[];
  onClose: () => void;
  open: boolean;
};

export function LoadoutManager({ loadouts, onClose, open }: LoadoutManagerProps) {
  const [selectedLoadoutIndex, setSelectedLoadoutIndex] = useState(0);
  const [loadout, setLoadout] = useState<LoadoutData | undefined>(loadouts[0]);
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

  const onLoadoutChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextIndex = Number(event.currentTarget.value);
    const nextLoadout = loadouts[nextIndex];
    if (!nextLoadout) return;
    setSelectedLoadoutIndex(nextIndex);
    setLoadout(nextLoadout);
  };

  const onItemSelect = (slot: LoadoutSlot, itemId: number) => {
    setLoadout((currentLoadout) => {
      if (!currentLoadout) return currentLoadout;

      if (slot.kind === "equipment") {
        return {
          ...currentLoadout,
          equipment: {
            ...currentLoadout.equipment,
            [slot.slot]: itemId,
          },
        };
      }

      const inventory = [...currentLoadout.inventory];
      inventory[slot.index] = itemId;
      return { ...currentLoadout, inventory };
    });
  };

  const getSubstitutes = (slot: keyof UnitEquipment | null): number[] => {
    if (slot === null) {
      // inventory slots
      return [
        // sarad
        CACHE_ASSETS.items.saradominBrew.id,
      ];
    }
    return [
      CACHE_ASSETS.items.scytheOfVitur.id,
      CACHE_ASSETS.items.abyssalTentacle.id,
      CACHE_ASSETS.items.bladeOfSaeldor.id,
      CACHE_ASSETS.items.twistedBow.id,
      CACHE_ASSETS.items.bowOfFaerdhinen.id,
      CACHE_ASSETS.items.toxicBlowpipe.id,
    ];
  }

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
        {loadouts.length > 0 ? (
          <>
            <label htmlFor="loadout-select">Template: </label>
            <select id="loadout-select" value={selectedLoadoutIndex} onChange={onLoadoutChange}>
              {loadouts.map((template, index) => (
                <option key={template.name} value={index}>{template.name}</option>
              ))}
            </select>
            {loadout && (
              <Loadout
                loadout={loadout}
                onItemSelect={onItemSelect}
                registry={registry}
                getSubstitutes={getSubstitutes}
              />
            )}
          </>
        ) : (
          <p>No loadout templates configured.</p>
        )}
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
