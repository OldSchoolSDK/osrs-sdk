import { Equipment, EquipmentTypes } from "../Equipment";
import { Player } from "../Player";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

export class Cape extends Equipment {
  override get equipSoundId(): number {
    return CACHE_ASSETS.sounds.equipFun.id;
  }

  get type(): EquipmentTypes {
    return EquipmentTypes.BACK;
  }

  assignToPlayer(player: Player) {
    player.equipment.cape = this;
  }
  unassignToPlayer(player: Player) {
    player.equipment.cape = null;
  }

  currentEquipment(player: Player): Equipment {
    return player.equipment.cape;
  }
}
