import { defineConfig } from "osrs-sdk-assets";
import { SAMPLE_ASSETS } from "./sample/assets";
import { SCENE_TOUCHUPS } from "./sample/scene-touchups";

export default defineConfig({
  cache: { openrs2: 2437 },
  assets: SAMPLE_ASSETS,
  scenes: SCENE_TOUCHUPS,
  outDir: "./cache-render-bundle",
});
