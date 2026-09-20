/** The game client represents one world tile as 128 local coordinate units. */
export const CLIENT_UNITS_PER_TILE = 128;

/** Number of client update cycles processed per second. */
export const CLIENT_CYCLES_PER_SECOND = 50;

/** Duration of one client update cycle in milliseconds. */
export const CLIENT_CYCLE_MS = 1000 / CLIENT_CYCLES_PER_SECOND;
