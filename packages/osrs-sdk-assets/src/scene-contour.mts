/** Conform cache model vertices (Y down) to reader terrain elevations (Y up). */
export function contourModel(model, location, width, length, terrain, clipType) {
  const xzMagnitude = Math.ceil(
    Math.sqrt(
      Math.max(
        ...model.vertexPositionsX.map(
          (value, index) => value * value + model.vertexPositionsZ[index] * model.vertexPositionsZ[index],
        ),
      ),
    ),
  );
  const xOffset = location.position.localX * 128 + width * 64;
  const yOffset = location.position.localY * 128 + length * 64;
  const left = (xOffset - xzMagnitude) >> 7,
    right = (xOffset + xzMagnitude + 127) >> 7;
  const top = (yOffset - xzMagnitude) >> 7,
    bottom = (yOffset + xzMagnitude + 127) >> 7;
  const corners = [
    terrain.heightAt(left, top),
    terrain.heightAt(right, top),
    terrain.heightAt(left, bottom),
    terrain.heightAt(right, bottom),
  ];
  if (corners.every((value) => value === terrain.height)) return false;
  const interpolateHeight = (worldX, worldY) => {
    const fractionX = worldX & 127,
      fractionY = worldY & 127;
    const tileX = worldX >> 7,
      tileY = worldY >> 7;
    // Match the client's signed heightmap before integer interpolation. The
    // reader returns positive elevations, while model-space Y grows downward.
    const first = -terrain.heightAt(tileX, tileY),
      second = -terrain.heightAt(tileX + 1, tileY);
    const third = -terrain.heightAt(tileX, tileY + 1),
      fourth = -terrain.heightAt(tileX + 1, tileY + 1);
    const north = (first * (128 - fractionX) + second * fractionX) >> 7;
    const south = (third * (128 - fractionX) + fourth * fractionX) >> 7;
    return (north * (128 - fractionY) + south * fractionY) >> 7;
  };
  for (let vertex = 0; vertex < model.vertexCount; vertex++) {
    const originalY = model.vertexPositionsY[vertex];
    if (clipType === 0) {
      model.vertexPositionsY[vertex] =
        interpolateHeight(xOffset + model.vertexPositionsX[vertex], yOffset + model.vertexPositionsZ[vertex]) +
        originalY +
        terrain.height;
    } else {
      const scaledY = (-originalY << 16) / terrain.height;
      if (scaledY < clipType) {
        const sampled = interpolateHeight(
          xOffset + model.vertexPositionsX[vertex],
          yOffset + model.vertexPositionsZ[vertex],
        );
        model.vertexPositionsY[vertex] = ((clipType - scaledY) * (sampled + terrain.height)) / clipType + originalY;
      }
    }
  }
  return true;
}
