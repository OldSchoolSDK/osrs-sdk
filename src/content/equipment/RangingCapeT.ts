import { ImageLoader } from "../../sdk/utils/ImageLoader";
import InventImage from "../../assets/images/equipment/Ranging_cape_t.png";
import { Cape } from "../../sdk/gear/Cape";
import { ItemName } from "../../sdk/ItemName";
import { Assets } from "../../sdk";

export class RangingCapeT extends Cape {
  inventorySprite: HTMLImageElement = ImageLoader.createImage(this.inventoryImage);

  get inventoryImage() {
    return InventImage;
  }
  get itemName(): ItemName {
    return ItemName.RANGING_CAPE_T;
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
        magic: 0,
        range: 0,
      },
      defence: {
        stab: 9,
        slash: 9,
        crush: 9,
        magic: 9,
        range: 9,
      },
      other: {
        meleeStrength: 0,
        rangedStrength: 0,
        magicDamage: 0,
        prayer: 4,
      },
      targetSpecific: {
        undead: 0,
        slayer: 0,
      },
    };
  }

  // model is buggy, using avas model
  Model = Assets.getAssetUrl("models/player_ava_s_accumulator.glb");
  override get model() {
    return this.Model;
  }
}
