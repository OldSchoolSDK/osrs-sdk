import React from "react";
import { Dropdown } from "osrs-sdk-react";
import type { Item, Loadout as LoadoutData, UnitEquipment } from "../src";
import type { LoadoutItemId } from "../src";

export type LoadoutRegistry = Map<number, Item>;

export type LoadoutSlot =
  | { kind: "equipment"; slot: keyof UnitEquipment }
  | { index: number; kind: "inventory" };

export type LoadoutProps = {
  loadout: LoadoutData;
  onItemSelect: (slot: LoadoutSlot, itemId: number) => void;
  registry?: LoadoutRegistry;
  // return appropriate substitutes for the given slot (slot is null for inventory slots)
  getSubstitutes: (slot: keyof UnitEquipment | null) => number[];
};

const equipmentSlotCoordinates: { key: keyof UnitEquipment; label: string; left: number; top: number }[] = [
  { key: "helmet", label: "Helmet", left: 84, top: 11 },
  { key: "cape", label: "Cape", left: 43, top: 50 },
  { key: "necklace", label: "Neck", left: 84, top: 50 },
  { key: "ammo", label: "Ammo", left: 124, top: 50 },
  { key: "weapon", label: "Weapon", left: 28, top: 89 },
  { key: "chest", label: "Chest", left: 84, top: 89 },
  { key: "offhand", label: "Offhand", left: 140, top: 89 },
  { key: "legs", label: "Legs", left: 84, top: 129 },
  { key: "gloves", label: "Gloves", left: 28, top: 169 },
  { key: "feet", label: "Feet", left: 84, top: 169 },
  { key: "ring", label: "Ring", left: 140, top: 169 },
];

const slotSize = 60;
const referenceSlotSize = 36;
const equipmentAnchor = equipmentSlotCoordinates[0];
const scaledEquipmentSlots = equipmentSlotCoordinates.map((slot) => ({
  ...slot,
  left: equipmentAnchor.left + ((slot.left - equipmentAnchor.left) * slotSize) / referenceSlotSize,
  top: equipmentAnchor.top + ((slot.top - equipmentAnchor.top) * slotSize) / referenceSlotSize,
}));
const equipmentLeft = Math.min(...scaledEquipmentSlots.map((slot) => slot.left));
const equipmentTop = Math.min(...scaledEquipmentSlots.map((slot) => slot.top));
const equipmentSlots = scaledEquipmentSlots.map((slot) => ({
  ...slot,
  left: slot.left - equipmentLeft,
  top: slot.top - equipmentTop,
}));
const equipmentWidth = Math.max(...equipmentSlots.map((slot) => slot.left + slotSize));
const equipmentHeight = Math.max(...equipmentSlots.map((slot) => slot.top + slotSize));

const slotStyle: React.CSSProperties = {
  alignItems: "center",
  backgroundColor: "#111",
  border: "1px solid #8f8f8f",
  boxSizing: "border-box",
  color: "#8f8f8f",
  display: "flex",
  fontSize: 10,
  justifyContent: "center",
  position: "relative",
  textAlign: "center",
};

function ItemSlot({
  itemId,
  onItemSelect,
  registry,
  substituteItemIds,
}: {
  itemId: LoadoutItemId;
  onItemSelect: (itemId: number) => void;
  registry?: LoadoutRegistry;
  substituteItemIds: number[];
}) {
  const item = itemId === null ? undefined : registry?.get(itemId);

  if (!item) {
    return <>{itemId ?? "-"}</>;
  }

  return (
    <Dropdown
      menuStyle={{ width: slotSize * 2 }}
      trigger={
        <img
          src={item.inventoryImage}
          alt={item.itemName}
          title={`${item.itemName} (${itemId})`}
          style={{ maxHeight: "90%", maxWidth: "90%", imageRendering: "pixelated" }}
        />
      }
    >
      {substituteItemIds.map((substituteId) => {
        const substitute = registry?.get(substituteId);
        if (!substitute) return null;
        return (
          <div
            key={substituteId}
            onClick={() => onItemSelect(substituteId)}
            title={`${substitute.itemName} (${substitute.cacheItemId})`}
            style={{
              alignItems: "center",
              cursor: "pointer",
              display: "flex",
              gap: 4,
              minHeight: slotSize,
            }}
          >
            <img
              src={substitute.inventoryImage}
              alt={substitute.itemName}
              style={{ maxHeight: slotSize - 4, maxWidth: slotSize - 4, imageRendering: "pixelated" }}
            />
            <span style={{ fontSize: 10 }}>{substitute.itemName}</span>
          </div>
        );
      })}
    </Dropdown>
  );
}

export function Loadout({ loadout, onItemSelect, registry, getSubstitutes }: LoadoutProps) {
  return (
    <div style={{ display: "flex", gap: 24 }}>
      <section>
        <h3>Equipment</h3>
        <div style={{ height: equipmentHeight, position: "relative", width: equipmentWidth }}>
          {equipmentSlots.map((slot) => (
            <div
              key={slot.key}
              style={{
                ...slotStyle,
                height: slotSize,
                left: slot.left,
                position: "absolute",
                top: slot.top,
                width: slotSize,
              }}
            >
              <ItemSlot
                itemId={loadout.equipment[slot.key]}
                onItemSelect={(itemId) => onItemSelect({ kind: "equipment", slot: slot.key }, itemId)}
                registry={registry}
                substituteItemIds={getSubstitutes(slot.key)}
              />
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3>Inventory</h3>
        <div style={{ display: "grid", gap: 4, gridTemplateColumns: `repeat(4, ${slotSize}px)` }}>
          {loadout.inventory.map((itemId, index) => (
            <div key={index} style={{ ...slotStyle, height: slotSize, width: slotSize }}>
              <ItemSlot
                itemId={itemId}
                onItemSelect={(selectedItemId) => onItemSelect({ index, kind: "inventory" }, selectedItemId)}
                registry={registry}
                substituteItemIds={getSubstitutes(null)}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
