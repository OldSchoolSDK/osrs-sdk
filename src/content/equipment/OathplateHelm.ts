import { Helmet } from "../../sdk/gear/Helmet";
import { ImageLoader } from "../../sdk/utils/ImageLoader";
import InventImage from "../../assets/images/equipment/Oathplate_helm.png";
import { ItemName } from "../../sdk/ItemName";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

export class OathplateHelm extends Helmet {
  get cacheItemId(): number { return CACHE_ASSETS.items.oathplateHelm.id; }
  inventorySprite: HTMLImageElement = ImageLoader.createImage(this.inventoryImage);

  get inventoryImage() {
    return InventImage;
  }

  get itemName(): ItemName {
    return ItemName.OATHPLATE_HELM;
  }

  get weight(): number {
    return 2.721;
  }

  constructor() {
    super();
    this.bonuses = {
      attack: { stab: 0, slash: 10, crush: 0, magic: -2, range: -7 },
      defence: { stab: 50, slash: 72, crush: 45, magic: 0, range: 50 },
      other: { meleeStrength: 6, rangedStrength: 0, magicDamage: 0, prayer: 0 },
      targetSpecific: { undead: 0, slayer: 0 },
    };
  }
}
