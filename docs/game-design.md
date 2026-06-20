# Tactical Breach — Game Design Doc

A round-based tactical shooter (Counter-Strike–style) with no blood/gore: hits show spark VFX and hit-markers, eliminations are a white-flash ragdoll. PMC vs. PMC, bomb defusal / hostage / VIP modes.

## Map: "Refinery" (Bomb Defusal layout)

```
                [Site B - Tank Farm]
                     |   |
   [Attacker Spawn]--+   +--[Catwalk Flank]--+
                     |   |                   |
              [Pipe Yard / Mid]------[Loading Dock]
                     |   |                   |
   [Defender Spawn]--+   +--[Office Flank]----+
                     |   |
                [Site A - Control Room]
```

- **Attacker Spawn → Mid (Pipe Yard):** open lane, low pipe cover, sightlines to both sites; risky without smoke.
- **Mid → Site A (Control Room):** tight corridor through a server room, one chokepoint door plus a breachable side wall.
- **Mid → Site B (Tank Farm):** elevated catwalk flank for high-ground rotates; tank clusters create close-quarters blind corners.
- **Loading Dock:** rear connector between flanks for fast rotates and late flanks.
- **Defender Spawn:** ~8-10s rotate to either site.

Design intent: Site A rewards methodical breach-and-clear play; Site B rewards verticality and flank timing. Mid is the contested skill-duel lane.

## Weapons

| Weapon | Type | Dmg (body/head) | Fire Rate | Mag | Range | Mobility | Price |
|---|---|---|---|---|---|---|---|
| PDX-9 | SMG | 22/45 | 800rpm | 30 | Short | High | 600 |
| AR-15K | Assault Rifle | 32/65 | 650rpm | 30 | Medium-Long | Medium | 2200 |
| VK-74 | Assault Rifle (high recoil) | 36/72 | 700rpm | 30 | Long | Medium | 2500 |
| MR-308 | Battle Rifle (semi-auto) | 45/90 | 300rpm | 20 | Long | Low-Medium | 3000 |
| SR-50 | Sniper Rifle (bolt) | 90/100 (1-shot headshot) | Bolt | 5 | Very Long | Low | 4750 |
| SG-12 | Shotgun | 80 (close only) | Pump | 8 | Very Short | Medium | 1500 |
| MP-Sidearm | Pistol (default) | 18/40 | 400rpm | 12 | Short | High | Free |
| HC-Magnum | Pistol (upgrade) | 35/70 | 200rpm | 6 | Medium | High | 700 |

## Gear / Utility

| Item | Effect | Price |
|---|---|---|
| Smart Smoke | Smoke + blocks thermal optics 8s | 400 |
| Breach Charge | Destroys a wall/door segment, opens new lane | 500 |
| Recon Drone | Reveals enemies in radius for 5s | 400 |
| EMP Grenade | Disables gadgets/drones in radius, no damage | 350 |
| Flash-Stun | Blinds + slows, no damage | 250 |
| Armor (Light/Heavy) | +50/+100 effective HP, Heavy -10% mobility | 400/1000 |
| Defuse Kit | Halves defuse time | 400 |

## iPad / Touch & Performance Considerations

To run well on an iPad (touch input, thermal/battery limits, no mouse-precision aim):

**Controls**
- Dual virtual sticks (left = move, right = look/aim) with deadzone tuning for thumb drift.
- Auto-stabilized aim assist (magnetism + slowdown near targets) to compensate for lack of mouse precision.
- Tap-to-fire on full-auto weapons is unreliable on glass — default full-auto weapons to hold-to-fire; single-action weapons (sniper, pistol) use a discrete fire button.
- Contextual action button (single button cycles through interact/plant/defuse/reload based on context) instead of a full keyboard's worth of bindings.
- Gear wheel (radial menu) opened with a corner swipe for grenades/utility instead of per-item hotkeys.
- Support external controller (MFi/Bluetooth) and keyboard+mouse via iPad's pointer support as opt-in, since competitive players often pair iPads with accessories.

**Performance**
- Target devices split into tiers (e.g., M-series iPads vs. A-series): scale shadow resolution, draw distance, and player-count-visible-effects (smoke particle density) per tier.
- Cap simultaneous dynamic lights/particles (smart smoke, breach charge debris) to avoid thermal throttling during long sessions.
- Use baked lighting on static geometry (Refinery's pipes/tanks) rather than fully dynamic GI to save battery.
- Reduce round-based asset re-streaming by keeping the full map loaded for the round's duration rather than streaming chunks (matches the small-map design already).

**UX**
- Larger hit-marker/UI elements and high-contrast outlines for readability at iPad viewing distance.
- Round timer, money/economy HUD, and minimap kept in thumb-safe zones (top corners) away from the virtual sticks.
