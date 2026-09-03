export { TileMarker } from "./TileMarker";
export { InvisibleMovementBlocker } from "./MovementBlocker";

export * from "./equipment";
export * from "./items";
export * from "./weapons";

export async function loadLoadoutRegistry() {
  const { LoadoutRegistry } = await import("./LoadoutRegistry");
  return LoadoutRegistry;
}
