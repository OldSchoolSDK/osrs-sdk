import { Helmet } from "../../sdk/gear/Helmet";
import { ImageLoader } from "../../sdk/utils/ImageLoader";
import InventImage from "../../assets/images/equipment/Guthix_mitre.png";
import { ItemName } from "../../sdk/ItemName";
import { Assets } from "../../sdk";

export class GuthixMitre extends Helmet {
  inventorySprite: HTMLImageElement = ImageLoader.createImage(this.inventoryImage);

  get itemName(): ItemName {
    return ItemName.GUTHIX_MITRE;
  }
  get weight(): number {
    return 0.3;
  }

  get inventoryImage() {
    return InventImage;
  }
  constructor() {
    super();
    this.bonuses = {
      attack: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: 4,
        range: 0,
      },
      defence: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: 4,
        range: 0,
      },
      other: {
        meleeStrength: 0,
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
  //todo: model, was buggy
  // Model = Assets.getAssetUrl("models/player_armadyl_mitre.glb");
  // override get model() {
  //   return this.Model;
  // }
}
