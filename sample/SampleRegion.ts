import {
  CardinalDirection,
  Player,
  Region,
  Settings,
} from "../src";
import type { Item, Loadout as LoadoutData, LoadoutItemId, UnitEquipment } from "../src";
import { LoadoutRegistry } from "../src/content/LoadoutRegistry";
import { SampleNpc } from "./SampleNpc";
import { SampleDummy } from "./SampleDummy";
import { SampleAnimayaNpc } from "./SampleAnimayaNpc";
import { SampleScene } from "./SampleScene";

export class SampleRegion extends Region {
  constructor(private readonly loadouts: LoadoutData[]) {
    super();
  }

  get initialFacing() {
    return CardinalDirection.NORTH;
  }

  // The cache-composed scene supplies its own terrain. Keep the legacy
  // minimap-textured floor available only for the explicit GLB comparison.
  drawDefaultFloor() {
    return new URLSearchParams(window.location.search).get("static-scene") === "1";
  }

  getName() {
    return "Sample";
  }

  get width(): number {
    return 51;
  }

  get height(): number {
    return 57;
  }

  private createItem(itemId: LoadoutItemId): Item | null {
    if (itemId === null) return null;

    const registeredItem = LoadoutRegistry.get(itemId);
    if (!registeredItem) return null;

    const ItemType = registeredItem.constructor as new () => Item;
    return new ItemType();
  }

  private constructLoadout(loadout: LoadoutData): { equipment: UnitEquipment; inventory: (Item | null)[] } {
    const equipment = {} as Record<keyof UnitEquipment, Item | null>;
    (Object.keys(loadout.equipment) as (keyof UnitEquipment)[]).forEach((slot) => {
      equipment[slot] = this.createItem(loadout.equipment[slot]);
    });

    return {
      equipment: equipment as UnitEquipment,
      inventory: loadout.inventory.map((itemId) => this.createItem(itemId)),
    };
  }

  initialiseRegion(): { player: Player } {
    const player = new Player(this, {
      x: 25,
      y: 25,
    });
    this.addPlayer(player);
    const selectedLoadout = this.loadouts.find(({ name }) => name === Settings.loadout);
    const customLoadout = Settings.customLoadout?.name === selectedLoadout?.name
      ? Settings.customLoadout
      : null;
    const loadout = customLoadout ?? selectedLoadout ?? this.loadouts[0];
    if (loadout) player.setUnitOptions(this.constructLoadout(loadout));

    this.addMob(new SampleNpc(this, { x: 25, y: 20 }, {}));
    this.addMob(new SampleDummy(this, { x: 34, y: 28 }, {}));
    this.addMob(new SampleAnimayaNpc(this, { x: 15, y: 25 }, {}));

    // The cache scene uses raw region-local tile coordinates. Retain the
    // legacy GLB anchor only when explicitly requested for comparison.
    this.addEntity(new SampleScene(this, { x: 0, y: new URLSearchParams(window.location.search).get("static-scene") === "1" ? 48 : 0 }));

    return { player };
  }
}
