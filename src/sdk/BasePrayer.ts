"use strict";

import { Player } from "./Player";
import { ImageLoader } from "./utils/ImageLoader";

export enum PrayerGroups {
  OVERHEADS = "overheads",
  DEFENCE = "defence",
  STRENGTH = "strength",
  ACCURACY = "accuracy",
  RANGE = "range",
  HEARTS = "hearts",
  PROTECTITEM = "protectitem",
  PRESERVE = "preserve",
}

export class BasePrayer {
  isActive = false; // server-side
  isLit = false; // client-side
  nextActiveState: boolean | null = null; // enqueued server-side
  willPlayOnSound = false;
  willPlayOffSound = false;
  cachedImage: HTMLImageElement;

  constructor() {
    this.deactivate();
  }

  levelRequirement(): number {
    return 99;
  }

  tick() {
    if (this.nextActiveState !== null) {
      this.isActive = this.nextActiveState;
      this.isLit = this.isActive;
      this.nextActiveState = null;
    }
  }

  drainRate(): number {
    throw new Error("prayer does not have proper drain rate");
  }

  // currently only used for overheads
  feature(): string {
    return "";
  }

  get name() {
    return "Protect from Magic";
  }

  get groups(): PrayerGroups[] {
    return [];
  }

  /**
   * Currently only used by Quick-Prayers. UI clicks always go through `toggle`.
   */
  activate(player: Player) {
    if (player.stats.prayer < this.levelRequirement()) {
      return;
    }
    if (!this.isActive || this.nextActiveState === false) this.willPlayOnSound = true;
    this.nextActiveState = true;
    this.handleConflicts(player);
  }

  toggle(player: Player) {
    if (player.stats.prayer < this.levelRequirement()) {
      return;
    }
    if (this.isLit) {
      this.isLit = false;
      this.willPlayOffSound = true;
    } else {
      this.isLit = true;
      this.willPlayOnSound = true;
    }
    // If clicked multiple times in a tick, invert the nextActiveState. Otherwise, use the inverse of isLit
    this.nextActiveState = this.nextActiveState == null ? this.isLit : !this.nextActiveState;
    this.handleConflicts(player);
  }
  
  private handleConflicts(player: Player) {
    const conflictingPrayers = player.prayerController.prayers
      .filter(it => it !== this && this.groups.some(group => it?.groups.includes(group)));
    conflictingPrayers.forEach(prayer => {
      prayer.nextActiveState = false;
    });
  }

  deactivate() {
    if (this.isActive || this.nextActiveState) this.willPlayOffSound = true;
    this.nextActiveState = false;
  }

  isOverhead() {
    return false;
  }

  overheadImageReference(): string {
    return "";
  }

  overheadImage() {
    if (!this.cachedImage && this.overheadImageReference()) {
      this.cachedImage = ImageLoader.createImage(this.overheadImageReference());
      return null;
    }

    return this.cachedImage;
  }

  playOffSound() {
    // Override me
  }

  playOnSound() {
    // Override me
  }
}
