import { Legs } from "../../sdk/gear/Legs";
import { ImageLoader } from "../../sdk/utils/ImageLoader";
import InventImage from "../../assets/images/equipment/Oathplate_legs.png";
import { ItemName } from "../../sdk/ItemName";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

export class OathplateLegs extends Legs {
  get cacheItemId(): number { return CACHE_ASSETS.items.oathplateLegs.id; }
  inventorySprite: HTMLImageElement = ImageLoader.createImage(this.inventoryImage);

  get inventoryImage() {
    return InventImage;
  }

  get itemName(): ItemName {
    return ItemName.OATHPLATE_LEGS;
  }

  get weight(): number {
    return 9.071;
  }

  constructor() {
    super();
    this.bonuses = {
      attack: { stab: 0, slash: 12, crush: 0, magic: -12, range: -14 },
      defence: { stab: 75, slash: 100, crush: 73, magic: -3, range: 81 },
      other: { meleeStrength: 2, rangedStrength: 0, magicDamage: 0, prayer: 0 },
      targetSpecific: { undead: 0, slayer: 0 },
    };
  }
}
