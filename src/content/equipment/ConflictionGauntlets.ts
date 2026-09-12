import { ImageLoader } from "../../sdk/utils/ImageLoader";
import InventImage from "../../assets/images/equipment/Confliction_gauntlets.png";
import { Gloves } from "../../sdk/gear/Gloves";
import { ItemName } from "../../sdk/ItemName";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

/** Raw equipment bonuses for the confliction gauntlets.
 *
 * The gauntlets' missed-hit accuracy reroll is intentionally not modelled;
 * this class only describes their item stats and cache model.
 */
export class ConflictionGauntlets extends Gloves {
  get cacheItemId(): number {
    return CACHE_ASSETS.items.conflictionGauntlets.id;
  }

  inventorySprite: HTMLImageElement = ImageLoader.createImage(this.inventoryImage);

  get inventoryImage() {
    return InventImage;
  }

  get itemName(): ItemName {
    return ItemName.CONFLICTION_GAUNTLETS;
  }

  get weight(): number {
    return 0.226;
  }

  constructor() {
    super();
    this.bonuses = {
      attack: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: 20,
        range: -4,
      },
      defence: {
        stab: 15,
        slash: 18,
        crush: 7,
        magic: 5,
        range: 5,
      },
      other: {
        meleeStrength: 0,
        rangedStrength: 0,
        magicDamage: 0.07,
        prayer: 2,
      },
      targetSpecific: {
        undead: 0,
        slayer: 0,
      },
    };
  }
}
