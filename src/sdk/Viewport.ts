"use strict";
import { Settings } from "./Settings";
import { ClickController } from "./ClickController";
import { Player } from "./Player";
import { ContextMenu } from "./ContextMenu";
import { World } from "./World";
import { ControlPanelController } from "./ControlPanelController";
import { MapController } from "./MapController";
import { XpDropController } from "./XpDropController";
import { ImageLoader } from "./utils/ImageLoader";
import ButtonActiveIcon from "../assets/images/interface/button_active.png";
import { CardinalDirection, Region } from "./Region";
import { Viewport3d } from "./Viewport3d";
import { Location } from "./Location";
import { Mob } from "./Mob";
import { Item } from "./Item";
import { Viewport2d } from "./Viewport2d";
import { Trainer } from "./Trainer";
import { Component } from "./ui/Component";
import { ToggleButton } from "./ui/ToggleButton";

type ViewportEntitiesClick = {
  type: "entities";
  mobs: Mob[];
  players: Player[];
  groundItems: Item[];
  location: Location;
};

type ViewportCoordinateClick = {
  type: "coordinate";
  location: Location;
};

type ViewportClickResult = ViewportEntitiesClick | ViewportCoordinateClick | null;

type ViewportDrawResult = {
  // game canvas
  canvas: OffscreenCanvas;
  // drawn on top of the game canvas. optional, not used for 2d view
  uiCanvas: OffscreenCanvas | null;
  flip: boolean;
  offsetX: number;
  offsetY: number;
};

const BOSS_BAR_WIDTH = 300;
const BOSS_BAR_HEIGHT = 50;
const BOSS_BAR_TOP = 36;
const BOSS_BAR_HORIZONTAL_OFFSET = -60;
const BOSS_BAR_INNER_PADDING = 2;

export interface ViewportDelegate {
  initialise(world: World, region: Region): Promise<void>;
  reset();

  draw(world: World, region: Region): ViewportDrawResult;

  // translate the click (relative to the viewport) to a location in the world or something that got clicked
  translateClick(offsetX: number, offsetY: number, world: World, viewport: Viewport): ViewportClickResult;

  getMapRotation(): number;

  setMapRotation(direction: CardinalDirection);

  resize?(width: number, height: number): void;
}

export class Viewport {
  static viewport: Viewport;
  static setupViewport(region: Region, canvas: HTMLCanvasElement, resizeTarget: Element, force2d = false) {
    const faceInitialSouth = region.initialFacing === CardinalDirection.SOUTH;
    // called after Settings have been initialized
    Viewport.viewport = new Viewport(
      Settings.use3dView && !force2d ? new Viewport3d(faceInitialSouth, canvas) : new Viewport2d(),
      canvas,
      resizeTarget,
    );
  }

  activeButtonImage: HTMLImageElement = ImageLoader.createImage(ButtonActiveIcon);
  contextMenu: ContextMenu = new ContextMenu();

  private clickController: ClickController;
  private resizeObserver: ResizeObserver | null = null;
  width: number;
  height: number;


  public components: Component[] = [];

  constructor(
    private delegate: ViewportDelegate,
    readonly canvas: HTMLCanvasElement,
    private readonly resizeTarget: Element,
  ) {
    if (typeof ResizeObserver === "undefined") {
      throw new Error("ResizeObserver is required to mount a viewport");
    }
    this.resizeObserver = new ResizeObserver(([entry]) => {
      this.resize(entry.contentRect.width, entry.contentRect.height);
    });
    this.resizeObserver.observe(this.resizeTarget);
  }

  /**
   * Return all objects or world coordinates at the given position (relative to the top-left of the viewport).
   */
  translateClick(offsetX: number, offsetY: number, world: World): ViewportClickResult {
    return this.delegate.translateClick(offsetX, offsetY, world, this);
  }

  get context() {
    return this.canvas.getContext("2d") as CanvasRenderingContext2D;
  }

  setPlayer(player: Player) {
    Trainer.setPlayer(player);
    if (!this.clickController) {
      this.clickController = new ClickController(this);
      this.clickController.registerClickActions();
    }
    Trainer.setClickController(this.clickController);
  }

