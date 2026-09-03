import React from "react";
import type { Item, Loadout as LoadoutData } from "../src";

export type LoadoutRegistry = Map<number, Item>;

export type LoadoutProps = {
  loadout: LoadoutData;
  registry?: LoadoutRegistry;
};

const equipmentSlotCoordinates = [
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
  textAlign: "center",
};

function ItemSlot({ itemId, registry }: { itemId: number | null; registry?: LoadoutRegistry }) {
  const item = itemId === null ? undefined : registry?.get(itemId);

  if (!item) {
    return <>{itemId ?? "-"}</>;
  }

  return (
    <img
      src={item.inventoryImage}
      alt={item.itemName}
      title={`${item.itemName} (${itemId})`}
      style={{ maxHeight: "90%", maxWidth: "90%", imageRendering: "pixelated" }}
    />
  );
}

export function Loadout({ loadout, registry }: LoadoutProps) {
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
              <ItemSlot itemId={loadout.equipment[slot.key]} registry={registry} />
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3>Inventory</h3>
        <div style={{ display: "grid", gap: 4, gridTemplateColumns: `repeat(4, ${slotSize}px)` }}>
          {loadout.inventory.map((itemId, index) => (
            <div key={index} style={{ ...slotStyle, height: slotSize, width: slotSize }}>
              <ItemSlot itemId={itemId} registry={registry} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
