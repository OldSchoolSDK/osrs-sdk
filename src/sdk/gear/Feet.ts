import { Equipment, EquipmentTypes } from "../Equipment";
import { Player } from "../Player";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

export class Feet extends Equipment {
  override get equipSoundId(): number {
    return CACHE_ASSETS.sounds.equipFeet.id;
  }

  get type(): EquipmentTypes {
    return EquipmentTypes.FEET;
  }

  assignToPlayer(player: Player) {
    player.equipment.feet = this;
  }
  unassignToPlayer(player: Player) {
    player.equipment.feet = null;
  }

  currentEquipment(player: Player): Equipment {
    return player.equipment.feet;
  }
}
