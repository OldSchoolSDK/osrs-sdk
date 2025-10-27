import AttackXpDropImage from "../assets/images/xpdrops/attack.png";
import StrengthXpDropImage from "../assets/images/xpdrops/strength.png";
import DefenceXpDropImage from "../assets/images/xpdrops/defence.png";
import RangeXpDropImage from "../assets/images/xpdrops/range.png";
import MagicXpDropImage from "../assets/images/xpdrops/magic.png";
import HitpointXpDropImage from "../assets/images/xpdrops/hitpoint.png";
import { find } from "lodash";
import { XpDrop } from "./XpDrop";
import { ImageLoader } from "./utils/ImageLoader";
import { Settings } from "./Settings";

/* eslint-disable @typescript-eslint/no-empty-interface */

interface SkillTypes {
  type: string;
  imgSrc: string;
  image?: HTMLImageElement;
}

interface Empty {
  // Empty interface
}

export class XpDropController {
  static controller = new XpDropController();
  static outlineColor = "#3A3021";
  static inlineColor = "#5D5344";
  static fillColor = "#5D534473"; // guess ATM

  canvas: OffscreenCanvas = new OffscreenCanvas(110, 200);
  ctx: OffscreenCanvasRenderingContext2D;
  drops: XpDrop[] | Empty[];
  lastDropSkill?: string;
  timeout: NodeJS.Timeout;

  static skills: SkillTypes[] = [
    { type: "attack", imgSrc: AttackXpDropImage, image: null },
    { type: "strength", imgSrc: StrengthXpDropImage, image: null },
    { type: "defence", imgSrc: DefenceXpDropImage, image: null },
    { type: "range", imgSrc: RangeXpDropImage, image: null },
    { type: "magic", imgSrc: MagicXpDropImage, image: null },
    { type: "hitpoint", imgSrc: HitpointXpDropImage, image: null },
  ];

  constructor() {
    this.ctx = this.canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;

    this.drops = [{ abc: "asdf" }, {}, {}, {}];
    this.lastDropSkill = null;
    this.startupTimeout();
  }

  startupTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    this.timeout = setTimeout(() => {
      this.lastDropSkill = null;
    }, 1000 * 16); // Not sure if 16 seconds is correct but good enough for now
  }

  registerXpDrop(drop: XpDrop) {
    this.drops.push(drop);
    if (drop.skill) {
      this.lastDropSkill = drop.skill;
    }
  }

  tick() {
    this.drops.shift();
    if (this.drops.length < 4) {
      this.drops.push({} as XpDrop); // TODO: This is bad
    }
  }

  draw(destinationCanvas: CanvasRenderingContext2D, x: number, y: number, tickPercent: number) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!Settings.displayXpDrops) {
      return;
    }
    const scale = Settings.maxUiScale;
    this.canvas.width = 110 * scale * 2;
    this.canvas.height = 200 * scale * 2;

    const skillInfo = find(XpDropController.skills, { type: this.lastDropSkill });

    if (skillInfo && skillInfo.type) {
      // Draw overall XP box at top
      this.ctx.lineWidth = 1;
      this.ctx.strokeStyle = XpDropController.outlineColor;
      this.ctx.strokeRect(0, 0, 110 * scale, 42 * scale);
      this.ctx.strokeStyle = XpDropController.inlineColor;
      this.ctx.strokeRect(1 * scale, 1 * scale, 109 * scale, 41 * scale);
      this.ctx.strokeRect(1 * scale, 30 * scale, 108 * scale, 11 * scale);
      this.ctx.fillStyle = XpDropController.fillColor;
      this.ctx.fillRect(2 * scale, 2 * scale, 108 * scale, 40 * scale);
      this.ctx.fillStyle = "#000000";
      this.ctx.fillRect(2 * scale, 31 * scale, 106 * scale, 9 * scale);
      this.ctx.fillStyle = "#00BF00";
      this.ctx.fillRect(3 * scale, 32 * scale, 90 * scale, 7 * scale);

      this.ctx.fillStyle = "#FFFFFF";
      this.ctx.font = `${Math.floor(16 * scale)}px Stats_11`;
      this.ctx.textAlign = "right";

      this.ctx.drawImage(skillInfo.image, 4 * scale, 2 * scale, 26 * scale, 26 * scale);
      this.ctx.fillStyle = "#000000";

      this.ctx.fillText("200,000,000", 106 * scale, 21 * scale);
      this.ctx.fillStyle = "#FFFFFF";
      this.ctx.fillText("200,000,000", 105 * scale, 20 * scale);
    }

    const offsetX = 120;
    const fontSize = Math.max(16 * scale, 24);
    const imageSize = fontSize + 1;
    this.ctx.font = `${fontSize}px Stats_11`;
    this.ctx.textAlign = "right";
    this.ctx.textBaseline = "top";
    this.drops.forEach((drop, index) => {
      if (!drop.skill) {
        return;
      }
      const offsetY = (index - tickPercent) * imageSize + 85;
      const xpString = String(Math.floor(drop.xp));
      const damageString = Settings.showPredictedHit && drop.damage && drop.skill !== 'hitpoint'
        ? ` (${drop.damage})`
        : '';
      const xpWidth = this.ctx.measureText(xpString).width;
      const damageWidth = this.ctx.measureText(damageString).width;
      // left-most: predicted damage string
      if (damageString) {
        this.ctx.fillStyle = "#FF0000";
        this.ctx.fillText(damageString, offsetX, offsetY);
      }
      // next: xp drop
      this.ctx.fillStyle = "#FFFFFF";
      this.ctx.fillText(xpString, offsetX - damageWidth, offsetY);
      // last: skill icon
      const skillInfo = find(XpDropController.skills, { type: drop.skill });
      if (skillInfo.image) {
        this.ctx.drawImage(
          skillInfo.image,
          offsetX - xpWidth - damageWidth - imageSize - (2 * scale),
          offsetY,
          imageSize,
          imageSize,
        );
      }
    });
    destinationCanvas.drawImage(this.canvas, x, y);
  }
}

XpDropController.skills.forEach((skill) => {
  skill.image = ImageLoader.createImage(skill.imgSrc);
});
