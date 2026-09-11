"use strict";

import chebyshev from "chebyshev";
import { Location, Location3 } from "../Location";
import { Unit } from "../Unit";
import { Weapon } from "../gear/Weapon";
import { Sound, SoundCache } from "../utils/SoundCache";
import { Renderable } from "../Renderable";
import { Pathing } from "../Pathing";
import { BasicModel } from "../rendering/BasicModel";
import { GLTFModel } from "../rendering/GLTFModel";
import { CacheRenderModel } from "../rendering/CacheRenderModel";
import { CacheRenderReferences, CacheRenderSpotAnim } from "../rendering/CacheRenderReference";
import { Settings } from "../Settings";
import { Viewport } from "../Viewport";
import { Trainer } from "../Trainer";

export interface ProjectileMotionInterpolator {
  interpolate(from: Location3, to: Location3, percent: number): Location3;
  interpolatePitch(from: Location3, to: Location3, percent: number): number;
}

export interface MultiModelProjectileOffsetInterpolator {
  // when there are multiple models, offset them by this much. Note that the projectile is already rotated towards
  // the target, so the X axis offsets the models left-to-right, and Y axis offsets the models forward-and-back.
  interpolateOffsets(from: Location3, to: Location3, percent: number): Location3[];
}

export interface ProjectileVisuals {
  hidden?: boolean;
  color?: string;
  size?: number;
  motionInterpolator?: ProjectileMotionInterpolator;
  /**
   * Legacy game ticks until the projectile appears. At the normal 600 ms game
   * tick this is converted to 30 client cycles per tick. Ignored when
   * startCycleOffset is supplied.
   *
   * @deprecated Use startCycleOffset for exact 20 ms client-cycle timing.
   */
  visualDelayTicks?: number;
  /**
   * Legacy game ticks between the visual landing and the combat hit. This is
   * converted to client cycles and subtracted from the combat projectile's
   * game-tick lifetime; negative values keep the visual alive after the hit.
   * Ignored when endCycleOffset is supplied.
   *
   * @deprecated Use endCycleOffset for exact 20 ms client-cycle timing.
   */
  visualHitEarlyTicks?: number;
  /** Exact 20 ms client-cycle offset at which the visual starts. Overrides visualDelayTicks. */
  startCycleOffset?: number;
  /** Exact 20 ms client-cycle offset at which the visual ends. Overrides visualHitEarlyTicks. */
  endCycleOffset?: number;
  /**
   * Exact number of 20 ms client cycles before the combat hit at which the
   * visual ends. Ignored when endCycleOffset is supplied.
   */
  hitEarlyCycleOffset?: number;
  // Sound to play when the projectile is visually launched (i.e. after startCycleOffset)
  projectileSound?: Sound;
  model?: string;
  modelScale?: number;
  /** Cache spotanim to use as the projectile model. */
  spotAnim?: CacheRenderSpotAnim;
  // if there are multiple models
  models?: string[];
  offsetsInterpolator?: MultiModelProjectileOffsetInterpolator;
  // offset of start height
  verticalOffset?: number;
}

export interface ProjectileOptions {
  // Compute travel time based on the SW tile
  forceSWTile?: boolean;
  // if true, check prayer on landing rather than attack time.
  checkPrayerAtHit?: boolean;
  // Tick delay for the projectile to land, overriding reduceDelay
  setDelay?: number;
  // Reduce the computed delay of the projectile by this many ticks.
  reduceDelay?: number;
  cancelOnDeath?: boolean;
  /** Internal marker for a transient max-damage modifier owned by the target. */
  consumeTargetMaxDamageRoll?: boolean;
  // Sound to play on the exact tick the attack fires (irrespective of visuals)
  sound?: Sound;
  // Sound to play on the target when the attack hitsplat lands on the target (irrespective of visuals)
  hitSound?: Sound;
  visuals?: ProjectileVisuals;
}

export function mergeProjectileOptions(...sources: ProjectileOptions[]): ProjectileOptions {
  return sources.reduce<ProjectileOptions>((merged, source) => ({
    ...merged,
    ...source,
    visuals: { ...merged.visuals, ...source.visuals },
  }), {});
}

