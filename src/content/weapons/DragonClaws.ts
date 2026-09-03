import InventoryImage from "../../assets/images/equipment/Dragon_claws.png";
import { AttackStyle, AttackStyleTypes } from "../../sdk/AttackStylesController";
import { AttackBonuses } from "../../sdk/gear/Weapon";
import { ItemName } from "../../sdk/ItemName";
import { Random } from "../../sdk/Random";
import { PlayerAnimationIndices } from "../../sdk/rendering/GLTFAnimationConstants";
import { Unit } from "../../sdk/Unit";
import { MeleeWeapon } from "../../sdk/weapons/MeleeWeapon";
import { ProjectileOptions } from "../../sdk/weapons/Projectile";
import { Sound, SoundCache } from "../../sdk/utils/SoundCache";
import { cacheSound } from "../../sdk/audio/CacheSoundEffects";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

const NORMAL_ATTACK_SOUND_ID = CACHE_ASSETS.sounds.dragonClawsAttack.id;
const SPECIAL_ATTACK_SOUND_ID = CACHE_ASSETS.sounds.dragonClawsSpecialFirst.id;
// TODO: Verify whether these client-side sound cues should instead align to 600 ms game-tick boundaries.
const SPECIAL_ATTACK_FOLLOW_UP_SOUNDS = [
  { id: CACHE_ASSETS.sounds.dragonClawsSpecialSecond.id, delayMs: 300 },
  { id: CACHE_ASSETS.sounds.dragonClawsSpecialThird.id, delayMs: 600 },
  { id: CACHE_ASSETS.sounds.dragonClawsSpecialThird.id, delayMs: 900 },
];
const SOUND_VOLUME = 0.1;

export class DragonClaws extends MeleeWeapon {
  get cacheItemId(): number {
    return CACHE_ASSETS.items.dragonClaws.id;
  }

  constructor() {
    super();
    [NORMAL_ATTACK_SOUND_ID, SPECIAL_ATTACK_SOUND_ID, ...SPECIAL_ATTACK_FOLLOW_UP_SOUNDS.map(({ id }) => id)].forEach(
      (id) => SoundCache.preload(cacheSound(id)),
    );
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
    return CACHE_ASSETS.playerAnimations.dragonClawsAttack.id;
  }

  override get idleAnimationId(): number {
    return CACHE_ASSETS.playerAnimations.idle.id;
  }

  hasSpecialAttack(): boolean {
    return true;
  }

  /** Slice and Dice: four accuracy rolls, then a linked four-hit damage split. */
  specialAttack(from: Unit, to: Unit, bonuses: AttackBonuses = {}, options: ProjectileOptions = {}): boolean {
    bonuses.attackStyle = "slash";
    bonuses.styleBonus = bonuses.styleBonus || 0;
    bonuses.voidMultiplier = bonuses.voidMultiplier || 1;
    bonuses.gearMeleeMultiplier = bonuses.gearMeleeMultiplier || 1;
    bonuses.overallMultiplier = bonuses.overallMultiplier || 1;
    this._calculatePrayerEffects(from, to, bonuses);

    const protectedFromMelee = this.isBlockable(from, to, bonuses);
    let firstSuccessfulHit = -1;
    if (!protectedFromMelee) {
      const hitChance = this._hitChance(from, to, bonuses);
      for (let hit = 0; hit < 4; hit++) {
        if (Random.get() <= hitChance) {
          firstSuccessfulHit = hit;
          break;
        }
      }
    }

    const maxHit = this._maxHit(from, to, bonuses);
    const rollBetween = (minimum: number, maximum: number) => {
      const min = Math.max(0, Math.floor(minimum));
      const max = Math.max(min, Math.floor(maximum));
      return from.forceMaxDamageRollsOnNextAttack ? max : min + Math.floor(Random.get() * (max - min + 1));
    };

    let hits: number[];
    if (firstSuccessfulHit === 0) {
      const first = rollBetween(maxHit / 2, maxHit - 1);
      const second = Math.floor(first / 2);
      const third = Math.floor(second / 2);
      hits = [first, second, third, third + 1];
    } else if (firstSuccessfulHit === 1) {
      const second = rollBetween((3 * maxHit) / 8, (7 * maxHit) / 8);
      const third = Math.floor(second / 2);
      hits = [0, second, third, third + 1];
    } else if (firstSuccessfulHit === 2) {
      const third = rollBetween(maxHit / 4, (3 * maxHit) / 4);
      hits = [0, 0, third, third + 1];
    } else if (firstSuccessfulHit === 3) {
      hits = [0, 0, 0, rollBetween(maxHit / 4, (5 * maxHit) / 4)];
    } else if (Random.get() < 2 / 3) {
      const patterns = [
        [1, 1, 0, 0],
        [0, 0, 1, 1],
        [1, 0, 1, 0],
        [0, 1, 0, 1],
      ];
      hits = patterns[Math.floor(Random.get() * patterns.length)];
    } else {
      hits = [0, 0, 0, 0];
    }

    hits.forEach((damage, hit) => {
      this.damageRoll = damage;
      this.damage = damage;
      this.grantXp(from, to);
      this.registerProjectile(from, to, bonuses, {
        ...options,
        sound: hit === 0 ? this.specialAttackSound : null,
        setDelay: hit < 2 ? 1 : 2,
      });
    });
    SPECIAL_ATTACK_FOLLOW_UP_SOUNDS.forEach(({ id, delayMs }) => {
      setTimeout(() => SoundCache.play(new Sound(cacheSound(id), SOUND_VOLUME)), delayMs);
    });
    this.lastHitHit = firstSuccessfulHit >= 0;
    if (this.lastHitHit) from.consumeMaxDamageRollsOnNextAttack();
    return true;
  }

  get specialAttackSound() {
    return new Sound(cacheSound(SPECIAL_ATTACK_SOUND_ID), SOUND_VOLUME);
  }

  get attackSound() {
    return new Sound(cacheSound(NORMAL_ATTACK_SOUND_ID), SOUND_VOLUME);
  }
}
