import { ImageLoader } from "../../sdk/utils/ImageLoader";
import InventImage from "../../assets/images/equipment/Seeking_dragon_arrow.png";
import { Ammo } from "../../sdk/gear/Ammo";
import { ItemName } from "../../sdk/ItemName";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

/** Seeking dragon arrows. The passive minimum-hit effect is intentionally not simulated. */
export class SeekingDragonArrows extends Ammo {
  override get equipSoundId(): number {
    return CACHE_ASSETS.sounds.equipWood.id;
  }

  get cacheItemId(): number { return CACHE_ASSETS.items.seekingDragonArrows.id; }
  inventorySprite: HTMLImageElement = ImageLoader.createImage(this.inventoryImage);

  get inventoryImage() {
    return InventImage;
  }

  get weight(): number {
    return 0;
  }

  get itemName(): ItemName {
    return ItemName.SEEKING_DRAGON_ARROWS;
  }

  constructor() {
    super();
    this.bonuses = {
      attack: { stab: 0, slash: 0, crush: 0, magic: 0, range: 20 },
      defence: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      other: { meleeStrength: 0, rangedStrength: 60, magicDamage: 0, prayer: 0 },
      targetSpecific: { undead: 0, slayer: 0 },
    };
  }
}
