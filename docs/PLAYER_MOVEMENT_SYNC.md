# Player movement and true-tile synchronisation

The SDK keeps two related positions for a moving player:

- **`location`** is the authoritative, discrete true tile. It is changed by
  the server-tick simulation (`movementStep` / `moveTowardsDestination`). Game
  logic, collision, targeting and the true-tile overlay use this position.
- **`perceivedLocation`** is the client-side visual position. It advances in
  fixed 20 ms client steps through a queue of upcoming tiles. It is deliberately
  allowed to be between tiles while the model is walking.

## Update sequence

At the default settings, server ticks are 600 ms apart and client ticks are 20
ms apart:

1. The server tick updates `location` by one tile when walking, or two tiles
   when running, and appends the corresponding visual steps to `path`.
2. Client ticks consume that queue at a constant rate: one tile per 30 client
   ticks while walking, and two tiles per 30 client ticks while running.
3. Rendering interpolates from the previous client position to the latest
   `perceivedLocation` using the time since the last client step. This removes
   dependence on the display refresh rate while retaining smooth motion between
   client updates.

The queue must contain the same number of steps as the authoritative update.
Enqueuing a second look-ahead tile for a walker makes the visual actor consume
steps faster than the true tile and eventually fall behind; this is why walking
enqueues one tile and running enqueues at most two.

When a path queue drains at a server boundary, the player retains the walking
pose if another authoritative step is pending. This prevents a transient
walk → idle → walk transition, which would reset the cache animation clock and
appear as a hitch.

## Rotation and animation

The desired heading is computed from the visual path segment (or the perceived
target position while attacking). Rotation takes the shortest angular path and
is advanced on client ticks. The heading of the last actual travel segment is
stored separately from transient target rotation, so reaching a destination
does not fall back to the default east-facing angle.

Locomotion pose selection is also client-side. Walking and running remain active
while visual movement is pending; strafe and turn poses are used only while the
actor is rotating toward a new heading. Cache-rendered animation time advances
continuously in the renderer, so changing render FPS does not restart a pose.

## References

The interpolation and actor-rotation investigation was informed by
[Dezinater/rs-map-viewer](https://github.com/Dezinater/rs-map-viewer), especially
its `src/mapviewer/webgl/npc/Npc.ts` and model movement code. Its sequence and
model implementation also helped distinguish authoritative tile updates from
client-side visual interpolation. The SDK's implementation is an adaptation
for the existing 600 ms server-tick simulation and Three.js renderer, not a
drop-in copy.

Movement regressions are covered in
[`test/sdk/PlayerMovement.test.ts`](../test/sdk/PlayerMovement.test.ts),
including frame-by-frame pose continuity, constant displacement, queue length,
and final facing in all four cardinal directions.
