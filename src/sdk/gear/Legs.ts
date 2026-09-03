import { Equipment, EquipmentTypes } from "../Equipment";
import { Player } from "../Player";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

export class Legs extends Equipment {
  override get equipSoundId(): number {
    return CACHE_ASSETS.sounds.equipMetalLegs.id;
  }

  get type(): EquipmentTypes {
    return EquipmentTypes.LEGS;
  }

  assignToPlayer(player: Player) {
    player.equipment.legs = this;
  }

  unassignToPlayer(player: Player) {
    player.equipment.legs = null;
  }
  currentEquipment(player: Player): Equipment {
    return player.equipment.legs;
  }
}
