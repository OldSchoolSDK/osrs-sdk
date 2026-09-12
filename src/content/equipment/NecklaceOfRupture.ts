import { Necklace } from "../../sdk/gear/Necklace";
import { ImageLoader } from "../../sdk/utils/ImageLoader";
import InventImage from "../../assets/images/equipment/Necklace_of_rupture.png";
import { ItemName } from "../../sdk/ItemName";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

/** Necklace of rupture. Its passive effects are intentionally not simulated. */
export class NecklaceOfRupture extends Necklace {
  get cacheItemId(): number { return CACHE_ASSETS.items.necklaceOfRupture.id; }
  inventorySprite: HTMLImageElement = ImageLoader.createImage(this.inventoryImage);

  get inventoryImage() { return InventImage; }
  get itemName(): ItemName { return ItemName.NECKLACE_OF_RUPTURE; }
  get weight(): number { return 0.01; }

  constructor() {
    super();
    this.bonuses = {
      attack: { stab: 0, slash: 0, crush: 0, magic: 0, range: 20 },
      defence: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      other: { meleeStrength: 0, rangedStrength: 8, magicDamage: 0, prayer: 3 },
      targetSpecific: { undead: 0, slayer: 0 },
    };
  }
}
