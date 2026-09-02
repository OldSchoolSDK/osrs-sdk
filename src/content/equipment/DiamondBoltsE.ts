import { ImageLoader } from "../../sdk/utils/ImageLoader";
import InventImage from "../../assets/images/equipment/Diamond_bolts_e_5.png";
import { Ammo } from "../../sdk/gear/Ammo";
import { ItemName } from "../../sdk/ItemName";

import { CACHE_ASSETS } from "../../assets/CacheAssets";
export class DiamondBoltsE extends Ammo {
  get cacheItemId(): number {
    return CACHE_ASSETS.items.diamondBoltsE.id;
  }
  inventorySprite: HTMLImageElement = ImageLoader.createImage(this.inventoryImage);

  get inventoryImage() {
    return InventImage;
  }
  get weight(): number {
    return 0;
  }

  get itemName(): ItemName {
    return ItemName.DIAMOND_BOLTS_E;
  }

  constructor() {
    super();
    this.bonuses = {
      attack: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: 0,
        range: 0,
      },
      defence: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: 0,
        range: 0,
      },
      other: {
        meleeStrength: 0,
        rangedStrength: 105,
        magicDamage: 0,
        prayer: 0,
      },
      targetSpecific: {
        undead: 0,
        slayer: 0,
      },
    };
  }
}
