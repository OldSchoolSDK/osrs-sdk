import { ImageLoader } from "../../sdk/utils/ImageLoader";
import InventImage from "../../assets/images/equipment/Hueycoatl_hide_chaps.png";
import { Legs } from "../../sdk/gear/Legs";
import { ItemName } from "../../sdk/ItemName";
import { Assets } from "../../sdk";

export class HueycoatlHideChaps extends Legs {
  inventorySprite: HTMLImageElement = ImageLoader.createImage(this.inventoryImage);

  get inventoryImage() {
    return InventImage;
  }
  get itemName(): ItemName {
    return ItemName.HUEYCOATL_HIDE_CHAPS;
  }

  get weight(): number {
    return 5.443;
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
        magic: 30,
        range: 31,
      },
      other: {
        meleeStrength: 0,
        rangedStrength: 0,
        magicDamage: 0,
        prayer: 2,
      },
      targetSpecific: {
        undead: 0,
        slayer: 0,
      },
    };
  }

  Model = Assets.getAssetUrl("models/player_hueycoatl_hide_chaps.glb");
  override get model() {
    return this.Model;
  }
}
