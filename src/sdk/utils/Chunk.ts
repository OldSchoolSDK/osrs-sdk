import { Location } from "../Location";

/** Width and height of a RuneScape map chunk in tiles. */
export const CHUNK_SIZE = 8;

export interface ChunkPosition {
  x: number;
  y: number;
}

export class ChunkUtils {
  static fromLocation(location: Location): ChunkPosition {
    return {
      x: Math.floor(location.x / CHUNK_SIZE),
      y: Math.floor(location.y / CHUNK_SIZE),
    };
  }

  static equals(first: ChunkPosition, second: ChunkPosition): boolean {
    return first.x === second.x && first.y === second.y;
  }

  /**
   * Return the 3x3 chunk search order used by the client for NPC priority.
   *
   * SDK Y coordinates increase southward, so north is y - 1. The resulting
   * order is NE -> SW, column-major: the east column north-to-south, then the
   * centre column, then the west column.
   */
  static priorityGridOrder(center: ChunkPosition): ChunkPosition[] {
    return [
      { x: center.x + 1, y: center.y - 1 },
      { x: center.x + 1, y: center.y },
      { x: center.x + 1, y: center.y + 1 },
      { x: center.x, y: center.y - 1 },
      { x: center.x, y: center.y },
      { x: center.x, y: center.y + 1 },
      { x: center.x - 1, y: center.y - 1 },
      { x: center.x - 1, y: center.y },
      { x: center.x - 1, y: center.y + 1 },
    ];
  }
}
