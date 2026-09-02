import { ImageLoader } from "../../sdk/utils/ImageLoader";
import InventImage from "../../assets/images/equipment/Ahrims_robetop.png";
import { Chest } from "../../sdk/gear/Chest";
import { ItemName } from "../../sdk/ItemName";

import { CACHE_ASSETS } from "../../assets/CacheAssets";
export class AhrimsRobetop extends Chest {
  get cacheItemId(): number {
    return CACHE_ASSETS.items.ahrimsRobeTop.id;
  }
  inventorySprite: HTMLImageElement = ImageLoader.createImage(this.inventoryImage);

  get inventoryImage() {
    return InventImage;
  }
  get itemName(): ItemName {
    return ItemName.AHRIMS_ROBETOP;
  }

  get weight(): number {
    return 4.535;
  }

  constructor() {
    super();
    this.bonuses = {
      attack: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: +22,
        range: -7,
      },
      defence: {
        stab: 33,
        slash: 30,
        crush: 36,
        magic: 22,
        range: 0,
      },
      other: {
        meleeStrength: 0,
        rangedStrength: 0,
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
