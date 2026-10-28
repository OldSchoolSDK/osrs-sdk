import type * as THREE from "three";
import type { CacheRenderPayload } from "../../../cache-render-format";

/** Per-face cache alpha rides a `cacheAlpha` attribute. MeshBasicMaterial reads vertex colour as RGB. */
export function enableVertexAlpha(material: THREE.Material) {
  material.transparent = true;
  material.alphaTest = 0.01;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float cacheAlpha; varying float vCacheAlpha;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n\tvCacheAlpha = cacheAlpha;",
    );
    shader.fragmentShader = `varying float vCacheAlpha;\n${shader.fragmentShader}`
      .replace("void main() {", "void main() {\n\tif (vCacheAlpha < 0.01) discard;")
      .replace("#include <alphatest_fragment>", "diffuseColor.a *= vCacheAlpha;\n\t#include <alphatest_fragment>")
      .replace("#include <output_fragment>", "#include <output_fragment>\n\tgl_FragColor.a *= vCacheAlpha;");
  };
}

export function needsVertexAlpha(payload: CacheRenderPayload) {
  // A model with only opaque faces must stay in Three.js's opaque render
  // queue. Putting it in the transparent queue changes its sorting against
  // effects such as Sol's sand pools, even though cacheAlpha is always one.
  // Include legacy type-5 transforms because they can animate face alpha
  // after an initially-opaque model has loaded.
  return Boolean(
    payload.alphas?.some((alpha) => alpha !== 0) ||
      Object.values(payload.animations ?? {}).some((animation) =>
        animation.rawFrames?.some((frame) => frame.types.includes(5)),
      ),
  );
}
