import { ImageLoader } from "../../sdk/utils/ImageLoader";
import InventImage from "../../assets/images/equipment/Venator_ring.png";
import { Ring } from "../../sdk/gear/Ring";
import { ItemName } from "../../sdk/ItemName";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

/** Venator ring. Its passive effects are intentionally not simulated. */
export class VenatorRing extends Ring {
  get cacheItemId(): number { return CACHE_ASSETS.items.venatorRing.id; }
  inventorySprite: HTMLImageElement = ImageLoader.createImage(this.inventoryImage);
  get inventoryImage() { return InventImage; }
  get itemName(): ItemName { return ItemName.VENATOR_RING; }
  get weight(): number { return 0.01; }

  constructor() {
    super();
    this.bonuses = {
      attack: { stab: 0, slash: 0, crush: 0, magic: 0, range: 10 },
      defence: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      other: { meleeStrength: 0, rangedStrength: 2, magicDamage: 0, prayer: 2 },
      targetSpecific: { undead: 0, slayer: 0 },
    };
  }
}