const CLIENT_TICK_MS = 20;
const targetIsLocation = (x: Unit | Location): x is Location => (x as Location).x !== undefined;
export class Projectile {
  damage: number;
  from: Unit;
  to: Unit | Location3;
  distance: number;
  options: ProjectileOptions & { visuals: ProjectileVisuals };
  remainingDelay: number;
  totalDelay: number;
  age = 0;
  attackStyle: string;
  offsetX: number;
  offsetY: number;
  readonly graphic: ProjectileGraphic;

  /*
    This should take the player and mob object, and do chebyshev on the size of them
  */
  constructor(
    readonly weapon: Weapon | null,
    damage: number,
    from: Unit,
    to: Unit | Location3,
    attackStyle: string,
    options: ProjectileOptions = {},
  ) {
    this.attackStyle = attackStyle;
    if (Number.isNaN(damage)) {
      throw new Error(`invalid damage value ${damage}`);
    }
    this.damage = Math.floor(damage);
    if (!targetIsLocation(to) && this.damage > to.currentStats.hitpoint) {
      this.damage = to.currentStats.hitpoint;
    }
    this.options = {
      checkPrayerAtHit: false,
      ...options,
      visuals: {
        modelScale: 1.0,
        verticalOffset: 0.0,
        visualDelayTicks: 0,
        visualHitEarlyTicks: 0,
        ...options.visuals,
      },
    };
    this.from = from;
    this.to = to;
    this.distance = 999999;

    if (!weapon || Weapon.isMeleeAttackStyle(attackStyle)) {
      this.distance = 0;
      this.remainingDelay = 1;
    } else if (weapon) {
      if (options.forceSWTile) {
        // Things like ice barrage calculate distance to SW tile only
        const targetSW = targetIsLocation(to) ? to : to.location;
        this.distance = chebyshev([this.from.location.x, this.from.location.y], [targetSW.x, targetSW.y]);
      } else if (targetIsLocation(to)) {
        const closestTile = to;
        const closestTileFrom = from.getClosestTileTo(to.x, to.y);
        this.distance = chebyshev([closestTileFrom[0], closestTileFrom[1]], [closestTile[0], closestTile[1]]);
      } else {
        const closestTile = to.getClosestTileTo(this.from.location.x, this.from.location.y);
        const closestTileFrom = from.getClosestTileTo(to.location.x, to.location.y);
        this.distance = chebyshev([closestTileFrom[0], closestTileFrom[1]], [closestTile[0], closestTile[1]]);
      }

      this.remainingDelay = weapon.calculateHitDelay(this.distance);
      if (from.isPlayer) {
        this.remainingDelay++;
      }
      if (this.options.reduceDelay) {
        this.remainingDelay -= this.options.reduceDelay;
        if (this.remainingDelay < 1) {
          this.remainingDelay = 1;
        }
      }
    }

    this.remainingDelay = options.setDelay || this.remainingDelay;
    this.totalDelay = this.remainingDelay;
    this.playSound(this.options.sound);
    this.graphic = new ProjectileGraphic(this);
  }

  isMeleeStyle() {
    return this.attackStyle === "slash" || this.attackStyle === "crush" || this.attackStyle === "stab";
  }

  private playSound(sound: Sound) {
    if (Settings.playsAudio && sound) {
      const player = Trainer.player;
      // projectiles launched at the player always play at full volume
      let volumeRatio =
        this.from === player || this.to === player
          ? 1.0
          : 1 /
            Pathing.dist(
              Trainer.player.location.x,
              Trainer.player.location.y,
              this.from.location.x,
              this.from.location.y,
            );
      volumeRatio = Math.min(1, Math.max(0, Math.sqrt(volumeRatio)));
      SoundCache.play({
        src: sound.src,
        volume: volumeRatio * sound.volume,
        delayMs: 0,
      });
    }
  }

  onTick() {
    this.remainingDelay--;
    this.age++;
  }

  // called as the projectile lands but before damage is calculated
  beforeHit() {
    if (this.options.hitSound) {
      SoundCache.play(this.options.hitSound);
    }
    if (
      !targetIsLocation(this.to) &&
      this.options.checkPrayerAtHit &&
      this.weapon?.isBlockable(this.from, this.to, { attackStyle: this.attackStyle })
    ) {
      this.damage = 0;
    }
  }

