import InventImage from "../../assets/images/equipment/Amulet_of_fury.png";
import { Necklace } from "../../sdk/gear/Necklace";
import { ItemName } from "../../sdk/ItemName";
import { Assets } from "../../sdk/utils/Assets";
import { ImageLoader } from "../../sdk/utils/ImageLoader";

import { CACHE_ASSETS } from "../../assets/CacheAssets";
export class AmuletOfFury extends Necklace {
  get cacheItemId(): number {
    return CACHE_ASSETS.items.amuletOfFury.id;
  }
  inventorySprite: HTMLImageElement = ImageLoader.createImage(this.inventoryImage);

  get inventoryImage() {
    return InventImage;
  }
  get itemName(): ItemName {
    return ItemName.AMULET_OF_FURY;
  }
  get weight(): number {
    return 0.01;
  }

  constructor() {
    super();
    this.bonuses = {
      attack: {
        stab: 10,
        slash: 10,
        crush: 10,
        magic: 10,
        range: 10,
      },
      defence: {
        stab: 15,
        slash: 15,
        crush: 15,
        magic: 15,
        range: 15,
      },
      other: {
        meleeStrength: 8,
        rangedStrength: 0,
        magicDamage: 0,
        prayer: 5,
      },
      targetSpecific: {
        undead: 0,
        slayer: 0,
      },
    };
  }

  Model = Assets.getAssetUrl("models/player_amulet_of_fury.glb");
  override get model() {
    return this.Model;
  }
}
