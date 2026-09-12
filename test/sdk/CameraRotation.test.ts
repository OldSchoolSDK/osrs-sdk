import {
  CLIENT_ANGLE_RADIANS,
  ClientCameraRotation,
  MAX_CAMERA_PITCH,
  MIN_CAMERA_PITCH,
  RELAXED_MAX_CAMERA_PITCH,
  RELAXED_MIN_CAMERA_PITCH,
} from "../../src/sdk/CameraRotation";

test("samples the latest middle-mouse position once per client cycle", () => {
  const rotation = new ClientCameraRotation();
  rotation.setPointerPosition(100, 100);
  rotation.clientTick();
  let angles = { yaw: 0, pitch: -0.7 };

  rotation.setMiddleMouseDown(true);
  rotation.setPointerPosition(104, 102);
  rotation.setPointerPosition(110, 106);
  rotation.clientTick();

  angles = rotation.frame(angles, 0.01);
  expect(angles.yaw).toBeCloseTo(-5 * CLIENT_ANGLE_RADIANS);
  expect(angles.pitch).toBeCloseTo(-0.7 - 3 * CLIENT_ANGLE_RADIANS);

  angles = rotation.frame(angles, 0.01);
  expect(angles.yaw).toBeCloseTo(-10 * CLIENT_ANGLE_RADIANS);
  expect(angles.pitch).toBeCloseTo(-0.7 - 6 * CLIENT_ANGLE_RADIANS);

  // The averaged anchor continues to approach the same sampled position.
  rotation.clientTick();
  angles = rotation.frame(angles, 0.02);
  expect(angles.yaw).toBeCloseTo(-15 * CLIENT_ANGLE_RADIANS);
  expect(angles.pitch).toBeCloseTo(-0.7 - 9 * CLIENT_ANGLE_RADIANS);
});

test("a one-pixel movement is consumed instead of sticking in the averaged anchor", () => {
  const rotation = new ClientCameraRotation();
  rotation.setPointerPosition(100, 100);
  rotation.clientTick();
  let angles = { yaw: 0, pitch: -0.7 };
  rotation.setMiddleMouseDown(true);
  rotation.setPointerPosition(101, 101);

  rotation.clientTick();
  angles = rotation.frame(angles, 0.02);
  expect(angles.yaw).toBeCloseTo(-CLIENT_ANGLE_RADIANS);
  expect(angles.pitch).toBeCloseTo(-0.7 - CLIENT_ANGLE_RADIANS);

  rotation.clientTick();
  angles = rotation.frame(angles, 0.02);
  expect(angles.yaw).toBeCloseTo(-CLIENT_ANGLE_RADIANS);
  expect(angles.pitch).toBeCloseTo(-0.7 - CLIENT_ANGLE_RADIANS);
});

test("decelerates after release and clamps pitch to the client range", () => {
  const rotation = new ClientCameraRotation();
  rotation.setPointerPosition(0, 0);
  rotation.clientTick();
  let angles = { yaw: 0, pitch: MAX_CAMERA_PITCH };
  rotation.setMiddleMouseDown(true);
  rotation.setPointerPosition(-20, -1000);
  rotation.clientTick();
  angles = rotation.frame(angles, 0.02);

  expect(angles.pitch).toBe(MAX_CAMERA_PITCH);
  expect(angles.yaw).toBeCloseTo(20 * CLIENT_ANGLE_RADIANS);

  rotation.setMiddleMouseDown(false);
  rotation.clientTick();
  angles = rotation.frame(angles, 0.02);
  expect(angles.yaw).toBeCloseTo(30 * CLIENT_ANGLE_RADIANS);

  rotation.setMiddleMouseDown(true);
  rotation.setPointerPosition(-20, 1000);
  rotation.clientTick();
  angles = rotation.frame({ ...angles, pitch: MIN_CAMERA_PITCH }, 0.02);
  expect(angles.pitch).toBe(MIN_CAMERA_PITCH);
});

test("supports relaxed camera pitch limits in both directions", () => {
  const rotation = new ClientCameraRotation();
  rotation.setPointerPosition(0, 0);
  rotation.clientTick();
  rotation.setMiddleMouseDown(true);
  rotation.setPointerPosition(0, 1000);
  rotation.clientTick();

  const initial = { yaw: 0, pitch: MIN_CAMERA_PITCH };
  const standard = rotation.frame(initial, 0.02);
  const relaxed = rotation.frame(initial, 0.02, true);

  expect(standard.pitch).toBe(MIN_CAMERA_PITCH);
  expect(relaxed.pitch).toBe(RELAXED_MIN_CAMERA_PITCH);

  rotation.setPointerPosition(0, -1000);
  rotation.clientTick();
  const standardFlat = rotation.frame({ yaw: 0, pitch: MAX_CAMERA_PITCH }, 0.02);
  const relaxedFlat = rotation.frame({ yaw: 0, pitch: MAX_CAMERA_PITCH }, 0.02, true);

  expect(standardFlat.pitch).toBe(MAX_CAMERA_PITCH);
  expect(relaxedFlat.pitch).toBe(RELAXED_MAX_CAMERA_PITCH);
});

test("render rate does not change total rotation over a client cycle", () => {
  const atFps = (fps: number) => {
    const rotation = new ClientCameraRotation();
    rotation.setPointerPosition(100, 100);
    rotation.clientTick();
    rotation.setMiddleMouseDown(true);
    rotation.setPointerPosition(112, 108);
    rotation.clientTick();

    let angles = { yaw: 0, pitch: -0.7 };
    const frames = Math.round(fps * 0.02);
    for (let frame = 0; frame < frames; frame++) {
      angles = rotation.frame(angles, 0.02 / frames);
    }
    return angles;
  };

  const oneFrame = atFps(50);
  const threeFrames = atFps(150);
  expect(threeFrames.yaw).toBeCloseTo(oneFrame.yaw);
  expect(threeFrames.pitch).toBeCloseTo(oneFrame.pitch);
});
