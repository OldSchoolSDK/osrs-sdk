import { renderFaceIndices } from "../scripts/cache-render/face-rendering";

test("retains ordinary cache faces", () => {
  expect(renderFaceIndices(12, 0)).toEqual([12, 13, 14]);
  expect(renderFaceIndices(12, 1)).toEqual([12, 13, 14]);
});

test("degenerates client-hidden type-2 faces without removing their vertices", () => {
  expect(renderFaceIndices(12, 2)).toEqual([12, 12, 12]);
});
