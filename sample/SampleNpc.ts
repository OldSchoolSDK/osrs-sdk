import { Assets, CacheRender, CacheRenderModel, CacheRenderReferences, FallbackModel, GLTFModel, MeleeWeapon, Mob } from "../src";

export class SampleNpc extends Mob {
  override mobName() {
    return "Sample NPC";
  }

  override get combatLevel() {
    return 200;
  }

  override setStats() {
    this.weapons = {
      slash: new MeleeWeapon(),
    };

    this.stats = {
      attack: 50,
      strength: 500,
      defence: 50,
      range: 50,
      magic: 50,
      hitpoint: 500,
    };
    this.currentStats = JSON.parse(JSON.stringify(this.stats));
  }

  override get bonuses() {
    return {
      attack: {
        stab: 0,
        slash: 500,
        crush: 0,
        magic: 0,
        range: 0,
      },
      defence: {
        stab: 65,
        slash: 65,
        crush: 65,
        magic: 30,
        range: 5,
      },
      other: {
        meleeStrength: 40,
        rangedStrength: 0,
        magicDamage: 0,
        prayer: 0,
      },
    };
  }

  override get attackSpeed() {
    return 4;
  }
  
  attackStyleForNewAttack() {
    return "slash";
  }

  get attackRange() {
    return 1;
  }

  get size() {
    return 7;
  }

  // A simple SDK clickbox keeps the sample NPC targetable regardless of the
  // decoded model's triangle layout.
  get clickboxHeight() {
    return this.size;
  }

  get clickboxRadius() {
    return this.size * 0.5;
  }

  create3dModel() {
    if (CacheRender.isConfigured()) {
      // Verzik Vitur's phase-3 definition is pinned by the bundle.
      return new FallbackModel(
        CacheRenderModel.forRenderable(this, CacheRenderReferences.npc(8373)),
        GLTFModel.forRenderable(this, Assets.getAssetUrl("models/verzik.glb")),
      );
    }
    return GLTFModel.forRenderable(this, Assets.getAssetUrl("models/verzik.glb"));
  }
}
