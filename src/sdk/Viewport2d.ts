"use strict";
import { Player } from "./Player";
import { World } from "./World";
import { Viewport, ViewportDelegate } from "./Viewport";
import { CardinalDirection, GroundItems, Region } from "./Region";
import { Settings } from "./Settings";
import { Renderable, UILayerProjector } from "./Renderable";
import { Unit } from "./Unit";
import { Mob } from "./Mob";
import { Collision } from "./Collision";
import { Item } from "./Item";
import _ from "lodash";
import { Trainer } from "./Trainer";
import { Location } from "./Location";

export class Viewport2d implements ViewportDelegate {
  private selectedTile: Location | null = null;

  async initialise(world: World, region: Region) {
    // do nothing, but maybe we should buffer the world background
    return;
  }

  reset() {
    // do nothing
  }

  draw(world: World, region: Region) {
    region.context.save();
    region.drawWorldBackground(region.context, Settings.tileSize);
    region.drawGroundItems(region.context);

    // Draw all things on the map
    const renderables: Renderable[] = [...region.entities, ...region.projectileGraphics];
    const units: Unit[] = [];

    if (world.getReadyTimer <= 0) {
      units.push(...region.mobs);
      units.push(...region.newMobs);
    }
    units.push(...region.players);
    renderables.concat(units).forEach((r) => {
      const location = r.getPerceivedLocation(world.tickPercent);
      r.draw(world.tickPercent, region.context, location, Settings.tileSize);
    });
    const getOffset = (r: Renderable) => {
      const perceivedLocation = r.getPerceivedLocation(world.tickPercent);
      const perceivedX = perceivedLocation.x;
      const perceivedY = perceivedLocation.y;

      return {
        x: perceivedX * Settings.tileSize + (r.size * Settings.tileSize) / 2,
        y: (perceivedY - r.size + 1) * Settings.tileSize + (r.size * Settings.tileSize) / 2,
      };
    };

    // The legacy top-down viewport has no elevation projection. Keep its UI
    // anchored to the top of the renderable's footprint for compatibility.
    const getUILayerProjector = (r: Renderable): UILayerProjector => {
      const offset = getOffset(r);
      const screenPosition = {
        x: offset.x,
        y: offset.y - (r.size * Settings.tileSize) / 2,
      };
      return {
        logicalHeight: r.logicalHeight,
        atHeight: () => screenPosition,
      };
    };

    region.entities.forEach((entity) =>
      entity.drawUILayer(world.tickPercent, getUILayerProjector(entity), entity.region.context, Settings.tileSize),
    );
    if (world.getReadyTimer <= 0) {
      region.mobs.forEach((mob) =>
        mob.drawUILayer(world.tickPercent, getUILayerProjector(mob), mob.region.context, Settings.tileSize),
      );

      region.players.forEach((player: Player) => {
        player.drawUILayer(world.tickPercent, getUILayerProjector(player), player.region.context, Settings.tileSize);
      });

    }

    if (this.selectedTile && Settings.hoveredTileEnabled) {
      region.context.save();
      region.context.globalAlpha *= 0.5;
      region.context.lineWidth = 2;
      region.context.strokeStyle = Settings.hoveredTileColor;
      region.context.strokeRect(
        Math.floor(this.selectedTile.x) * Settings.tileSize,
        Math.floor(this.selectedTile.y) * Settings.tileSize,
        Settings.tileSize,
        Settings.tileSize,
      );
      region.context.restore();
    }

    region.context.restore();

    const { viewportX, viewportY } = Viewport.viewport.getViewport(world.tickPercent);
    return {
      canvas: region.canvas,
      uiCanvas: null,
      flip: Settings.rotated === "south",
      offsetX: -viewportX * Settings.tileSize,
      offsetY: -viewportY * Settings.tileSize,
    };
  }

  translateClick(offsetX, offsetY, world: World, viewport: Viewport) {
    const { viewportX, viewportY } = viewport.getViewport(world.tickPercent);
    let x: number = offsetX + viewportX * Settings.tileSize;
    let y: number = offsetY + viewportY * Settings.tileSize;

    if (Settings.rotated === "south") {
      x = viewport.width * Settings.tileSize - offsetX + viewportX * Settings.tileSize;
      y = viewport.height * Settings.tileSize - offsetY + viewportY * Settings.tileSize;
    }
    const adjustedX = x / Settings.tileSize;
    const adjustedY = y / Settings.tileSize;
    this.selectedTile = { x: Math.floor(adjustedX), y: Math.floor(adjustedY) };
    const mobs: Mob[] = [];
    const players: Player[] = [];
    const groundItems: Item[] = [];
    const region = Trainer.player.region;

    mobs.push(
      ...Collision.collidesWithAnyMobsAtPerceivedDisplayLocation(region, adjustedX, adjustedY, world.tickPercent),
    );
    players.push(
      ...Collision.collidesWithAnyPlayersAtPerceivedDisplayLocation(
        region,
        adjustedX,
        adjustedY,
        world.tickPercent,
      ).filter((player: Player) => player !== Trainer.player),
    );
    groundItems.push(...region.groundItemsAtLocation(Math.floor(adjustedX), Math.floor(adjustedY)));
    if (mobs.length > 0 || players.length > 0 || groundItems.length > 0) {
      return {
        type: "entities" as const,
        mobs: _.uniq(mobs),
        players: players,
        groundItems: groundItems,
        location: {
          x: adjustedX,
          y: adjustedY,
        },
      };
    }
    return {
      type: "coordinate" as const,
      location: {
        x: adjustedX,
        y: adjustedY,
      },
    };
  }

  setMapRotation(direction: CardinalDirection) {
    if (direction === CardinalDirection.SOUTH) {
      Settings.rotated = "south";
    } else if (direction === CardinalDirection.NORTH) {
      Settings.rotated = "north";
    }
  }

  getMapRotation(): number {
    return Settings.rotated === "south" ? Math.PI : 0;
  }
}
