"use strict";
import { Settings } from "./Settings";
import { XpDropController } from "./XpDropController";
import { Player } from "./Player";
import { Region } from "./Region";
import { DelayedAction } from "./DelayedAction";
import { Viewport } from "./Viewport";
import MetronomeSound from "../assets/sounds/bonk.ogg";
import { Pathing } from "./Pathing";
import { InputController } from "./Input";
import { ControlPanelController } from "./ControlPanelController";
import { Projectile } from "./weapons/Projectile";
import { filter } from "lodash";

const CLIENT_TICK_MS = 20;

export class World {
  regions: Region[] = [];
  globalTickCounter = 0;
  isPaused = true;
  tickPercent: number;
  clientTickPercent: number;
  getReadyTimer = 0;
  deltaTimeSincePause = -1;
  deltaTimeSinceLastTick = -1;
  lastMenuVisible: boolean;
  then: number;
  startTime: number;
  frameCount = 0;
  tickTimer = 0;
  nextTickTimer = 0;
  clientTickTimer = 0;
  private clientTickAccumulator = 0;
  fps = 50; // updates to track realtime framerate
  private pausedForVisibility = false;
  private browserLoopStarted = false;

  constructor() {
    // Browsers heavily throttle timers and rendering for background tabs. Do
    // not accumulate a large client-tick backlog while the tab is hidden.
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          this.pausedForVisibility = !this.isPaused;
          if (this.pausedForVisibility) this.stopTicking();
        } else if (this.pausedForVisibility) {
          this.pausedForVisibility = false;
          this.deltaTimeSincePause = -1;
          this.deltaTimeSinceLastTick = -1;
          this.startTicking();
        }
      });
    }
  }

  addRegion(region: Region) {
    this.regions.push(region);
  }

  startTicking() {
    this.isPaused = false;
    const now = window.performance.now();
    // Always start client-tick accounting from the current frame. This also
    // prevents the initial callback from treating epoch time as missed ticks.
    this.clientTickTimer = now;
    this.clientTickAccumulator = 0;
    if (this.deltaTimeSincePause === -1) {
      this.tickTimer = now;
      this.then = now;
    } else {
      this.then = now - this.deltaTimeSincePause;
      this.tickTimer = now - this.deltaTimeSinceLastTick;
      this.deltaTimeSincePause = -1;
    }
    this.nextTickTimer = this.tickTimer + Settings.tickMs;
    ControlPanelController.controller.onWorldTick();
    if (!this.browserLoopStarted) {
      this.browserLoopStarted = true;
      this.browserLoop(window.performance.now());
    }
  }

  stopTicking() {
    this.deltaTimeSincePause = window.performance.now() - this.then;
    this.deltaTimeSinceLastTick = window.performance.now() - this.tickTimer;
    this.isPaused = true;
  }

  doClientTick(now = window.performance.now()) {
    this.clientTickAccumulator += Math.max(0, now - this.clientTickTimer);
    this.clientTickTimer = now;
    // Keep the client simulation on a fixed 20 ms cadence instead of
    // re-anchoring movement to an imprecise setInterval callback.
    // Avoid unbounded catch-up after a timer stall; visibility handling also
    // prevents background accumulation.
    const maxCatchupMs = CLIENT_TICK_MS * 50;
    if (this.clientTickAccumulator > maxCatchupMs) this.clientTickAccumulator = maxCatchupMs;
    while (this.clientTickAccumulator >= CLIENT_TICK_MS) {
      const tickPercent = Math.min(1, Math.max(0, (now - this.tickTimer) / Settings.tickMs));
      const tickTimestamp = now - Math.max(0, this.clientTickAccumulator - CLIENT_TICK_MS);
      this.tickClient(tickPercent, tickTimestamp);
      this.clientTickAccumulator -= CLIENT_TICK_MS;
    }
  }

  browserLoop(now: number) {
    window.requestAnimationFrame(this.browserLoop.bind(this));
    if (this.isPaused) {
      return;
    }
    const elapsed = now - this.then;
    this.fps = Math.floor(1000 / elapsed);
    
    if (now > this.nextTickTimer) {
      this.nextTickTimer += Settings.tickMs;
      this.tickTimer = now;
      this.tickPercent = 0;
      if (this.getReadyTimer > 0) {
        this.getReadyTimer--;
      }
      this.tickWorld();
    }
    // Server movement must enqueue its step before the client-cycle movement
    // consumes the path when both boundaries occur in the same render frame.
    // A separate setInterval made that ordering dependent on browser timing.
    this.doClientTick(now);
    this.tickPercent = Math.min(1, Math.max(0, (now - this.tickTimer) / Settings.tickMs));
    Viewport.viewport.draw(this);
    this.then = now;
    this.frameCount++;
  }

  tickWorld(n = 1) {
    this.globalTickCounter++;
    InputController.controller.onWorldTick();
    ControlPanelController.controller.onWorldTick();
    this.regions.forEach((region: Region) => this.tickRegion(region));

    if (n > 1) {
      return this.tickWorld(n - 1);
    }
  }

  tickClient(tickPercent: number, timestamp?: number) {
    this.regions.forEach((region: Region) => this.clientTick(region, tickPercent, timestamp));
  }

  tickRegion(region: Region) {
    Pathing.purgeTileCache();

    if (Settings.metronome) {
      new Audio(MetronomeSound).play();
    }

    // TODO: Clean up this since its now region based
    if (region.newMobs.length) {
      region.mobs.unshift(...region.newMobs);
      region.newMobs = [];
    }

    region.players.forEach((player: Player) => player.pretick());

    region.entities.forEach((entity) => entity.tick());

    if (this.getReadyTimer == 0) {
      region.mobs.forEach((mob) => {
        mob.timerStep();
      });
      region.mobs.forEach((mob) => {
        mob.movementStep();
      });
      region.mobs.forEach((mob) => mob.attackStep());

      region.newMobs.forEach((mob) => {
        mob.timerStep();
      });
      region.newMobs.forEach((mob) => {
        mob.movementStep();
      });
      region.newMobs.forEach((mob) => mob.attackStep());
    }

    DelayedAction.afterNpcTick();

    region.projectiles = filter(
      region.projectiles,
      (projectile: Projectile) => !projectile.shouldDestroy(),
    );
    region.projectiles.forEach((projectile: Projectile) => {
      projectile.onTick();

      if (projectile.remainingDelay === 0) {
        projectile.beforeHit();
      }
    });

    region.players.forEach((player: Player) => {
      player.timerStep();
      player.movementStep();
      if (this.getReadyTimer <= 0) {
        player.attackStep();
      }
    });

    region.midTick();
    DelayedAction.tick();
    XpDropController.controller.tick();
    Viewport.viewport.tick();

    region.postTick();

    // Safely remove the dead stuff from the world. If we do it while iterating we can cause ticks to be stole'd
    const deadPlayers = region.players.filter((player) => player.dying === 0);
    const deadMobs = region.mobs.filter((mob) => mob.dying === 0);
    const deadEntities = region.entities.filter((entity) => entity.dying === 0);
    deadPlayers.forEach((player) => region.removePlayer(player));
    deadMobs.forEach((mob) => region.removeMob(mob));
    deadEntities.forEach((entity) => region.removeEntity(entity));
  }

  clientTick(region: Region, tickPercent: number, timestamp?: number) {
    region.players.forEach((player: Player) => {
      player.clientTick(tickPercent, timestamp);
    });
    region.mobs.forEach((mob) => {
      mob.clientTick(tickPercent, timestamp);
    });
  }
}
