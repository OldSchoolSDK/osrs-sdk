import { CLIENT_ANGLE_RADIANS } from "./CameraRotation";
import { CLIENT_UNITS_PER_TILE } from "../constants";

export const CAMERA_ORBIT_BASE_CLIENT_UNITS = 600;
export const CAMERA_ORBIT_CLIENT_UNITS_PER_PITCH = 3;

/** Base client orbit distance before viewport-height zoom scaling. */
export function cameraOrbitDistance(pitchRadians: number) {
  const pitchClientUnits = -pitchRadians / CLIENT_ANGLE_RADIANS;
  return (
    CAMERA_ORBIT_BASE_CLIENT_UNITS + pitchClientUnits * CAMERA_ORBIT_CLIENT_UNITS_PER_PITCH
  ) / CLIENT_UNITS_PER_TILE;
}
