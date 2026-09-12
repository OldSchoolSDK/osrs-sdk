export const CLIENT_ANGLE_RADIANS = Math.PI / 1024;
export const MIN_CAMERA_PITCH = -383 * CLIENT_ANGLE_RADIANS;
export const MAX_CAMERA_PITCH = -128 * CLIENT_ANGLE_RADIANS;

export type CameraAngles = {
  yaw: number;
  pitch: number;
};

/**
 * Samples browser pointer state using the camera rotation state machine from
 * the client. Pointer events only update the latest position; rotation is
 * applied once per 20 ms client cycle.
 */
export class ClientCameraRotation {
  private mouseX = 0;
  private mouseY = 0;
  private anchorX = 0;
  private anchorY = 0;
  private middleMouseDown = false;
  private yawVelocity = 0;
  private pitchVelocity = 0;

  setPointerPosition(x: number, y: number) {
    // The desktop client samples integer canvas coordinates.
    this.mouseX = Math.trunc(x);
    this.mouseY = Math.trunc(y);
  }

  setMiddleMouseDown(down: boolean) {
    this.middleMouseDown = down;
  }

  clientTick() {
    if (this.middleMouseDown) {
      const pitchDelta = this.mouseY - this.anchorY;
      this.pitchVelocity = pitchDelta * 2;
      this.anchorY = pitchDelta !== -1 && pitchDelta !== 1
        ? Math.trunc((this.anchorY + this.mouseY) / 2)
        : this.mouseY;

      const yawDelta = this.anchorX - this.mouseX;
      this.yawVelocity = yawDelta * 2;
      this.anchorX = yawDelta !== -1 && yawDelta !== 1
        ? Math.trunc((this.anchorX + this.mouseX) / 2)
        : this.mouseX;
    } else {
      this.yawVelocity = Math.trunc(this.yawVelocity / 2);
      this.pitchVelocity = Math.trunc(this.pitchVelocity / 2);
      this.anchorX = this.mouseX;
      this.anchorY = this.mouseY;
    }
  }

  /** Integrate the sampled velocity at the unlocked render rate. */
  frame({ yaw, pitch }: CameraAngles, deltaSeconds: number): CameraAngles {
    const clientCycles = deltaSeconds / 0.02;
    yaw += (this.yawVelocity / 2) * CLIENT_ANGLE_RADIANS * clientCycles;
    pitch -= (this.pitchVelocity / 2) * CLIENT_ANGLE_RADIANS * clientCycles;
    pitch = Math.max(MIN_CAMERA_PITCH, Math.min(MAX_CAMERA_PITCH, pitch));
    return { yaw, pitch };
  }
}
