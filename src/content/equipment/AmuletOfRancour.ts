import { Necklace } from "../../sdk/gear/Necklace";
import { ImageLoader } from "../../sdk/utils/ImageLoader";
import InventImage from "../../assets/images/equipment/Amulet_of_rancour.png";
import { ItemName } from "../../sdk/ItemName";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

export class AmuletOfRancour extends Necklace {
  get cacheItemId(): number { return CACHE_ASSETS.items.amuletOfRancour.id; }
  inventorySprite: HTMLImageElement = ImageLoader.createImage(this.inventoryImage);

  get inventoryImage() {
    return InventImage;
  }

  get itemName(): ItemName {
    return ItemName.AMULET_OF_RANCOUR;
  }

  get weight(): number {
    return 0.012;
  }

  constructor() {
    super();
    this.bonuses = {
      attack: { stab: 25, slash: 25, crush: 25, magic: -6, range: -8 },
      defence: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      other: { meleeStrength: 12, rangedStrength: 0, magicDamage: 0, prayer: 2 },
      targetSpecific: { undead: 0, slayer: 0 },
    };
  }
}