  shouldDestroy() {
    return this.age >= this.totalDelay + 1;
  }
}

/** Client-cycle visual paired with a game-tick combat projectile. */
export class ProjectileGraphic extends Renderable {
  readonly startLocation: Location;
  readonly startHeight: number;
  readonly interpolator: ProjectileMotionInterpolator;
  readonly image: HTMLImageElement;
  private readonly startCycle: number;
  private readonly endCycle: number;
  private elapsedCycles = 0;
  private projectileSoundPlayed = false;

  constructor(readonly projectile: Projectile) {
    super();
    this.startLocation = {
      x: projectile.from.location.x + (projectile.from.size - 1) / 2,
      y: projectile.from.location.y - (projectile.from.size - 1) / 2,
    };
    const visuals = projectile.options.visuals;
    this.startHeight = projectile.from.height * 0.75 + visuals.verticalOffset;
    this.interpolator = visuals.motionInterpolator ?? new LinearProjectileMotionInterpolator();
    this.image = projectile.weapon?.image;
    const clientTicksPerGameTick = Math.max(1, Math.round(Settings.tickMs / CLIENT_TICK_MS));
    this.startCycle = visuals.startCycleOffset
      ?? visuals.visualDelayTicks * clientTicksPerGameTick;
    this.endCycle = visuals.endCycleOffset
      ?? projectile.totalDelay * clientTicksPerGameTick
        - (visuals.hitEarlyCycleOffset ?? visuals.visualHitEarlyTicks * clientTicksPerGameTick);
    this.playProjectileSound();
  }

  clientTick() {
    this.elapsedCycles++;
    this.playProjectileSound();
  }

  private playProjectileSound() {
    const sound = this.projectile.options.visuals.projectileSound;
    if (this.projectileSoundPlayed || this.elapsedCycles < this.startCycle || !Settings.playsAudio || !sound) return;
    this.projectileSoundPlayed = true;
    const player = Trainer.player;
    let volumeRatio = this.projectile.from === player || this.projectile.to === player
      ? 1
      : 1 / Pathing.dist(player.location.x, player.location.y, this.startLocation.x, this.startLocation.y);
    volumeRatio = Math.min(1, Math.max(0, Math.sqrt(volumeRatio)));
    SoundCache.play({ src: sound.src, volume: volumeRatio * sound.volume, delayMs: 0 });
  }

  private getPercent() {
    const duration = this.endCycle - this.startCycle;
    if (duration <= 0) return this.elapsedCycles >= this.startCycle ? 1 : 0;
    return (this.elapsedCycles - this.startCycle) / duration;
  }

  getTargetDestination(tickPercent = 0): Location3 {
    const target = this.projectile.to;
    if (targetIsLocation(target)) return target;
    const { x, y } = target.getPerceivedLocation(tickPercent);
    return {
      x: x + (target.size - 1) / 2,
      y: y - (target.size - 1) / 2,
      z: target.height * 0.5,
    };
  }

  getPerceivedLocation(tickPercent: number) {
    return this.interpolator.interpolate(
      { ...this.startLocation, z: this.startHeight },
      this.getTargetDestination(tickPercent),
      this.getPercent(),
    );
  }

  getPerceivedRotation(tickPercent: number) {
    const destination = this.getTargetDestination(tickPercent);
    return -Pathing.angle(this.startLocation.x, this.startLocation.y, destination.x, destination.y);
  }

  getPerceivedPitch(tickPercent: number) {
    return this.interpolator.interpolatePitch(
      { ...this.startLocation, z: this.startHeight },
      this.getTargetDestination(tickPercent),
      this.getPercent(),
    );
  }

  getPerceivedOffsets(tickPercent: number): Location3[] {
    const offsets = this.projectile.options.visuals.offsetsInterpolator;
    if (!offsets) return super.getPerceivedOffsets(tickPercent);
    return offsets.interpolateOffsets(
      { ...this.startLocation, z: this.startHeight },
      this.getTargetDestination(tickPercent),
      this.getPercent(),
    );
  }

