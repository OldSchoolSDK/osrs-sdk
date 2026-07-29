import { ImageLoader } from "../../sdk/utils/ImageLoader";
import InventImage from "../../assets/images/equipment/Dragon_defender.png";
import { Offhand } from "../../sdk/gear/Offhand";
import { ItemName } from "../../sdk/ItemName";
import { Assets } from "../../sdk/utils/Assets";

export class DragonDefender extends Offhand {
  inventorySprite: HTMLImageElement = ImageLoader.createImage(this.inventoryImage);

  get inventoryImage() {
    return InventImage;
  }
  get itemName(): ItemName {
    return ItemName.DRAGON_DEFENDER;
  }
  get weight(): number {
    return 0.453;
  }

  constructor() {
    super();
    this.bonuses = {
      attack: {
        stab: 25,
        slash: 24,
        crush: 23,
        magic: -3,
        range: -2,
      },
      defence: {
        stab: 25,
        slash: 24,
        crush: 23,
        magic: -3,
        range: -2,
      },
      other: {
        meleeStrength: 6,
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

  Model = Assets.getAssetUrl("models/player_dragon_defender.glb");
  override get model() {
    return this.Model;
  }
}
