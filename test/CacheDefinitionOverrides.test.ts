import { applyDefinitionOverrides } from "../scripts/cache-render/definition-overrides";

test("applies item definition recolours and retextures", () => {
  expect(applyDefinitionOverrides(6447, 12, {
    recolorToFind: [6447],
    recolorToReplace: [6806],
    retextureToFind: [12],
    retextureToReplace: [34],
  })).toEqual({ color: 6806, texture: 34 });
});

test("supports spot-animation texture field names and cache-order replacements", () => {
  expect(applyDefinitionOverrides(1, 12, {
    recolorToFind: [1, 2],
    recolorToReplace: [2, 3],
    textureToFind: [12],
    textureToReplace: [34],
  })).toEqual({ color: 3, texture: 34 });
});

test("leaves unmatched model values unchanged", () => {
  expect(applyDefinitionOverrides(99, -1, {
    recolorToFind: [1],
    recolorToReplace: [2],
  })).toEqual({ color: 99, texture: -1 });
});