  getTrueLocation() { return this.getPerceivedLocation(0); }
  get size() { return this.projectile.options.visuals.size || 0.5; }
  get color() {
    if (this.projectile.options.visuals.color) return this.projectile.options.visuals.color;
    if (this.projectile.isMeleeStyle()) return "#FF0000";
    if (this.projectile.attackStyle === "range") return "#00FF00";
    if (this.projectile.attackStyle === "magic") return "#0000FF";
    if (this.projectile.attackStyle === "heal") return "#9813aa";
    return "#000000";
  }
  get drawOutline() { return false; }
  visible() {
    return !this.projectile.options.visuals.hidden
      && this.elapsedCycles > this.startCycle
      && this.elapsedCycles <= this.endCycle;
  }
  shouldDestroy() { return this.elapsedCycles > Math.max(this.startCycle, this.endCycle); }
  get animationIndex() { return 0; }

  override draw(
    _tickPercent: number,
    context: OffscreenCanvasRenderingContext2D,
    location: Location,
    scale = Settings.tileSize,
  ) {
    if (!this.visible()) return;
    context.save();
    context.translate(location.x * Settings.tileSize, location.y * Settings.tileSize);
    if (this.image) {
      context.rotate(Math.PI);
      context.drawImage(this.image, -scale / 2, -scale / 2, scale, scale);
    } else {
      context.beginPath();
      context.fillStyle = `${this.color}73`;
      context.arc(0, 0, 5, 0, 2 * Math.PI);
      context.fill();
    }
    context.restore();
  }

  protected create3dModel() {
    const options = this.projectile.options.visuals;
    if (options.hidden || !this.projectile.attackStyle || this.color === "#000000") return null;
    if (options.models) return GLTFModel.forRenderableMulti(this, options.models, { scale: options.modelScale });
    if (options.spotAnim) {
      const spotAnim = { ...options.spotAnim, delay: (options.spotAnim.delay ?? 0) + this.startCycle };
      return CacheRenderModel.forRenderable(
        this,
        CacheRenderReferences.spotAnim([spotAnim]),
        { basisRotation: Math.PI / 2, loopSpotAnims: true },
      );
    }
    if (options.model) return GLTFModel.forRenderable(this, options.model, { scale: options.modelScale });
    return BasicModel.sphereForRenderable(this);
  }
}

export class LinearProjectileMotionInterpolator implements ProjectileMotionInterpolator {
  interpolate(from: Location3, to: Location3, percent: number) {
    // default linear
    const startX = from.x;
    const startY = from.y;
    const startHeight = from.z;
    const endX = to.x;
    const endY = to.y;
    const endHeight = to.z;

    const perceivedX = Pathing.linearInterpolation(startX, endX, percent);
    const perceivedY = Pathing.linearInterpolation(startY, endY, percent);
    const perceivedHeight =
      startHeight === endHeight ? startHeight : Pathing.linearInterpolation(startHeight, endHeight, percent);
    return { x: perceivedX, y: perceivedY, z: perceivedHeight };
  }

  interpolatePitch(from: Location3, to: Location3, percent: number) {
    return 0;
  }
}

export class ArcProjectileMotionInterpolator implements ProjectileMotionInterpolator {
  constructor(private height: number) {}

  interpolate(from: Location3, to: Location3, percent: number) {
    const startX = from.x;
    const startY = from.y;
    const startHeight = from.z;
    const endX = to.x;
    const endY = to.y;
    const endHeight = to.z;

    const perceivedX = Pathing.linearInterpolation(startX, endX, percent);
    const perceivedY = Pathing.linearInterpolation(startY, endY, percent);
    const perceivedHeight =
      Math.sin(percent * Math.PI) * this.height + (endHeight - startHeight) * percent + startHeight;
    return { x: perceivedX, y: perceivedY, z: perceivedHeight };
  }

  interpolatePitch(from: Location3, to: Location3, percent: number) {
    return Math.sin(-(0.75 + percent * 0.5) * Math.PI);
  }
}

// Simply sticks to the target
export class FollowTargetInterpolator implements ProjectileMotionInterpolator {
  interpolate(from: Location3, to: Location3, percent: number) {
    const endX = to.x;
    const endY = to.y;
    const endHeight = to.z;
    return { x: endX, y: endY, z: endHeight };
  }

  interpolatePitch(from: Location3, to: Location3, percent: number) {
    return 0;
  }
}
