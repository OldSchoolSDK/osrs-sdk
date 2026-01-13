"use strict";

import { Player } from "./Player";
import { ItemName } from "./ItemName";

export class PlayerRegenTimer {
  player: Player;
  spec: number;
  hitpoint: number;

  constructor(player: Player) {
    this.player = player;
    this.spec = 50;
    this.hitpoint = 100;
  }

  specUsed() {
    if (this.spec <= 0) {
      this.spec = this.getSpecRegenRate();
    }
  }

  getSpecRegenRate(): number {
    // Lightbearer doubles regeneration rate (25 ticks instead of 50)
    if (this.player.equipment.ring && this.player.equipment.ring.itemName === ItemName.LIGHTBEARER) {
      return 25;
    }
    return 50;
  }

  regen() {
    this.specRegen();
    this.hitpointRegen();
  }

  specRegen() {
    this.spec--;
    if (this.spec === 0) {
      this.spec = this.getSpecRegenRate();
      this.player.currentStats.specialAttack += 10;
      this.player.currentStats.specialAttack = Math.min(100, this.player.currentStats.specialAttack);
    }
  }

  hitpointRegen() {
    this.hitpoint--;
    if (this.hitpoint === 0) {
      this.hitpoint = 100;
      const currentHp = this.player.currentStats.hitpoint;
      const lvlHp = this.player.stats.hitpoint;
      const diff = currentHp === lvlHp ? 0 : currentHp > lvlHp ? -1 : 1;
      this.player.currentStats.hitpoint += diff;
    }
  }
}