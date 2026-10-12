---
applyTo: "packages/types/src/inventory.ts,packages/types/src/inventory-movement.ts,packages/types/src/client-reserve.ts,packages/types/src/units.ts,apps/web/src/lib/inventory/**,apps/web/src/app/dashboard/inventory/**,apps/web/src/**/*.tsx,apps/web/src/**/*.css"
---

# Domain logic and admin UI

Par level, yield, FIFO, shrinkage, PPM, and unit conversion are pure functions. `normalizeInventoryQuantity` in `packages/types/src/inventory.ts` is the pattern. Math inlined in a component is a fix: move it to a pure module. Flag a new or changed pure function that has no unit test. This repo has no test script, so do not add a test runner unless the task asks for one.

Do not hand-edit `packages/types/src/database.ts`.

Admin UI colors come from the tokens in `apps/web/src/app/globals.css`: `espresso`, `crema`, `latte`, `copper`, `steam`. A new hex in a component is a fix unless the change also adds a token.
