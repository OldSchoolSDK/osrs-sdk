"use strict";

import { remove } from "lodash";
import type { Entity } from "./Entity";
import type { Item } from "./Item";
import type { Mob } from "./Mob";
import type { Player } from "./Player";
import type { Renderable } from "./Renderable";
import type { Unit } from "./Unit";
import { Settings } from "./Settings";
import type { World } from "./World";
import type { Projectile, ProjectileGraphic } from "./weapons/Projectile";
import { DelayedAction } from "./DelayedAction";
import { TileMarker } from "../content";
import { LoadoutRegistry } from "../content/LoadoutRegistry";
import { Viewport } from "./Viewport";
import { Trainer } from "./Trainer";
import { Button } from "./ui/Button";
import type { Loadout as LoadoutData, LoadoutItemId } from "./Loadout";
import type { UnitEquipment } from "./Unit";
import { ChunkUtils } from "./utils/Chunk";
import type { Location } from "./Location";

interface GroundYItems {
  [key: number]: Item[];
}

export interface GroundItems {
  [key: number]: GroundYItems;
}

export enum CardinalDirection {
  NORTH,
  SOUTH,
  EAST,
  WEST,
}

// Base class for any trainer region.
export abstract class Region {
  constructor(protected readonly loadoutTemplates: LoadoutData[] = []) {}

  canvas: OffscreenCanvas;

  players: Player[] = [];

  world: World;

  newMobs: Mob[] = [];
  mobs: Mob[] = [];
  primaryBoss: Mob | null = null;
  private nextChunkOrder = 0;
  private tileCollisionFlags: Uint8Array | null = null;
  entities: Entity[] = [];
  // Combat projectiles aimed at locations rather than units.
  projectiles: Projectile[] = [];
  // Client-cycle visuals are region-owned and expire independently of hits.
  projectileGraphics: ProjectileGraphic[] = [];

  mapImage: HTMLImageElement;

  groundItems: GroundItems = {};

  get initialFacing(): CardinalDirection {
    return CardinalDirection.SOUTH;
  }

  midTick() {
    // Override me
  }

  postTick() {
    // Override me
  }

  addPlayer(player: Player) {
    if (player.consumesSpace) this.setTileCollisionFlags(player.location.x, player.location.y, player.size);
    this.players.push(player);
    this.refreshUnitChunk(player);
    player.addedToWorld();
  }

  rightClickActions() {
    return [];
  }

  get context(): OffscreenCanvasRenderingContext2D {
    if (!this.canvas) {
      if (Settings.mobileCheck()) {
        this.canvas = new OffscreenCanvas(2000, 2000);
      } else {
        this.canvas = new OffscreenCanvas(10000, 10000);
      }
    }
    return this.canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  }

  addEntity(entity: Entity) {
    this.entities.push(entity);
  }

  removeEntity(entity: Entity) {
    remove(this.entities, entity);
  }

  addMob(mob: Mob) {
    if (mob.consumesSpace) this.setTileCollisionFlags(mob.location.x, mob.location.y, mob.size);
    if (!mob.region.world) {
      this.mobs.push(mob);
      this.refreshUnitChunk(mob);
      mob.addedToWorld();
    } else {
      this.newMobs.push(mob);
      this.refreshUnitChunk(mob);
    }
  }

  hasUnit(unit: Unit) {
    return this.players.some((player) => player === unit)
      || this.mobs.some((mob) => mob === unit)
      || this.newMobs.some((mob) => mob === unit);
  }

  /** Assign a fresh order when a unit first appears or crosses a chunk boundary. */
  refreshUnitChunk(unit: Unit) {
    const chunkPosition = ChunkUtils.fromLocation(unit.location);
    if (unit.chunkOrder >= 0 && ChunkUtils.equals(unit.chunkPosition, chunkPosition)) return;

    unit.chunkPosition = chunkPosition;
    unit.chunkOrder = this.nextChunkOrder++;
  }

  /** Return NPCs in this chunk, with the most recent entrant first. */
  getNpcsInChunk(chunkX: number, chunkY: number): Mob[] {
    return [...this.mobs, ...this.newMobs]
      .filter((mob) => mob.chunkPosition.x === chunkX && mob.chunkPosition.y === chunkY)
      .sort((first, second) => second.chunkOrder - first.chunkOrder);
  }

