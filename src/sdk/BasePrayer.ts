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
  disabledTicks = 0;
  cachedImage: HTMLImageElement;

  constructor() {
    this.deactivate();
  }

  levelRequirement(): number {
    return 99;
  }

  tick() {
    if (this.disabledTicks > 0) {
      this.disabledTicks--;
      this.isActive = false;
      this.isLit = false;
      this.nextActiveState = null;
      return;
    }
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

  /** Currently only used by Quick-Prayers. */
  activate(player: Player) {
    if (this.disabledTicks > 0) {
      this.playOffSound();
      return;
    }
    if (player.stats.prayer < this.levelRequirement()) {
      return;
    }
    if (!this.isActive || this.nextActiveState === false) this.willPlayOnSound = true;
    this.nextActiveState = true;
    this.handleConflicts(player);
  }

  /**
   * Preserve the combined toggle operation for programmatic callers. Prayer
   * controls split these operations across the client and server timelines.
   */
  toggle(player: Player) {
    if (this.toggleClient(player)) this.toggleServer(player);
  }

  /** Update the locally displayed prayer state when the client handles a click. */
  toggleClient(player: Player): boolean {
    if (this.disabledTicks > 0) {
      this.playOffSound();
      return false;
    }
    if (player.stats.prayer < this.levelRequirement()) {
      return false;
    }
    if (this.isLit) {
      this.isLit = false;
      this.willPlayOffSound = true;
    } else {
      this.isLit = true;
      this.willPlayOnSound = true;
    }
    return true;
  }

  /** Apply a received prayer toggle to the authoritative server-side state. */
  toggleServer(player: Player) {
    if (this.disabledTicks > 0) {
      this.isLit = this.isActive;
      this.playOffSound();
      return;
    }
    if (player.stats.prayer < this.levelRequirement()) {
      this.isLit = this.isActive;
      return;
    }

    const activeState = this.nextActiveState == null ? this.isActive : this.nextActiveState;
    this.nextActiveState = !activeState;
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

  disableForTicks(ticks: number) {
    this.disabledTicks = Math.max(this.disabledTicks, ticks);
    this.isActive = false;
    this.isLit = false;
    this.nextActiveState = null;
    this.willPlayOffSound = true;
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
