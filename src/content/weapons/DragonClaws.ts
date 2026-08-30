import InventoryImage from "../../assets/images/equipment/Dragon_claws.png";
import { AttackStyle, AttackStyleTypes } from "../../sdk/AttackStylesController";
import { ItemName } from "../../sdk/ItemName";
import { PlayerAnimationIndices } from "../../sdk/rendering/GLTFAnimationConstants";
import { MeleeWeapon } from "../../sdk/weapons/MeleeWeapon";

export class DragonClaws extends MeleeWeapon {
  get cacheItemId(): number {
    return 13652;
  }

  constructor() {
    super();
    this.bonuses = {
      attack: { stab: 41, slash: 57, crush: -4, magic: -4, range: 0 },
      defence: { stab: 13, slash: 26, crush: 7, magic: -4, range: 0 },
      other: { meleeStrength: 56, rangedStrength: 0, magicDamage: 0, prayer: 0 },
      targetSpecific: { undead: 0, slayer: 0 },
    };
  }

  get weight(): number {
    return 0.453;
  }

  attackStyles() {
    return [AttackStyle.ACCURATE, AttackStyle.AGGRESSIVESLASH, AttackStyle.STAB, AttackStyle.DEFENSIVE];
  }

  attackStyleCategory(): AttackStyleTypes {
    return AttackStyleTypes.SLASHSWORD;
  }

  defaultStyle(): AttackStyle {
    return AttackStyle.AGGRESSIVESLASH;
  }

  get itemName(): ItemName {
    return ItemName.DRAGON_CLAWS;
  }

  get attackRange(): number {
    return 1;
  }

  get attackSpeed(): number {
    return 4;
  }

  get inventoryImage() {
    return InventoryImage;
  }

  override get attackAnimationId(): number {
    return PlayerAnimationIndices.SwordSlash;
  }

  override get specialAttackAnimationId(): number {
    return 7514;
  }

  override get idleAnimationId(): number {
    return 808;
  }
}
