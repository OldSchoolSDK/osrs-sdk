import { Equipment, EquipmentTypes } from "../Equipment";
import { Player } from "../Player";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

export class Necklace extends Equipment {
  override get equipSoundId(): number {
    return CACHE_ASSETS.sounds.equipFun.id;
  }

  get type(): EquipmentTypes {
    return EquipmentTypes.NECK;
  }

  assignToPlayer(player: Player) {
    player.equipment.necklace = this;
  }

  unassignToPlayer(player: Player) {
    player.equipment.necklace = null;
  }
  currentEquipment(player: Player): Equipment {
    return player.equipment.necklace;
  }
}