  /** One-based position in the order NPCs in this chunk will be considered. */
  getNpcChunkPriority(mob: Mob): number | null {
    const priority = this.getNpcsInChunk(mob.chunkPosition.x, mob.chunkPosition.y).indexOf(mob);
    return priority < 0 ? null : priority + 1;
  }

  /**
   * Sets or clears the "boss" for the region, which is the NPC for which we'll render the boss health bar.
   */
  setBoss(mob: Mob | null) {
    this.primaryBoss = mob;
  }

  removeMob(mob: Mob) {
    if (mob.consumesSpace) this.clearTileCollisionFlags(mob.location.x, mob.location.y, mob.size);
    remove(this.mobs, mob);
    remove(this.newMobs, mob);
    if (this.primaryBoss === mob) this.primaryBoss = null;
  }

  /**
   * Tile collision flags are persistent client state. They are deliberately
   * not rebuilt from current unit positions each tick. NPC and player movement
   * explicitly clear and restore the flags affected by their path.
   */
  private getTileCollisionFlags() {
    const length = this.width * this.height;
    if (!this.tileCollisionFlags || this.tileCollisionFlags.length !== length) {
      this.tileCollisionFlags = new Uint8Array(length);
    }
    return this.tileCollisionFlags;
  }

  private tileCollisionFlagIndex(x: number, y: number) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return -1;
    return y * this.width + x;
  }

  hasTileCollisionFlags(x: number, y: number, size: number) {
    const flags = this.getTileCollisionFlags();
    for (let xx = x; xx < x + size; xx++) {
      for (let yy = y; yy > y - size; yy--) {
        const index = this.tileCollisionFlagIndex(xx, yy);
        if (index >= 0 && flags[index] !== 0) return true;
      }
    }
    return false;
  }

  setTileCollisionFlags(x: number, y: number, size: number) {
    const flags = this.getTileCollisionFlags();
    for (let xx = x; xx < x + size; xx++) {
      for (let yy = y; yy > y - size; yy--) {
        const index = this.tileCollisionFlagIndex(xx, yy);
        if (index >= 0) flags[index] = 1;
      }
    }
  }

  clearTileCollisionFlags(x: number, y: number, size: number) {
    const flags = this.getTileCollisionFlags();
    for (let xx = x; xx < x + size; xx++) {
      for (let yy = y; yy > y - size; yy--) {
        const index = this.tileCollisionFlagIndex(xx, yy);
        if (index >= 0) flags[index] = 0;
      }
    }
  }

  getTileCollisionFlagLocations(): Location[] {
    const locations: Location[] = [];
    const flags = this.getTileCollisionFlags();
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (flags[this.tileCollisionFlagIndex(x, y)] !== 0) locations.push({ x, y });
      }
    }
    return locations;
  }

  removePlayer(player: Player) {
    if (player.consumesSpace) this.clearTileCollisionFlags(player.location.x, player.location.y, player.size);
    remove(this.players, player);
    if (this.players.length === 0) {
      this.onGameOver();
    }
  }

  clearAggroFor(target: Unit) {
    [...this.players, ...this.mobs, ...this.newMobs].forEach((unit) => {
      if (unit.aggro === target) {
        unit.setAggro(null);
      }
    });
  }

  onUnitDeath(unit: Unit) {
    // Override in encounter regions that need to react to a unit dying.
  }

  addGroundItem(player: Player, item: Item, x: number, y: number) {
    if (!this.groundItems[x]) {
      this.groundItems[x] = {};
    }
    if (!this.groundItems[x][y]) {
      this.groundItems[x][y] = [];
    }

    item.groundLocation = { x: player.location.x, y: player.location.y };
    this.groundItems[x][y].push(item);
  }

  addProjectile(projectile: Projectile) {
    this.projectiles.push(projectile);
    this.addProjectileGraphic(projectile.graphic);
  }

  removeProjectile(projectile: Projectile) {
    remove(this.projectiles, projectile);
  }

  addProjectileGraphic(graphic: ProjectileGraphic) {
    if (!this.projectileGraphics.includes(graphic)) this.projectileGraphics.push(graphic);
  }

  getName(): string {
    return "My Region";
  }

  get width(): number {
    return 0;
  }

  get height(): number {
    return 0;
  }

  mapImagePath(): string {
    return "";
  }

  drawWorldBackground(context: OffscreenCanvasRenderingContext2D, scale: number) {
    // Override me
  }

  drawDefaultFloor() {
    return true;
  }

  groundItemsAtLocation(x: number, y: number) {
    return (this.groundItems[x] ? this.groundItems[x][y] : []) || [];
  }

  removeGroundItem(item: Item, x: number, y: number) {
    if (this.groundItems[x]) {
      if (this.groundItems[x][y]) {
        remove(this.groundItems[x][y], item);
      }
    }
  }

  drawGroundItems(ctx: OffscreenCanvasRenderingContext2D) {
    Object.entries(this.groundItems).forEach((scope1: [string, string]) => {
      const x = parseInt(scope1[0]);
      Object.entries(this.groundItems[x]).forEach((scope2: [string, string]) => {
        const y = parseInt(scope2[0]);
        const items = this.groundItems[x][y];
        items.forEach((item: Item) => {
          ctx.drawImage(
            item.inventorySprite,
            x * Settings.tileSize,
            y * Settings.tileSize,
            Settings.tileSize,
            Settings.tileSize,
          );
        });
      });
    });
  }

  abstract initialiseRegion(): { player: Player };

  private createLoadoutItem(itemId: LoadoutItemId): Item | null {
    if (itemId === null) return null;

    const registeredItem = LoadoutRegistry.get(itemId);
    if (!registeredItem) return null;

    const ItemType = registeredItem.constructor as new () => Item;
    return new ItemType();
  }

  private constructLoadout(loadout: LoadoutData): { equipment: UnitEquipment; inventory: (Item | null)[] } {
    const equipment = {} as Record<keyof UnitEquipment, Item | null>;
    (Object.keys(loadout.equipment) as (keyof UnitEquipment)[]).forEach((slot) => {
      equipment[slot] = this.createLoadoutItem(loadout.equipment[slot]);
    });

    return {
      equipment: equipment as UnitEquipment,
      inventory: loadout.inventory.map((itemId) => this.createLoadoutItem(itemId)),
    };
  }

  private applyConfiguredLoadout(player: Player) {
    if (this.loadoutTemplates.length === 0) return;

    const selectedLoadout = this.loadoutTemplates.find(({ name }) => name === Settings.loadout);
    const customLoadout = Settings.customLoadout?.name === selectedLoadout?.name
      ? Settings.customLoadout
      : null;
    const loadout = customLoadout ?? selectedLoadout ?? this.loadoutTemplates[0];
    if (loadout) player.setUnitOptions(this.constructLoadout(loadout));
  }

  reset(startWorld = true) {
    if (!this.world.isPaused) {
      this.world.stopTicking();
    }

    DelayedAction.reset();

    this.players = [];
    this.mobs = [];
    this.newMobs = [];
    this.nextChunkOrder = 0;
    this.entities = [];
    this.projectiles = [];
    this.groundItems = {};
    TileMarker.loadAll(this);
    Viewport.viewport.reset(this);

    // Set countdown timer like on page load
    this.world.getReadyTimer = 6;

    const reset = this.initialiseRegion();
    this.applyConfiguredLoadout(reset.player);
    for (const unit of [...this.players, ...this.mobs]) {
      unit.setStats();
    }
    Viewport.viewport.setPlayer(reset.player);
    if (startWorld) this.world.startTicking();
    return reset;
  }

  onGameOver() {
    // Override me
    Viewport.viewport.components.push(new Button("Reset", 120, 60, () => Trainer.reset()));
    this.world.stopTicking();
  }

  // calls preload on all renderable children
  async preload() {
    await Promise.all(this.entities.map((entity) => entity.preload()));
    await Promise.all(this.mobs.map((mob) => mob.preload()));
    await Promise.all(this.newMobs.map((mob) => mob.preload()));
    await Promise.all(this.players.map((players) => players.preload()));
  }

  getRenderables(): Renderable[] {
    const units = [...this.players, ...this.mobs, ...this.newMobs];
    return [...this.entities, ...units, ...this.projectileGraphics];
  }
}
