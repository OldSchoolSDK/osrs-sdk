import OneDose from "../../assets/images/potions/Armadyl_brew_1.png";
import TwoDose from "../../assets/images/potions/Armadyl_brew_2.png";
import ThreeDose from "../../assets/images/potions/Armadyl_brew_3.png";
import FourDose from "../../assets/images/potions/Armadyl_brew_4.png";
import Vial from "../../assets/images/potions/Vial.png";
import { ItemName } from "../../sdk/ItemName";
import { Player } from "../../sdk/Player";
import { Potion } from "../../sdk/gear/Potion";
import { ImageLoader } from "../../sdk/utils/ImageLoader";

export class ArmadylBrew extends Potion {
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
    return ItemName.ARMADYL_BREW;
  }

  drink(player: Player) {
    super.drink(player);

    // Heal: 10% + 2 (less than Sara brew's 15% + 2)
    const healAmount = Math.floor(player.stats.hitpoint * 0.10) + 2;
    player.currentStats.hitpoint += healAmount;
    player.currentStats.hitpoint = Math.max(
      1,
      Math.min(player.currentStats.hitpoint, player.stats.hitpoint + healAmount),
    );

    // Boost Range: 10% + 4
    const rangeBoost = Math.floor(player.stats.range * 0.10) + 4;
    player.currentStats.range += rangeBoost;
    player.currentStats.range = Math.max(
      1,
      Math.min(player.currentStats.range, player.stats.range + rangeBoost),
    );

    // Nerf Attack: 10% + 2
    const attackNerf = Math.floor(player.currentStats.attack * 0.1) + 2;
    player.currentStats.attack -= attackNerf;
    player.currentStats.attack = Math.max(1, Math.min(player.currentStats.attack, player.stats.attack + attackNerf));

    // Nerf Strength: 10% + 2
    const strengthNerf = Math.floor(player.currentStats.strength * 0.1) + 2;
    player.currentStats.strength -= strengthNerf;
    player.currentStats.strength = Math.max(
      1,
      Math.min(player.currentStats.strength, player.stats.strength + strengthNerf),
    );

    // Nerf Defence: 10% + 2 (unlike Sara brew which boosts it)
    const defenceNerf = Math.floor(player.currentStats.defence * 0.1) + 2;
    player.currentStats.defence -= defenceNerf;
    player.currentStats.defence = Math.max(
      1,
      Math.min(player.currentStats.defence, player.stats.defence + defenceNerf),
    );

    // Nerf Magic: 10% + 2
    const magicNerf = Math.floor(player.currentStats.magic * 0.1) + 2;
    player.currentStats.magic -= magicNerf;
    player.currentStats.magic = Math.max(1, Math.min(player.currentStats.magic, player.stats.magic + magicNerf));
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