  /** Recalculate viewport and backing-canvas dimensions from the playable area. */
  resize(width: number, height: number) {
    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));
    if (!Trainer.player?.region) return;
    Settings._tileSize = width / Trainer.player.region.width;
    this.width = width / Settings.tileSize;
    this.height = height / Settings.tileSize;
    if (width !== this.canvas.width || height !== this.canvas.height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.delegate.resize?.(width, height);
  }

  // called after all graphics have loaded
  async initialise() {
    await this.delegate.initialise(Trainer.player.region.world, Trainer.player.region);
    return;
  }

  reset(region: Region) {
    this.delegate.reset();
    this.delegate.setMapRotation(region.initialFacing);
    this.components = [];
  }

  dispose() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  getViewport(tickPercent: number) {
    if (Trainer.player.dying > -1) {
      tickPercent = 0;
    }
    const { x, y } = Trainer.player.getPerceivedLocation(tickPercent);
    const viewportX = x + 0.5 - this.width / 2;
    const viewportY = y + 0.5 - this.height / 2;
    return { viewportX, viewportY };
  }

  drawText(text: string, x: number, y: number) {
    x = Math.floor(x);
    y = Math.floor(y);
    this.context.fillStyle = "#000";
    this.context.fillText(text, x - 2, y - 2);
    this.context.fillText(text, x + 2, y - 2);
    this.context.fillText(text, x, y);
    this.context.fillText(text, x, y - 4);
    this.context.fillStyle = "#FFFFFF";
    this.context.fillText(text, x, y - 2);
  }

  tick() {
    if (MapController.controller && Trainer.player) {
      MapController.controller.updateOrbsMask(Trainer.player.currentStats, Trainer.player.stats);
    }
  }

  getMapRotation() {
    return this.delegate.getMapRotation();
  }

  rotateSouth() {
    this.delegate.setMapRotation(CardinalDirection.SOUTH);
  }

  rotateNorth() {
    this.delegate.setMapRotation(CardinalDirection.NORTH);
  }

  getDelegate() {
    return this.delegate;
  }

  draw(world: World) {
    this.context.globalAlpha = 1;
    this.context.fillStyle = "#3B3224";
    this.context.restore();
    this.context.save();
    this.context.fillStyle = "black";
    const { width, height } = this.canvas;
    this.context.fillRect(0, 0, width, height);
    const { canvas, uiCanvas, flip, offsetX, offsetY } = this.delegate.draw(world, Trainer.player.region);
    if (flip) {
      this.context.rotate(Math.PI);
      this.context.translate(-width, -height);
    }
    this.context.drawImage(canvas, offsetX, offsetY);
    if (uiCanvas) {
      this.context.drawImage(uiCanvas, offsetX, offsetY);
    }
    this.context.restore();
    this.context.save();

    this.drawBossHealthBar(Trainer.player.region, width);

    // draw control panel
    ControlPanelController.controller.draw(this.context);
    XpDropController.controller.draw(
      this.context,
      width - 140 - MapController.controller.width,
      0,
      world.tickPercent,
    );
    MapController.controller.draw(this.context);
    this.clickController.drawHoverTooltip(this.context);
    this.contextMenu.draw(this.context);

    this.components.forEach((component) => component.draw(this.context, Settings.maxUiScale, 0, 0));

    if (this.clickController.clickAnimation) {
      this.clickController.clickAnimation.draw(this.context, world.fps);
    }

    this.context.restore();
    this.context.save();
    this.context.textAlign = "left";
    if (world.getReadyTimer > 0) {
      this.context.font = "72px OSRS";
      this.context.textAlign = "center";
      this.drawText(`GET READY...${world.getReadyTimer}`, width / 2, height / 2 - 50);
    }
    this.context.restore();
  }

  private drawBossHealthBar(region: Region, viewportWidth: number) {
    const boss = region.primaryBoss;
    if (!boss || !Settings.displayBossHealthBar) return;

    const width = Math.min(BOSS_BAR_WIDTH, viewportWidth - 16);
    const centeredX = (viewportWidth - width) / 2 + BOSS_BAR_HORIZONTAL_OFFSET;
    const x = Math.round(Math.max(8, Math.min(centeredX, viewportWidth - width - 8)));
    const y = BOSS_BAR_TOP;
    const current = Math.max(0, boss.currentStats.hitpoint);
    const maximum = Math.max(1, boss.stats.hitpoint);
    const healthRatio = Math.min(1, current / maximum);

    this.context.save();
    this.context.fillStyle = "#090806";
    this.context.fillRect(x, y, width, BOSS_BAR_HEIGHT);
    this.context.fillStyle = "#211e18";
    this.context.fillRect(x + 4, y + 4, width - 8, BOSS_BAR_HEIGHT - 8);

    this.context.font = "18px Stats_11";
    this.context.textAlign = "center";
    this.context.fillStyle = "black";
    this.context.fillText(boss.mobName(), x + width / 2 + 1, y + 18 + 1);
    this.context.fillStyle = "#d87532";
    this.context.fillText(boss.mobName(), x + width / 2, y + 18);

    const barX = x + BOSS_BAR_INNER_PADDING;
    const barY = y + 24;
    const barWidth = width - BOSS_BAR_INNER_PADDING * 2;
    const barHeight = 24;
    this.context.fillStyle = "#050403";
    this.context.fillRect(barX, barY, barWidth, barHeight);
    this.context.fillStyle = "#e00000";
    this.context.fillRect(barX + BOSS_BAR_INNER_PADDING, barY + BOSS_BAR_INNER_PADDING, barWidth - BOSS_BAR_INNER_PADDING * 2, barHeight - BOSS_BAR_INNER_PADDING * 2);
    this.context.fillStyle = "#00d900";
    this.context.fillRect(barX + BOSS_BAR_INNER_PADDING, barY + BOSS_BAR_INNER_PADDING, Math.round((barWidth - BOSS_BAR_INNER_PADDING * 2) * healthRatio), barHeight - BOSS_BAR_INNER_PADDING * 2);

    const textX = x + width / 2;
    const textY = barY + 17;
    this.context.fillStyle = "black";
    this.context.fillText(
      `${current} / ${maximum} (${(healthRatio * 100).toFixed(1)}%)`,
      textX + 1,
      textY + 1,
    );
    this.context.fillStyle = "white";
    this.context.fillText(
      `${current} / ${maximum} (${(healthRatio * 100).toFixed(1)}%)`,
      textX,
      textY,
    );
    this.context.restore();
  }
}
