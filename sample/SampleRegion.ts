import {
  CardinalDirection,
  Manticore,
  Player,
  Region,
} from "../src";
import type { Loadout as LoadoutData } from "../src";
import { SampleNpc } from "./SampleNpc";
import { SamplePillar } from "./SamplePillar";
import { SampleAnimayaNpc } from "./SampleAnimayaNpc";
import { SampleScene } from "./SampleScene";
import { JavelinColossus } from "./JavelinColossus";
import { SampleSmallNpc } from "./SampleSmallNpc";
import { SampleMinotaur } from "./SampleMinotaur";

export class SampleRegion extends Region {
  constructor(loadouts: LoadoutData[]) {
    super(loadouts);
  }

  get initialFacing() {
    return CardinalDirection.NORTH;
  }

  drawDefaultFloor() {
    return false;
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

    const sampleNpc = new SampleNpc(this, { x: 40, y: 30 }, {});
    this.addMob(sampleNpc);
    this.setBoss(sampleNpc);

    this.addEntity(new SamplePillar(this, { x: 40, y: 28 }));

    const northWestPillarLocation = { x: 24, y: 22 };
    this.addEntity(new SamplePillar(this, { ...northWestPillarLocation }, false));
    this.addMob(new JavelinColossus(this, { x: northWestPillarLocation.x + 3, y: northWestPillarLocation.y }));
    this.addMob(new SampleMinotaur(this, { x: northWestPillarLocation.x, y: northWestPillarLocation.y - 5 }));
    this.addMob(new SampleAnimayaNpc(this, { x: 15, y: 35 }, { aggro: player }));
    this.addMob(new Manticore(this, { x: 25, y: 34 }));
    this.addMob(new SampleSmallNpc(this, { x: 28, y: 35 }));
    this.addMob(new SampleSmallNpc(this, { x: 29, y: 35 }));

    this.addEntity(new SampleScene(this, { x: 0, y: 0 }));

    return { player };
  }
}
