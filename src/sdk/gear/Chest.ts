import { Equipment, EquipmentTypes } from "../Equipment";
import { Player } from "../Player";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

export class Chest extends Equipment {
  override get equipSoundId(): number {
    return CACHE_ASSETS.sounds.equipMetalBody.id;
  }

  get type(): EquipmentTypes {
    return EquipmentTypes.CHEST;
  }
  assignToPlayer(player: Player) {
    player.equipment.chest = this;
  }

  unassignToPlayer(player: Player) {
    player.equipment.chest = null;
  }
  currentEquipment(player: Player): Equipment {
    return player.equipment.chest;
  }
}
