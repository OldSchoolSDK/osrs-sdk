import {
  CAMERA_ORBIT_BASE_CLIENT_UNITS,
  CAMERA_ORBIT_CLIENT_UNITS_PER_PITCH,
  cameraOrbitDistance,
} from "../../src/sdk/utils/camera/CameraOrbit";
import { CLIENT_ANGLE_RADIANS } from "../../src/sdk/utils/camera/CameraRotation";
import { CLIENT_UNITS_PER_TILE } from "../../src/sdk/utils/constants";

test.each([0, 128, 256, 383, 512])(
  "derives orbit distance from a pitch of %i client units",
  (pitch) => {
    expect(cameraOrbitDistance(-pitch * CLIENT_ANGLE_RADIANS)).toBeCloseTo(
      (CAMERA_ORBIT_BASE_CLIENT_UNITS + pitch * CAMERA_ORBIT_CLIENT_UNITS_PER_PITCH)
        / CLIENT_UNITS_PER_TILE,
    );
  },
);

test("changes distance continuously between client angle units", () => {
  const pitch = 200.5;

  expect(cameraOrbitDistance(-pitch * CLIENT_ANGLE_RADIANS)).toBeCloseTo(
    (CAMERA_ORBIT_BASE_CLIENT_UNITS + pitch * CAMERA_ORBIT_CLIENT_UNITS_PER_PITCH)
      / CLIENT_UNITS_PER_TILE,
  );
});
