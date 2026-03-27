import OneDose from "../../assets/images/potions/Prayer_regeneration_potion_1.png";
import TwoDose from "../../assets/images/potions/Prayer_regeneration_potion_2.png";
import ThreeDose from "../../assets/images/potions/Prayer_regeneration_potion_3.png";
import FourDose from "../../assets/images/potions/Prayer_regeneration_potion_4.png";
import Vial from "../../assets/images/potions/Vial.png";
import { ItemName } from "../../sdk/ItemName";
import { Player } from "../../sdk/Player";
import { Potion } from "../../sdk/gear/Potion";
import { ImageLoader } from "../../sdk/utils/ImageLoader";

export class PrayerRegenerationPotion extends Potion {
  oneDose: HTMLImageElement = ImageLoader.createImage(OneDose);
  twoDose: HTMLImageElement = ImageLoader.createImage(TwoDose);
  threeDose: HTMLImageElement = ImageLoader.createImage(ThreeDose);
  fourDose: HTMLImageElement = ImageLoader.createImage(FourDose);

  constructor(doses = 4) {
    super();
    this.doses = doses;
    this.updateInventorySprite();
  }

  get inventoryImage() {
    if (this.doses === 4) {
      return FourDose;
    } else if (this.doses === 3) {
      return ThreeDose;
    } else if (this.doses === 2) {
      return TwoDose;
    } else if (this.doses === 1) {
      return OneDose;
    }
    return Vial;
  }

  get itemName(): ItemName {
    return ItemName.PRAYER_REGENERATION_POTION;
  }

  drink(player: Player) {
    super.drink(player);

    // Add 800 ticks (8 minutes) of prayer regeneration per dose
    // Effect stacks by extending duration
    player.effects.prayerRegeneration = (player.effects.prayerRegeneration || 0) + 800;
  }

  updateInventorySprite() {
    if (this.doses === 4) {
      this.inventorySprite = this.fourDose;
    } else if (this.doses === 3) {
      this.inventorySprite = this.threeDose;
    } else if (this.doses === 2) {
      this.inventorySprite = this.twoDose;
    } else if (this.doses === 1) {
      this.inventorySprite = this.oneDose;
    } else {
      this.inventorySprite = this.vial;
    }
  }
}