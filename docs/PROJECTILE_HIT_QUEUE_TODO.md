# Projectile hit queue TODO

## Problem

`Projectile` currently combines two independent responsibilities:

- a pending combat hit, advanced in game ticks; and
- the information used to construct its client-cycle `ProjectileGraphic`.

Targets already store incoming `Projectile` instances as a delayed-hit queue. A
projectile therefore remains alive for several game ticks merely to apply its
damage later, even though its visual has an independent lifetime in
`ProjectileGraphic`.

## Proposed direction

Replace target-owned combat projectiles with a `PendingHit` (or `QueuedHit`)
type. When an attack is rolled, queue that hit directly on its target and add a
separate `ProjectileGraphic` to the region:

```ts
target.queueHit(pendingHit);
region.addProjectileGraphic(new ProjectileGraphic(projectileVisuals));
```

The pending hit should own only game-tick combat state such as its source,
damage, attack style, landing delay, prayer-at-hit behavior, cancellation when
the attacker dies, and hit sound. `ProjectileGraphic` should retain its current
client-cycle behavior but receive a visual-only snapshot rather than retaining
the combat object.

## Behavior to preserve

- `ProjectileOptions.sound` plays immediately, on the game tick that creates
  the attack.
- `visuals.projectileSound` plays when the visual reaches its client-cycle
  start offset.
- Damage, healing, `hitSound`, and hitsplats remain aligned to the pending
  hit's game-tick landing time.
- Prayer may still be checked at landing when `checkPrayerAtHit` is enabled.
- `cancelOnDeath`, auto-retaliation, aggro changes, and flinch timing retain
  their current ordering.
- Landed hits remain available long enough for the existing hitsplat rendering
  lifecycle.
- Projectiles aimed at locations rather than units become region-owned pending
  world impacts, or an equivalent delayed action with the same tick ordering.

Tests and sample code that inspect `incomingProjectiles`, `remainingDelay`, or
the combat `Projectile` directly will need to migrate to the new queue type.
