import { Location } from "../../Location";
import { CLIENT_UNITS_PER_TILE } from "../constants";

export const CAMERA_FOCAL_SNAP_DISTANCE = 500;

export type CameraFocalPosition = {
  x: number;
  y: number;
};

/** Client-cycle camera focus following, retained internally in client units. */
export class CameraFocalPoint {
  private clientX: number | null = null;
  private clientY: number | null = null;
  private renderFromX: number | null = null;
  private renderFromY: number | null = null;
  private renderTimestamp = 0;

  reset() {
    this.clientX = null;
    this.clientY = null;
    this.renderFromX = null;
    this.renderFromY = null;
    this.renderTimestamp = 0;
  }

  initialise(location: Location, timestamp = window.performance.now()): CameraFocalPosition {
    if (this.clientX === null || this.clientY === null) return this.follow(location, timestamp);
    return this.position;
  }

  follow(location: Location, timestamp = window.performance.now()): CameraFocalPosition {
    const targetX = Math.round((location.x + 0.5) * CLIENT_UNITS_PER_TILE);
    const targetY = Math.round((location.y - 0.5) * CLIENT_UNITS_PER_TILE);

    if (this.clientX === null || this.clientY === null) {
      this.clientX = targetX;
      this.clientY = targetY;
      this.renderFromX = targetX;
      this.renderFromY = targetY;
    } else {
      this.renderFromX = this.clientX;
      this.renderFromY = this.clientY;
      const deltaX = targetX - this.clientX;
      const deltaY = targetY - this.clientY;
      if (Math.abs(deltaX) > CAMERA_FOCAL_SNAP_DISTANCE || Math.abs(deltaY) > CAMERA_FOCAL_SNAP_DISTANCE) {
        this.clientX = targetX;
        this.clientY = targetY;
        this.renderFromX = targetX;
        this.renderFromY = targetY;
      } else {
        this.clientX += Math.trunc(deltaX / 16);
        this.clientY += Math.trunc(deltaY / 16);
      }
    }
    this.renderTimestamp = timestamp;

    return this.position;
  }

  getPerceivedPosition(timestamp = window.performance.now()): CameraFocalPosition {
    if (this.clientX === null || this.clientY === null || this.renderFromX === null || this.renderFromY === null) {
      throw new Error("Camera focal point has not been initialised");
    }
    const alpha = Math.min(1, Math.max(0, (timestamp - this.renderTimestamp) / 20));
    return {
      x: (this.renderFromX + (this.clientX - this.renderFromX) * alpha) / CLIENT_UNITS_PER_TILE,
      y: (this.renderFromY + (this.clientY - this.renderFromY) * alpha) / CLIENT_UNITS_PER_TILE,
    };
  }

  private get position(): CameraFocalPosition {
    return {
      x: this.clientX / CLIENT_UNITS_PER_TILE,
      y: this.clientY / CLIENT_UNITS_PER_TILE,
    };
  }
}
