import { Item } from "./Item";
import { UnitBonuses, UnitEquipment } from "./Unit";
import { SetEffect } from "./SetEffect";
import { Player } from "./Player";
import { DelayedAction } from "./DelayedAction";
import { cacheSound } from "./audio/CacheSoundEffects";
import { Sound, SoundCache } from "./utils/SoundCache";

export enum EquipmentTypes {
  HELMET = "helmet",
  CHEST = "chest",
  LEGS = "legs",
  FEET = "feet",
  GLOVES = "gloves",
  WEAPON = "weapon",
  OFFHAND = "offhand",
  AMMO = "ammo",
  BACK = "back",
  NECK = "neck",
  RING = "ring",
}

// maybe we ought to rename the values instead?
export const EQUIPMENT_TYPE_TO_SLOT: {[equipmentType in EquipmentTypes]: keyof UnitEquipment} = {
  [EquipmentTypes.HELMET]: 'helmet',
  [EquipmentTypes.CHEST]: "chest",
  [EquipmentTypes.LEGS]: "legs",
  [EquipmentTypes.FEET]: "feet",
  [EquipmentTypes.GLOVES]: "gloves",
  [EquipmentTypes.WEAPON]: "weapon",
  [EquipmentTypes.OFFHAND]: "offhand",
  [EquipmentTypes.AMMO]: "ammo",
  [EquipmentTypes.BACK]: "cape",
  [EquipmentTypes.NECK]: "necklace",
  [EquipmentTypes.RING]: "ring"
};

export class Equipment extends Item {
  bonuses: UnitBonuses;

  constructor() {
    super();
    this.defaultAction = "Equip";
    this.setStats();
  }

  get hasInventoryLeftClick(): boolean {
    return true;
  }

  inventoryLeftClick(player: Player) {
    const currentItem = this.currentEquipment(player) || null;
    const openInventorySlots = player.openInventorySlots();
    openInventorySlots.unshift(player.inventory.indexOf(this));
    this.assignToPlayer(player);
    player.inventory[openInventorySlots.shift()] = currentItem;
    player.equipmentChanged();
    this.scheduleEquipmentSound();
  }

  /** Cache sound effect to play when this item is equipped, or null for silence. */
  get equipSoundId(): number | null {
    return null;
  }

  /**
   * Equip actions are processed on a world tick. Keep the sound on that same
   * tick boundary instead of playing directly from the browser click handler.
   */
  protected scheduleEquipmentSound() {
    if (this.equipSoundId === null) {
      return;
    }

    const sound = new Sound(cacheSound(this.equipSoundId), 0.1);
    DelayedAction.registerDelayedAction(new DelayedAction(() => SoundCache.play(sound), 0));
  }

  get equipmentSetEffect(): typeof SetEffect {
    return null;
  }

  setStats() {
    // throw new Error('stats must be set, none were found')
  }

  currentEquipment(player: Player): Equipment {
    return null;
  }

  assignToPlayer(player: Player) {
    throw new Error("not able to assign to unit equipment");
  }

  unassignToPlayer(player: Player) {
    throw new Error("not able to unassign to unit equipment");
  }

  unequip(player: Player) {
    const openInventorySlots = player.openInventorySlots();
    if (openInventorySlots.length === 0) {
      return;
    }
    this.unassignToPlayer(player);
    player.equipmentChanged();
    player.inventory[openInventorySlots.shift()] = this;
    this.scheduleEquipmentSound();
  }

  get type(): EquipmentTypes {
    throw new Error("equipment must have a type");
  }

  updateBonuses(gear: Item[]) {
    // update bonuses based on other items that have been equipped
  }

  /**
   * name of the model to render for this item
   */
  get model(): string | null {
    return null;
  }

  /**
   * index of animation to use for attacks if possible
   */
  get attackAnimationId(): number | null {
    return null;
  }
}
