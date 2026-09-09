# Actor movement and true-tile synchronisation

The SDK keeps two related positions for every moving `Unit` (players and NPCs):

- **`location`** is the authoritative, discrete true tile. It is changed by
  the server-tick simulation (`movementStep` / `moveTowardsDestination`). Game
  logic, collision, targeting and the true-tile overlay use this position.
- **`perceivedLocation`** is the client-side visual position. It advances in
  fixed 20 ms client steps through `visualPath`, a queue of upcoming tiles. It
  is deliberately allowed to be between tiles while the model is walking.

`Unit` owns `visualPath`, the shared interpolation state, and the common
`advanceVisualPath` implementation. Players add one or two authoritative steps
after pathfinding, depending on whether they walk or run. NPCs add the tile
selected by `Mob.movementStep`; NPC steps currently use walking speed.

## Update sequence

At the default settings, server ticks are 600 ms apart and client ticks are 20
ms apart:

1. The server tick updates `location` by one tile when walking, or two tiles
   when running, and appends the corresponding visual steps to `visualPath`.
2. Client ticks consume that queue at one tile per 30 client ticks while
   walking, and two tiles per 30 client ticks while running. If the visual
   queue grows beyond two or three tiles, bounded 1.5x/2x catch-up rates drain
   the backlog.
3. Rendering interpolates from the previous client position to the latest
   `perceivedLocation` using the time since the last client step. This removes
   dependence on the display refresh rate while retaining smooth motion between
   client updates.

The queue must contain the same number of steps as the authoritative update.
Enqueuing a second look-ahead tile for a walker makes the visual actor consume
steps faster than the true tile and eventually fall behind; this is why walking
enqueues one tile and running enqueues at most two.

When an NPC path queue drains at a server boundary, a locomotion latch retains
the walking pose until a server tick confirms that the NPC did not move. This
prevents a transient walk → idle → walk transition from resetting the cache
animation clock once per tile. Teleports and death clear both the visual queue
and this latch.

While turning, translation is intentionally slowed to half speed and the
player rotates at 64 orientation units per client tick. This reproduces the
short visual lag seen when changing direction: the model can briefly continue
its previous travel before completing the turn. Running pose selection remains
based on the path's movement type, so this slowdown does not cause Run/Walk
animation resets.

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

## Action animations and movement precedence

The game client can temporarily stop consuming an actor's visual path while a
one-shot action animation plays. The authoritative `location` and subsequent
path updates continue normally; only the client-side `perceivedLocation` is
held. This is why an NPC can appear to pause for an attack and then catch up to
its true tile.

Sequence definitions control this behavior with two integer properties:

- Cache opcode 9 is exported as `precedenceAnimating`.
- Cache opcode 10 is exported as `priority`.
- A value of `0` blocks visual movement. Non-zero values permit it.

When these opcodes are absent, the cache reader reports `-1`. During asset
generation the adapter applies the client's `SequenceDefinition.postDecode()`
defaults: both values become `0` for a sequence without an interleave/mask, or
`2` for a sequence with one.

`Unit.playAnimation` snapshots the visual queue length when the action begins.
While that animation remains active, `advanceVisualPath` selects the same
property as the client:

- If steps were already queued when the animation started, it consults
  `precedenceAnimating`.
- If the queue was empty and movement arrived afterward, it consults
  `priority`.

Every blocked 20 ms client tick increments delayed movement debt without
consuming a path step. Once the animation permits movement or finishes, an
actor with multiple queued steps moves at twice the normal walking speed and
repays one delayed tick per client update. The debt is reset when the queue
empties, or when the actor teleports or dies.

Cache-backed renderers expose these properties at runtime through
`unit.getAnimationMetadata(animationId)`. Semantic pose IDs are resolved
through the model's pose map before lookup. The method returns `undefined` for
a renderer without cache metadata or before its assets have loaded.

## References

The interpolation and actor-rotation investigation was informed by
[Dezinater/rs-map-viewer](https://github.com/Dezinater/rs-map-viewer), especially
its `src/mapviewer/webgl/npc/Npc.ts` and model movement code. Its sequence and
model implementation also helped distinguish authoritative tile updates from
client-side visual interpolation. The SDK's implementation is an adaptation
for the existing 600 ms server-tick simulation and Three.js renderer, not a
drop-in copy.

Movement regressions are covered in
[`test/sdk/PlayerMovement.test.ts`](../test/sdk/PlayerMovement.test.ts) and
[`test/sdk/Interpolation.test.ts`](../test/sdk/Interpolation.test.ts), including
frame-by-frame pose continuity, queue consumption, animation precedence,
catch-up behavior, and final facing in all four cardinal directions.
