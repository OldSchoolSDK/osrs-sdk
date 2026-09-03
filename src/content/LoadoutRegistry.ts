// IMPORTANT NOTE: IMPORTING THIS FILE WILL IMPORT ALL ITEMS IN THE SDK
// This will trigger a download of every item asset.
// Consider lazy loading this class (`loadLoadoutRegistry`) when you need it, e.g.
// for a loadout UI.
import type { Item } from "../sdk/Item";
import * as Equipment from "./equipment";
import * as Items from "./items";
import * as Weapons from "./weapons";

type ItemConstructor = new () => Item;

// Construct the supported item classes once so unresolved loadout IDs can be
// resolved to the same name and inventory image used by gameplay.
const itemConstructors = Object.values({
  ...Equipment,
  ...Items,
  ...Weapons,
}) as ItemConstructor[];

const loadoutItems = itemConstructors
  .map((ItemType) => new ItemType())
  .filter((item) => typeof item.cacheItemId === "number");

/** Static item registry used to resolve Loadout item IDs for UI and tooling. */
export const LoadoutRegistry = new Map<number, Item>(
  loadoutItems.map((item): [number, Item] => [item.cacheItemId as number, item]),
);
