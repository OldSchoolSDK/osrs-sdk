import type { UnitEquipment } from "./Unit";

/** An item ID before it has been resolved into an Item instance. */
export type LoadoutItemId = number | null;

/**
 * A player's equipment and inventory represented by unresolved item IDs.
 * `inventory` is expected to contain exactly 28 entries, one for each slot.
 */
export type Loadout = {
  equipment: Record<keyof UnitEquipment, LoadoutItemId>;
  inventory: LoadoutItemId[];
};
