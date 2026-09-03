import { Equipment, EquipmentTypes } from "../Equipment";
import { Player } from "../Player";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

export class Ring extends Equipment {
  override get equipSoundId(): number {
    return CACHE_ASSETS.sounds.equipFun.id;
  }

  get type(): EquipmentTypes {
    return EquipmentTypes.RING;
  }

  assignToPlayer(player: Player) {
    player.equipment.ring = this;
  }
  unassignToPlayer(player: Player) {
    player.equipment.ring = null;
  }

  currentEquipment(player: Player): Equipment {
    return player.equipment.ring;
  }
}
