import { Feet } from "../../sdk/gear/Feet";
import { ImageLoader } from "../../sdk/utils/ImageLoader";
import InventImage from "../../assets/images/equipment/Avernic_treads_(max).png";
import { ItemName } from "../../sdk/ItemName";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

export class AvernicTreadsMax extends Feet {
  get cacheItemId(): number { return CACHE_ASSETS.items.avernicTreadsMax.id; }
  inventorySprite: HTMLImageElement = ImageLoader.createImage(this.inventoryImage);

  get inventoryImage() {
    return InventImage;
  }

  get itemName(): ItemName {
    return ItemName.AVERNIC_TREADS_MAX;
  }

  get weight(): number {
    return 1.814;
  }

  constructor() {
    super();
    this.bonuses = {
      attack: { stab: 5, slash: 5, crush: 5, magic: 11, range: 15 },
      defence: { stab: 21, slash: 25, crush: 25, magic: 10, range: 10 },
      other: { meleeStrength: 4, rangedStrength: 2, magicDamage: 0.01, prayer: 0 },
      targetSpecific: { undead: 0, slayer: 0 },
    };
  }
}
