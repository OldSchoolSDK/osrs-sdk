/**
 * Preserve vertices belonging to client-hidden faces for animation pivots,
 * while making their indexed triangle impossible to rasterize.
 *
 * ModelData.toModel converts face render type 2 to the Model faceColors3=-2
 * sentinel. The client excludes those faces from rasterization.
 */
export function renderFaceIndices(firstVertex: number, renderType?: number): [number, number, number] {
  return renderType === 2
    ? [firstVertex, firstVertex, firstVertex]
    : [firstVertex, firstVertex + 1, firstVertex + 2];
}
