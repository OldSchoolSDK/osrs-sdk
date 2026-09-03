import React, { useEffect, useState } from "react";
import { EQUIPMENT_TYPE_TO_SLOT, Equipment, loadLoadoutRegistry, Settings, Weapon } from "osrs-sdk";
import type { Loadout as LoadoutData, LoadoutItemId } from "osrs-sdk";
import { Modal } from "./Modal";
import { Loadout } from "./Loadout";
import type { GetLoadoutSubstitutes, LoadoutRegistry, LoadoutSlot } from "./Loadout";

export type LoadoutManagerProps = {
  getSubstitutes?: GetLoadoutSubstitutes;
  loadouts: LoadoutData[];
  onClose: () => void;
  open: boolean;
};

export function LoadoutManager({ getSubstitutes, loadouts, onClose, open }: LoadoutManagerProps) {
  const settings = Settings.getSnapshot();
  const savedLoadoutIndex = loadouts.findIndex((template) => template.name === settings.loadout);
  const savedCustomLoadout = settings.customLoadout?.name === loadouts[savedLoadoutIndex]?.name
    ? settings.customLoadout
    : null;
  const [selectedLoadoutIndex, setSelectedLoadoutIndex] = useState(savedLoadoutIndex >= 0 ? savedLoadoutIndex : 0);
  const [loadout, setLoadout] = useState<LoadoutData | undefined>(
    savedCustomLoadout ?? loadouts[savedLoadoutIndex >= 0 ? savedLoadoutIndex : 0],
  );
  const [isCustomLoadout, setIsCustomLoadout] = useState(savedCustomLoadout !== null);
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

  // Selecting something from the dropdown resets to a base loadout and clears custom state.
  const onSelectTemplatedLoadout = (event: React.ChangeEvent<HTMLSelectElement>) => {
    if (event.currentTarget.value === "custom") return;
    const nextIndex = Number(event.currentTarget.value);
    const nextLoadout = loadouts[nextIndex];
    if (!nextLoadout) return;
    setSelectedLoadoutIndex(nextIndex);
    setLoadout(nextLoadout);
    setIsCustomLoadout(false);
    Settings.set({ loadout: nextLoadout.name, customLoadout: null });
  };

  // Change a specific slot, including the opposing slot for two-handed weapons.
  const onItemSelect = (slot: LoadoutSlot, itemId: LoadoutItemId) => {
    if (!loadout) return;

    const selectedItem = itemId === null ? undefined : registry?.get(itemId);
    const currentWeapon = loadout.equipment.weapon === null
      ? undefined
      : registry?.get(loadout.equipment.weapon);
    const equipsTwoHandedWeapon = slot.kind === "equipment"
      && slot.slot === "weapon"
      && selectedItem instanceof Weapon
      && selectedItem.isTwoHander;
    const replacesTwoHandedWeapon = slot.kind === "equipment"
      && slot.slot === "offhand"
      && currentWeapon instanceof Weapon
      && currentWeapon.isTwoHander;

    const nextLoadout = slot.kind === "equipment"
      ? {
        ...loadout,
        equipment: {
          ...loadout.equipment,
          [slot.slot]: itemId,
          ...(equipsTwoHandedWeapon ? { offhand: null } : {}),
          ...(replacesTwoHandedWeapon ? { weapon: null } : {}),
        },
      }
      : (() => {
        const inventory = [...loadout.inventory];
        inventory[slot.index] = itemId;
        return { ...loadout, inventory };
      })();

    setLoadout(nextLoadout);
    setIsCustomLoadout(true);
    Settings.set({ loadout: nextLoadout.name, customLoadout: nextLoadout });
  };

  const getLoadoutSubstitutes: GetLoadoutSubstitutes = (slot, currentRegistry) => {
    if (getSubstitutes) return getSubstitutes(slot, currentRegistry);
    if (!currentRegistry) return [];
    if (slot === null) return Array.from(currentRegistry.keys());

    return Array.from(currentRegistry.entries())
      .filter(([, item]) => item instanceof Equipment && EQUIPMENT_TYPE_TO_SLOT[item.type] === slot)
      .map(([itemId]) => itemId);
  };

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
            <select
              id="loadout-select"
              value={isCustomLoadout ? "custom" : String(selectedLoadoutIndex)}
              onChange={onSelectTemplatedLoadout}
            >
              {isCustomLoadout && <option value="custom">Custom*</option>}
              {loadouts.map((template, index) => (
                <option key={template.name} value={index}>{template.name}</option>
              ))}
            </select>
            {loadout && (
              <Loadout
                getSubstitutes={getLoadoutSubstitutes}
                loadout={loadout}
                onItemSelect={onItemSelect}
                registry={registry}
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
