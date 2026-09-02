import { ImageLoader } from "../../sdk/utils/ImageLoader";
import InventImage from "../../assets/images/equipment/Crystal_body.png";
import { Chest } from "../../sdk/gear/Chest";
import { ItemName } from "../../sdk/ItemName";
import { Assets } from "../../sdk/utils/Assets";

import { CACHE_ASSETS } from "../../assets/CacheAssets";
export class CrystalBody extends Chest {
  get cacheItemId(): number {
    return CACHE_ASSETS.items.crystalBody.id;
  }
  inventorySprite: HTMLImageElement = ImageLoader.createImage(this.inventoryImage);

  get inventoryImage() {
    return InventImage;
  }
  get itemName(): ItemName {
    return ItemName.CRYSTAL_BODY;
  }

  get weight(): number {
    return 2;
  }

  constructor() {
    super();
    this.bonuses = {
      attack: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: -18,
        range: 31,
      },
      defence: {
        stab: 46,
        slash: 38,
        crush: 48,
        magic: 44,
        range: 68,
      },
      other: {
        meleeStrength: 0,
        rangedStrength: 0,
        magicDamage: 0,
        prayer: 3,
        crystalAccuracy: 0.15,
        crystalDamage: 0.075,
      },
      targetSpecific: {
        undead: 0,
        slayer: 0,
      },
    };
  }

  Model = Assets.getAssetUrl("models/player_crystal_body.glb");
  override get model() {
    return this.Model;
  }
}
