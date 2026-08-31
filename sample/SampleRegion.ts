import {
  AmuletOfTorture,
  AbyssalTentacle,
  ArmadylBrew,
  BastionPotion,
  BlackChinchompa,
  BladeOfSaeldor,
  Blowpipe,
  BowOfFaerdhinen,
  CardinalDirection,
  DizanasQuiver,
  DragonArrows,
  FerociousGloves,
  InfernalCape,
  MasoriBodyF,
  MasoriChapsF,
  MasoriMaskF,
  NecklaceOfAnguish,
  NoxiousHalberd,
  AncientStaff,
  KodaiWand,
  PegasianBoots,
  Player,
  PrimordialBoots,
  Region,
  SaradominBrew,
  ScytheOfVitur,
  StaminaPotion,
  SuperRestore,
  TorvaFullhelm,
  TorvaPlatebody,
  TorvaPlatelegs,
  TwistedBow,
  UltorRing,
} from "../src";
import { SampleNpc } from "./SampleNpc";
import { SampleDummy } from "./SampleDummy";
import { SampleAnimayaNpc } from "./SampleAnimayaNpc";
import { SampleScene } from "./SampleScene";

export class SampleRegion extends Region {
  get initialFacing() {
    return CardinalDirection.NORTH;
  }

  // The cache-composed scene supplies its own terrain. Keep the legacy
  // minimap-textured floor available only for the explicit GLB comparison.
  drawDefaultFloor() {
    return new URLSearchParams(window.location.search).get("static-scene") === "1";
  }

  getName() {
    return "Sample";
  }

  get width(): number {
    return 51;
  }

  get height(): number {
    return 57;
  }

  initialiseRegion(): { player: Player } {
    const player = new Player(this, {
      x: 25,
      y: 25,
    });
    this.addPlayer(player);
    const loadout = {
      equipment: {
        weapon: new ScytheOfVitur(),
        offhand: null,
        helmet: new TorvaFullhelm(),
        necklace: new AmuletOfTorture(),
        cape: new InfernalCape(),
        ammo: new DragonArrows(),
        chest: new TorvaPlatebody(),
        legs: new TorvaPlatelegs(),
        feet: new PrimordialBoots(),
        gloves: new FerociousGloves(),
        ring: new UltorRing(),
      },
      inventory: [
        // Every cache-backed weapon currently implemented by the SDK.
        new AbyssalTentacle(),
        new AncientStaff(),
        new BlackChinchompa(),
        new BladeOfSaeldor(),
        new Blowpipe(),
        new BowOfFaerdhinen(),
        new KodaiWand(),
        new NoxiousHalberd(),
        new TwistedBow(),
        // Cache-backed armour and equipment.
        new MasoriBodyF(),
        new DizanasQuiver(),
        new PegasianBoots(),
        new NecklaceOfAnguish(),
        new MasoriChapsF(),
        new MasoriMaskF(),
        new SaradominBrew(),
        new SaradominBrew(),
        new SuperRestore(),
        new SuperRestore(),
        new BastionPotion(),
        new StaminaPotion(),
        new ArmadylBrew(),
        new BastionPotion(),
        new StaminaPotion(),
        new ArmadylBrew(),
      ],
    };
    player.setUnitOptions(loadout);

    this.addMob(new SampleNpc(this, { x: 25, y: 20 }, {}));
    this.addMob(new SampleDummy(this, { x: 34, y: 28 }, {}));
    this.addMob(new SampleAnimayaNpc(this, { x: 15, y: 25 }, {}));

    // The cache scene uses raw region-local tile coordinates. Retain the
    // legacy GLB anchor only when explicitly requested for comparison.
    this.addEntity(new SampleScene(this, { x: 0, y: new URLSearchParams(window.location.search).get("static-scene") === "1" ? 48 : 0 }));

    return { player };
  }
}
