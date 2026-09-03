import { Chest } from "../../sdk/gear/Chest";
import { ImageLoader } from "../../sdk/utils/ImageLoader";
import InventImage from "../../assets/images/equipment/Oathplate_chest.png";
import { ItemName } from "../../sdk/ItemName";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

/** The OSRS item is named "Oathplate chest"; it occupies the body slot. */
export class OathplateChest extends Chest {
  get cacheItemId(): number { return CACHE_ASSETS.items.oathplateChest.id; }
  inventorySprite: HTMLImageElement = ImageLoader.createImage(this.inventoryImage);

  get inventoryImage() {
    return InventImage;
  }

  get itemName(): ItemName {
    return ItemName.OATHPLATE_CHEST;
  }

  get weight(): number {
    return 9.979;
  }

  constructor() {
    super();
    this.bonuses = {
      attack: { stab: 0, slash: 16, crush: 0, magic: -16, range: -18 },
      defence: { stab: 105, slash: 128, crush: 100, magic: -5, range: 112 },
      other: { meleeStrength: 4, rangedStrength: 0, magicDamage: 0, prayer: 0 },
      targetSpecific: { undead: 0, slayer: 0 },
    };
  }
}
