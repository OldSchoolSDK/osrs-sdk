import { ImageLoader } from "../../sdk/utils/ImageLoader";
import InventImage from "../../assets/images/equipment/Saradomin_chaps.png";
import { Legs } from "../../sdk/gear/Legs";
import { ItemName } from "../../sdk/ItemName";

import { CACHE_ASSETS } from "../../assets/CacheAssets";
export class SaradominChaps extends Legs {
  get cacheItemId(): number {
    return CACHE_ASSETS.items.saradominChaps.id;
  }
  inventorySprite: HTMLImageElement = ImageLoader.createImage(this.inventoryImage);

  get inventoryImage() {
    return InventImage;
  }
  get itemName(): ItemName {
    return ItemName.SARADOMIN_D_HIDE_CHAPS;
  }

  get weight(): number {
    return 5;
  }

  constructor() {
    super();
    this.bonuses = {
      attack: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: -10,
        range: 17,
      },
      defence: {
        stab: 31,
        slash: 25,
        crush: 33,
        magic: 28,
        range: 31,
      },
      other: {
        meleeStrength: 0,
        rangedStrength: 0,
        magicDamage: 0,
        prayer: 1,
      },
      targetSpecific: {
        undead: 0,
        slayer: 0,
      },
    };
  }
}
