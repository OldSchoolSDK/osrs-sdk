import { LineOfSight } from "../../sdk/LineOfSight";
import { Mob } from "../../sdk/Mob";
import { ChunkUtils } from "../../sdk/utils/Chunk";

const BOUNCE_RADIUS = 2;
const TARGET_TILE_RADIUS = 3;

export type VenatorTile = [number, number];
type HasLineOfSight = (from: VenatorTile, to: VenatorTile) => boolean;

const isInRadius = ([x, y]: VenatorTile, [targetX, targetY]: VenatorTile, radius: number) =>
  Math.abs(x - targetX) <= radius && Math.abs(y - targetY) <= radius;

export function getVenatorCenterTile(x: number, y: number, size: number): VenatorTile {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`Unsupported NPC size ${size}`);
  }

  // Size two is the one exception: the game uses the south-west anchor tile.
  if (size === 2) return [x, y];

  // Odd-sized NPCs use their geometric centre. For even sizes >= 4 this is
  // the north-east tile of the inner 2x2 square.
  const offset = Math.floor(size / 2);
  return [x + offset, y - offset];
}

function getAllTiles(x: number, y: number, size: number): VenatorTile[] {
  const tiles: VenatorTile[] = [];
  for (let dx = 0; dx < size; dx++) {
    for (let dy = 0; dy < size; dy++) tiles.push([x + dx, y - dy]);
  }
  return tiles;
}

function getClosestTile([x, y]: VenatorTile, targetX: number, targetY: number, targetSize: number): VenatorTile {
  return [
    Math.max(targetX, Math.min(targetX + targetSize - 1, x)),
    Math.max(targetY - targetSize + 1, Math.min(targetY, y)),
  ];
}

export function canVenatorBounce(
  sourceX: number,
  sourceY: number,
  sourceSize: number,
  targetX: number,
  targetY: number,
  targetSize: number,
  hasLineOfSight: HasLineOfSight = () => true,
): boolean {
  const sourceCenter = getVenatorCenterTile(sourceX, sourceY, sourceSize);
  const targetCenter = getVenatorCenterTile(targetX, targetY, targetSize);
  const sourceScanTiles = sourceSize % 2 === 1
    ? [sourceCenter]
    : getAllTiles(sourceX, sourceY, sourceSize);
  const targetTiles = getAllTiles(targetX, targetY, targetSize);
  const targetClosestTile = getClosestTile(sourceCenter, targetX, targetY, targetSize);

  return sourceScanTiles.some((tile) => isInRadius(tile, targetCenter, BOUNCE_RADIUS))
    && targetTiles.some((tile) => isInRadius(sourceCenter, tile, TARGET_TILE_RADIUS))
    && ((sourceCenter[0] === targetClosestTile[0] && sourceCenter[1] === targetClosestTile[1])
      || hasLineOfSight(sourceCenter, targetClosestTile));
}

export function canVenatorBounceBetween(source: Mob, target: Mob): boolean {
  if (source.region !== target.region) return false;
  return canVenatorBounce(
    source.location.x,
    source.location.y,
    source.size,
    target.location.x,
    target.location.y,
    target.size,
    ([fromX, fromY], [toX, toY]) => LineOfSight.hasLineOfSight(
      source.region,
      fromX,
      fromY,
      toX,
      toY,
      1,
      TARGET_TILE_RADIUS,
      false,
    ),
  );
}

export function getNextVenatorBounceTarget(source: Mob): Mob | null {
  for (const chunk of ChunkUtils.priorityGridOrder(source.chunkPosition)) {
    for (const candidate of source.region.getNpcsInChunk(chunk.x, chunk.y)) {
      if (candidate === source || candidate.isDying() || candidate.currentStats.hitpoint <= 0) continue;
      // TODO: Exclude NPCs which already have lethal damage queued once the
      // engine exposes that state reliably.
      if (candidate.canBeAttacked() && canVenatorBounceBetween(source, candidate)) return candidate;
    }
  }
  return null;
}
