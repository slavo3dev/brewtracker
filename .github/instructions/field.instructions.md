---
applyTo: "apps/mobile/**,packages/types/src/geofence.ts"
---

# Field workflow

Drivers and techs use the Expo app on bad networks, often mid-visit. A change that skips a gate or waits on the network loses the visit or records bad data.

The visit sequence is `SERVICE_VISIT_STEPS` in `apps/mobile/src/features/service-visit/service-visit.types.ts`. Today that list has nine steps: arrival, machine scan, before photos, drink count, inventory audit, client delivery, machine refill, after-service photo, review. `AGENTS.md` still says eight. Do not delete a step to make the count match the doc.

`transitionToNextStep` in `apps/mobile/src/features/service-visit/state/service-visit.transitions.ts` is the gate. It throws unless the visit is `in_progress` and `currentStep` is the step being completed. Completing a later step directly, or stopping calling this function, is a blocker. A new step is inserted at the real position, stays `locked` until the previous step completes, and is saved with `saveServiceVisit` before any network call so a killed app resumes mid-visit.

Distance math is `distanceMeters` and `checkGeofences` in `packages/types/src/geofence.ts`. Clock-in, clock-out, and arrival stay outside components. Arrival records `geofence` or `manual_override`. Override without a stored reason is a blocker. Time entries use `is_geofence_override` and `override_reason` the same way. Do not turn the fence into a warning that still lets the action through.

Cup counts are monotonic per machine. `apps/mobile/src/features/service-visit/meter-reading.service.ts` rejects a running total lower than the previous reading, and the database check does the same. Removing either side is a blocker. The first reading for a machine may use that running total as the archive total. A later reading adds only the non-negative difference.

Before photos require both kinds in `BEFORE_PHOTO_KINDS`: `exterior` and `interior_hopper`. The after-service photo and the signature stay mandatory. A failed upload must not trap the tech on the step. Save the visit locally first, then queue or retry the file. Dropping the photo requirement, or blocking the rest of the visit on the network, is a blocker.

A field mutation (photo, meter, clock event, step completion, inventory count) writes locally first. A new call that only hits Supabase and fails when offline is a blocker. Follow the local-save-then-sync path the changed step already uses. Do not add a second offline stack.

Par quantity, unit conversion, and geofence checks stay in pure functions, not in JSX.
