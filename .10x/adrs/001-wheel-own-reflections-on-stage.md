# ADR-001: Wheels reflect their own studio on the stage

**Status:** Accepted
**Date:** 2026-11-12
**Feature:** presentation-ready
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
On /configure the car stands on the stage look: black backdrop, one overhead softbox and two rails in the reflection cove, studio lights off. The body reads well because its large, mostly horizontal panels mirror the overhead box. Rim spokes are near-vertical and look sideways into the black, so dark and polished finishes render as black holes (docs/ingest/stock-wheels.jpg). The owner wants the rims photoreal for a presentation, fast.

## Decision
In the stage and viewer looks, the wheel materials get the softbox studio's reflection map (already built at start for the studio look) as their own envMap, at a separate strength. Body and parts keep the cove. The studio look is unchanged.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Brighten the stage cove (more side boxes) | One environment | Changes the body's reflections, which the owner approved against the Cycles stills | Risks the body look |
| Direct lights aimed at the wheels | Cheap | Direct lights give point highlights, not the long softbox reflections that make metal read; need shadows | Looks CG |
| New Tripo meshes | Owner's suggestion | Geometry is not the problem; image-to-3D blurs thin spokes; no API key | Wrong cause |
| Pre-rendered Cycles wheels | Truly photoreal | Not live on the car; CPU-only renders here | Too slow for this deadline |

## Consequences
### Positive
- Rims show long softbox reflections on the spokes in every finish; the body look is untouched.
- One method, no new assets, reversible with ?wheelEnv=0 behaviour or a revert.
### Negative
- Physically, the wheels reflect a different room from the body. Acceptable: product photography does the same with wheel-only cards.
### Risks
- Too bright against the black stage: tuned by render; URL override for comparisons.
- SwiftShader renders only; the owner checks one real device.

## Dependencies
- environmentTarget (softbox studio PMREM) built in setupEnvironment.
- Constrains later stage tuning: wheel reflections no longer follow STAGE.overhead/rails.
