import { Equipment, EquipmentTypes } from "../Equipment";
import { Player } from "../Player";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

export class Gloves extends Equipment {
  override get equipSoundId(): number {
    return CACHE_ASSETS.sounds.equipHands.id;
  }

  get type(): EquipmentTypes {
    return EquipmentTypes.GLOVES;
  }

  assignToPlayer(player: Player) {
    player.equipment.gloves = this;
  }

  unassignToPlayer(player: Player) {
    player.equipment.gloves = null;
  }
  currentEquipment(player: Player): Equipment {
    return player.equipment.gloves;
  }
}
