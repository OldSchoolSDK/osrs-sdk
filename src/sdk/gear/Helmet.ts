import { Equipment, EquipmentTypes } from "../Equipment";
import { Player } from "../Player";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

export class Helmet extends Equipment {
  override get equipSoundId(): number {
    return CACHE_ASSETS.sounds.equipHelmet.id;
  }

  get type(): EquipmentTypes {
    return EquipmentTypes.HELMET;
  }

  assignToPlayer(player: Player) {
    player.equipment.helmet = this;
  }
  unassignToPlayer(player: Player) {
    player.equipment.helmet = null;
  }

  currentEquipment(player: Player): Equipment {
    return player.equipment.helmet;
  }
}
