type CacheDefinitionOverrides = {
  recolorToFind?: number[];
  recolorToReplace?: number[];
  retextureToFind?: number[];
  retextureToReplace?: number[];
  textureToFind?: number[];
  textureToReplace?: number[];
};

/** Apply definition-level colour/texture substitutions in cache order. */
export function applyDefinitionOverrides(
  color: number,
  texture: number,
  definition?: CacheDefinitionOverrides,
): { color: number; texture: number } {
  let resolvedColor = color;
  definition?.recolorToFind?.forEach((candidate, index) => {
    if (resolvedColor === candidate && definition.recolorToReplace?.[index] !== undefined) {
      resolvedColor = definition.recolorToReplace[index];
    }
  });

  let resolvedTexture = texture;
  const textureToFind = definition?.retextureToFind ?? definition?.textureToFind;
  const textureToReplace = definition?.retextureToReplace ?? definition?.textureToReplace;
  textureToFind?.forEach((candidate, index) => {
    if (resolvedTexture === candidate && textureToReplace?.[index] !== undefined) {
      resolvedTexture = textureToReplace[index];
    }
  });

  return { color: resolvedColor, texture: resolvedTexture };
}
