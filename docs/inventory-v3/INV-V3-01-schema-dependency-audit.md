# INV-V3-01 — Inventory V3 Schema & Dependency Audit

**Project:** BrewTracker  
**Story:** INV-V3-01  
**Type:** Technical analysis / architecture  
**Branch:** `INV-V3-01`  
**Target branch:** `dev`  
**Status:** Audit completed — implementation pending  
**Scope:** Development environment only  
**Runtime changes:** None  
**Database changes:** None

---

## 1. Executive Summary

BrewTracker Inventory V3 redesigns the existing service visit and inventory workflow to support multiple coffee machines at one client location while simplifying stock tracking.

The current implementation assumes that a route stop represents one machine service. This assumption exists across the database schema, PostgreSQL RPCs, mobile application, web route builder, photo and signature persistence, and the service completion Edge Function.

The V3 architecture introduces a clear separation between:

1. **Client-level operations:** Reserve stock counting, product delivery, post-delivery stock reference and client signature.
2. **Machine-level operations:** QR verification, before/after photos, conditional Drink Count and machine service outcome.

Machine refilling becomes a confirmation-only activity. The system will no longer record individual products or quantities placed inside coffee machines.

This audit identifies the required database and application changes, security considerations, migration dependencies and recommended implementation sequence.

### Audit outcome

- The existing database supports multiple machines belonging to one client.
- The current route stop model supports only one directly assigned machine.
- Client reserve snapshots and deliveries are unnecessarily coupled to a machine.
- Existing machine refill records and inventory movements are incompatible with the V3 confirmation-only model.
- Photo uniqueness prevents recording the same photo type for multiple machines in one visit.
- Existing signature storage can be reused after removing machine-level validation.
- Several PostgreSQL functions, RLS policies and application components require changes.
- Existing inventory movement immutability and packaging conversion rules must be preserved.
- An additive, backward-compatible migration is recommended before retiring legacy structures.

No database or application changes were performed during INV-V3-01.

---

## 2. Business Requirements

### 2.1 Client and location model

One client represents one physical service location.

A client may have multiple coffee machines assigned to it.

V3 will not introduce a separate `client_locations` table.

The existing `clients` and `machines` relationship will remain:

```text
clients
   |
   +-- machine A
   |
   +-- machine B
   |
   +-- machine C
```

Each machine continues to belong to one client through `machines.client_id`.

### 2.2 Route stop model

One route stop represents one visit to one client.

A stop may include multiple assigned machines.

Example:

```text
Route: Monday Delivery Route
  |
  +-- Stop 1: Client A
  |     |
  |     +-- Machine A1
  |     +-- Machine A2
  |
  +-- Stop 2: Client B
        |
        +-- Machine B1
        +-- Machine B2
        +-- Machine B3
```

The driver performs the client-level inventory operations once and services each assigned machine separately.

### 2.3 Agreed service workflow

**Step 1 — Arrival**

The driver arrives at the client location.

Existing route assignment and geofence requirements remain applicable.

**Step 2 — Count client reserve**

The driver counts the visible reserve inventory stored at the client location.

This count is performed once per client visit, regardless of how many machines are present.

**Step 3 — Client delivery**

The driver confirms products delivered from the vehicle to the client's reserve stock.

The system records the actual delivered quantities and creates the corresponding driver-to-client inventory movements.

A delivery containing zero quantities is allowed.

**Step 4 — Service assigned machines**

For every machine assigned to the stop, the driver:

- Scans or verifies the machine QR code.
- Captures the required before-service photos.
- Records Drink Count when required.
- Selects the machine service outcome.
- Captures the required after-service photos.

The supported service outcomes are:

| Outcome | Meaning |
|---|---|
| `refilled` | The machine was refilled |
| `not_needed` | Refilling was unnecessary |
| `unable` | The driver could not complete the machine service |

An `unable` outcome requires a reason or explanatory note.

No product quantities are entered for machine refilling.

**Step 5 — Client confirmation**

After the assigned machines have been processed, the driver captures one client signature for the entire visit.

**Step 6 — Complete service visit**

The application validates the visit, synchronizes pending records and completes the stop.

The completion workflow sends the client email through the existing Resend integration.

Offline completion and subsequent synchronization must remain supported.

---

## 3. Inventory Accounting Rules

### 3.1 Inventory ownership

V3 maintains stock tracking at these locations:

- Warehouse
- Driver / delivery vehicle
- Client reserve

Machine internal stock is not tracked.

### 3.2 Client delivery movements

A confirmed positive delivery creates an inventory movement:

```text
Driver inventory
      |
      | client_delivery
      v
Client reserve inventory
```

The movement must retain the product, normalized quantity, packaging snapshot, source visit, stop and responsible user information required for auditability.

Zero-quantity deliveries must not create positive stock movements.

### 3.3 Client reserve after-service reference

The reference balance is calculated as:

```text
Client reserve reference after visit
    = Visible reserve count before service
    + Confirmed client delivery
```

Example:

```text
Visible reserve count:  8 bags
Delivered:              6 bags
--------------------------------
Reference after visit: 14 bags
```

This is a **calculated reference**, not a physically verified closing stock count.

The system must not infer machine consumption from this value.

### 3.4 Machine refill accounting

V3 will not record:

- Products placed inside machines.
- Quantities used to refill machines.
- Driver-to-machine stock movements.
- Machine inventory balances.
- Calculated machine consumption based on refill quantities.

Machine servicing will be represented by operational confirmation records.

### 3.5 Packaging precision

Existing packaging conversion rules must be preserved.

Required product attributes include:

- `base_unit`
- `issue_unit`
- `units_per_issue_unit`
- `package_description`
- `allows_loose_units`

Inventory calculations continue to use normalized base units and the existing three-decimal precision requirements.

Example:

```text
Base unit: bag
Issue unit: case
Units per issue unit: 6

2 cases = 12 bags
```

Packaging metadata must remain available on historical delivery records.

---

## 4. Existing Database Schema Audit

### 4.1 `clients`

**Current purpose:** Stores client locations and contact information.

Relevant fields include:

- `id`
- `name`
- `address`
- `city`
- `region`
- Location coordinates
- Geofence configuration

**V3 decision:** Retain the existing table.

No separate client location entity is required.

### 4.2 `machines`

**Current purpose:** Stores machines assigned to clients.

Relevant fields include:

- `id`
- `client_id`
- `name`
- `model`
- `serial_number`
- `qr_code`
- `status`

The existing client relationship already permits multiple machines per client.

**V3 decision:** Retain the table and its client relationship.

### 4.3 `routes`

**Current purpose:** Stores route assignments.

Relevant fields include:

- `id`
- `driver_id`
- `warehouse_id`
- `route_date`
- `status`

**V3 decision:** Preserve the existing route model.

### 4.4 `stops`

**Current purpose:** Stores route stops.

Relevant fields include:

- `id`
- `route_id`
- `client_id`
- `machine_id`
- `sequence_number`
- `status`
- `arrived_at`
- `completed_at`
- `drink_count_required`

**Current limitation:** The stop has one machine assignment.

**V3 decision:**

- Retain the stop as the client-visit entity.
- Introduce a separate machine assignment relationship.
- Move machine-specific Drink Count requirements to the machine assignment or machine service level.
- Retire the legacy single-machine fields after application migration and dependency verification.

### 4.5 `client_reserve_snapshots`

**Current purpose:** Stores client reserve counts and calculated after-service references.

Relevant fields include:

- `id`
- `source_visit_id`
- `client_id`
- `stop_id`
- `machine_id`
- `stage`
- `recorded_by`
- `recorded_at`

Current uniqueness:

```sql
UNIQUE (source_visit_id, stage)
```

**Current limitation:** `machine_id` is mandatory.

**V3 decision:**

- Keep the existing snapshot structure and uniqueness model.
- Associate snapshots with the client visit rather than an individual machine.
- Remove the mandatory machine association after compatibility checks.

### 4.6 `client_reserve_snapshot_items`

**Current purpose:** Stores product quantities and packaging details for reserve snapshots.

Existing uniqueness:

```sql
UNIQUE (snapshot_id, product_id)
```

**V3 decision:** Preserve the existing item structure, quantity checks and packaging snapshots.

### 4.7 `client_deliveries`

**Current purpose:** Stores confirmed client deliveries.

Relevant fields include:

- `id`
- `source_visit_id`
- `reserve_snapshot_id`
- `client_id`
- `stop_id`
- `machine_id`
- `delivered_by`
- `confirmed_at`

Current uniqueness:

```sql
UNIQUE (source_visit_id)
```

**Current limitation:** `machine_id` is mandatory.

**V3 decision:**

- Keep one delivery record per client visit.
- Preserve the link to the reserve snapshot.
- Remove the mandatory machine association.
- Preserve delivery identity and idempotency.

### 4.8 `client_delivery_items`

**Current purpose:** Stores individual delivered products.

Relevant fields include:

- `delivery_id`
- `product_id`
- `reserve_before_quantity`
- `par_level`
- `recommended_quantity`
- `actual_quantity`
- `normalized_unit`
- Packaging snapshot fields
- `movement_id`

Existing uniqueness:

```sql
UNIQUE (delivery_id, product_id)
```

Existing checks prevent negative quantities.

**V3 decision:**

Retain the table and its product-level audit information.

The recommendation based on par level should be advisory rather than a strict limitation preventing otherwise authorized deliveries.

### 4.9 `machine_refills`

**Current purpose:** Stores machine refill events.

Relevant fields include:

- `source_visit_id`
- `client_id`
- `stop_id`
- `machine_id`
- `refilled_by`
- `confirmed_at`

Existing uniqueness:

```sql
UNIQUE (source_visit_id)
```

**Current limitation:** The model assumes one refill event per visit and supports quantity-based machine refilling.

**V3 decision:** Replace with machine service records.

Retire only after checking dependencies, preserving any required historical information and confirming the development reset plan.

### 4.10 `machine_refill_items`

**Current purpose:** Stores product-level machine refill quantities and reasons.

Relevant fields include:

- `machine_refill_id`
- `product_id`
- `actual_quantity`
- Packaging snapshots
- `movement_id`
- `zero_reason`
- `zero_reason_note`

**V3 decision:** Retire with the legacy machine refill workflow.

Machine-level service reasons will be represented by the new service outcome model.

### 4.11 `inventory_locations`

**Current purpose:** Represents physical inventory locations.

Existing location types:

```text
warehouse
driver
client_reserve
machine
```

**V3 decision:**

Continue using warehouse, driver and client reserve locations.

Stop creating or using machine inventory locations for new V3 workflows.

Removal of the legacy enum value and machine-related constraints must be evaluated separately because PostgreSQL enum changes and historical dependencies require careful handling.

### 4.12 `inventory_movements`

**Current purpose:** Stores immutable inventory transactions.

Existing movement types include:

```text
warehouse_issue
client_delivery
machine_refill
warehouse_return
```

**V3 decision:**

Preserve warehouse and client delivery movement behavior.

Stop generating `machine_refill` movements.

Do not delete historical movements or weaken immutability protections as part of the initial additive migration.

---

## 5. New V3 Database Entities

The following tables are proposed additions. Their exact DDL, constraints, indexes and RLS policies belong to INV-V3-02.

### 5.1 `stop_machines`

**Purpose:** Assign multiple machines to a route stop.

Proposed fields:

| Field | Type | Purpose |
|---|---|---|
| `id` | UUID | Assignment identifier |
| `stop_id` | UUID | Parent route stop |
| `machine_id` | UUID | Assigned machine |
| `sequence_number` | Integer | Machine service order |
| `drink_count_required` | Boolean | Whether Drink Count is mandatory |
| `created_at` | Timestamptz | Creation timestamp |

Proposed constraints:

- Foreign key to `stops`.
- Foreign key to `machines`.
- Unique `(stop_id, machine_id)`.
- Valid machine service sequence.
- Assigned machine must belong to the stop's client.

The machine/client ownership requirement should be enforced by database-side validation, not solely by the mobile or web UI.

### 5.2 `machine_service_records`

**Purpose:** Record the outcome of servicing each assigned machine.

Proposed fields:

| Field | Type | Purpose |
|---|---|---|
| `id` | UUID | Service record identifier |
| `source_visit_id` | Text | Offline visit identity |
| `stop_machine_id` | UUID | Assigned machine |
| `serviced_by` | UUID | Field staff member |
| `outcome` | Text or enum | Service result |
| `unable_reason` | Text, nullable | Reason when unable |
| `confirmed_at` | Timestamptz | Confirmation timestamp |
| `created_at` | Timestamptz | Creation timestamp |
| `updated_at` | Timestamptz | Update timestamp |

Supported outcomes:

```text
refilled
not_needed
unable
```

Required behavior:

- One confirmed service outcome per assigned machine per visit.
- `unable` requires an explanation.
- No per-product machine refill quantities.
- No machine inventory movements.
- Repeated identical submissions must not create duplicate service records.
- Conflicting retries must be rejected or handled by an explicitly designed correction workflow.

QR verification and Drink Count persistence must be integrated with the existing service visit workflow. The exact relationship to existing meter-reading and QR data structures must be confirmed during implementation.

---

## 6. Photo Storage Audit

### 6.1 Existing table

`service_visit_photos`

Relevant fields:

- `id`
- `uploaded_by`
- `source_visit_id`
- `stop_id`
- `machine_id`
- `stage`
- `kind`
- `storage_path`
- `captured_at`
- `created_at`

### 6.2 Existing constraint

```sql
UNIQUE (source_visit_id, stage, kind)
```

This prevents storing the same photo stage and kind for two different machines in one visit.

### 6.3 Required V3 constraint

Proposed replacement:

```sql
UNIQUE (
  source_visit_id,
  machine_id,
  stage,
  kind
)
```

The mobile photo persistence and retry logic must use the same conflict identity.

Before changing the constraint, verify that the current photo kinds are intentionally limited to one photo per machine, stage and kind. If multiple photos of the same kind are required, a separate photo identity strategy will be needed.

### 6.4 Security requirements

Photo validation must verify:

- The authenticated user has permission to service the route.
- The stop belongs to the assigned route.
- The machine is assigned to that stop.
- The machine belongs to the stop's client.
- The photo is associated with the correct visit and machine.

Existing storage bucket policies and photo upload behavior must be reviewed before deployment.

---

## 7. Signature Storage Audit

### 7.1 Existing table

`service_visit_signatures`

Relevant fields:

- `id`
- `signed_by`
- `source_visit_id`
- `stop_id`
- `client_id`
- `machine_id`
- `storage_path`
- `signed_at`
- `created_at`
- `updated_at`

### 7.2 Existing uniqueness

```sql
UNIQUE (source_visit_id)
```

This is already compatible with one signature per client visit.

### 7.3 Current validation

The existing `validate_service_visit_signature()` trigger verifies:

- Signature identity cannot be reassigned on update.
- The signature client matches the stop client.
- The signature machine matches `stops.machine_id`.
- The machine belongs to the client.

### 7.4 Required V3 behavior

- Preserve one signature per visit.
- Preserve client and stop validation.
- Preserve signature ownership and immutable identity.
- Remove machine-specific validation.
- Preserve legitimate offline synchronization retries.
- Keep field staff authorization through RLS.

The preferred final structure removes `machine_id` from the signature table.

The migration must first account for existing application code that still supplies the field.

The relationship between `source_visit_id` and `stop_id` must be validated by the visit persistence/completion contract or an appropriate database-side mechanism.

---

## 8. PostgreSQL RPC Dependency Audit

### 8.1 Functions to preserve

The following existing functions remain relevant to V3:

- `create_driver_inventory_reconciliation`
- `create_inventory_location_on_driver_role`
- `get_driver_inventory_expected_balance`
- `prevent_inventory_movement_delete`
- `prevent_inventory_movement_update`
- `prevent_inventory_product_packaging_change`
- `record_warehouse_driver_transfer`

Their existing security, quantity validation and inventory behavior must be preserved.

### 8.2 Functions requiring modification or review

| Function | Required action |
|---|---|
| `create_inventory_location_for_entity` | Stop automatic machine location creation |
| `get_inventory_location_id` | Review machine location handling |
| `get_previous_client_reserve_balance` | Preserve client-level reserve calculations |
| `save_client_reserve_before_service_v2` | Remove machine dependency |
| `save_client_delivery` | Remove machine dependency; improve retries |
| `save_client_reserve_after_service` | Remove machine dependency |
| `validate_inventory_movement_path` | Remove machine refill path for V3 writes |

### 8.3 Legacy functions to retire

After dependency cleanup:

- `save_client_reserve_before_service`
- `save_machine_refill`
- `was_machine_refilled`

These functions must not be removed while supported mobile builds or pending offline visits still depend on them.

### 8.4 Reserve count RPC

Current function:

```text
save_client_reserve_before_service_v2
```

Confirmed behavior includes:

- Authentication checks.
- Driver and route validation.
- Stop/client/machine validation.
- Product validation.
- Packaging validation.
- Duplicate product rejection.
- Advisory locking.
- Retry identity checks.
- Nonnegative quantity enforcement.

**V3 requirements:**

Preserve authentication, assignment, packaging, advisory locking and idempotency while changing the record ownership to the client visit.

### 8.5 Client delivery RPC

Current function:

```text
save_client_delivery
```

Confirmed behavior includes:

- Authentication and route checks.
- Reserve snapshot dependency.
- Packaging conversion.
- Client product configuration validation.
- Client delivery record creation.
- Positive-quantity inventory movement creation.

**Identified issues:**

1. The current function is not safely idempotent for all completed deliveries because existing movement-linked items can cause retry rejection.
2. Delivery is restricted by positive par-level recommendation in cases where V3 should treat the recommendation as advisory.
3. Delivery is unnecessarily tied to one machine.

**V3 requirements:**

- One delivery per visit.
- Safe identical retries.
- Reject conflicting payloads.
- Preserve immutable inventory movements.
- Support zero deliveries.
- Preserve normalized quantities and packaging snapshots.
- Retain client/product authorization and stock validation.

The implementation must verify driver inventory availability and concurrency behavior before finalizing the new RPC.

### 8.6 After-service reference RPC

Current function:

```text
save_client_reserve_after_service
```

Confirmed calculation:

```text
Reserve after reference
    = Reserve before count
    + Confirmed delivery
```

**V3 requirements:**

Preserve this calculation and its visit-level idempotency.

Remove the machine association.

The resulting value must not be presented as measured machine consumption or physically verified closing inventory.

### 8.7 Machine refill RPC

Current function:

```text
save_machine_refill
```

The existing implementation records product-level machine refills and may create driver-to-machine inventory movements.

**V3 replacement:**

Introduce a machine service confirmation RPC or equivalent secure database-side persistence operation.

It must validate the assigned stop/machine relationship and save the service outcome without stock movements.

---

## 9. Database Constraints and Trigger Audit

### 9.1 Constraints to preserve

- `client_deliveries_source_visit_id_key`
- `client_delivery_items_unique_product`
- `client_reserve_snapshots` visit/stage uniqueness
- Existing quantity and packaging constraints
- Inventory movement foreign keys
- Existing inventory movement immutability protections
- `service_visit_signatures_unique_visit`

### 9.2 Constraints requiring changes

- `service_visit_photos_unique_visit_stage_kind`
- Machine-related non-null requirements on client-level records
- Legacy single-machine stop dependencies
- Legacy machine inventory location constraints, if machine locations are retired

### 9.3 Inventory movement triggers

Confirmed triggers:

```text
prevent_inventory_movement_delete
prevent_inventory_movement_update
validate_inventory_movement_path
```

The first two must remain active.

The movement path validator must continue enforcing valid warehouse, driver and client reserve transfers.

Machine refill paths must not be used by new V3 operations.

### 9.4 Signature validation trigger

Confirmed trigger function:

```text
validate_service_visit_signature()
```

It currently compares the signature machine to `stops.machine_id`.

This function must be updated for client-level signatures.

The new function must continue protecting signature identity and client/stop consistency.

---

## 10. Row-Level Security Audit

### 10.1 Existing role model

BrewTracker uses role-based access including:

- Driver
- Technician
- Manager
- CEO

Existing helper functions include route assignment, role and regional checks.

### 10.2 Stops

Existing policies support:

- CEO access.
- Manager access within the assigned region.
- Field staff access to assigned routes.

**V3 requirement:** Preserve the existing role boundaries and apply equivalent authorization to `stop_machines`.

### 10.3 Client reserve snapshots

Existing driver read policy checks whether the driver has a route containing a stop for the snapshot's client.

This may permit reading snapshots from other visits to the same client.

**Recommended improvement:**

Scope driver access through the snapshot's actual `stop_id` and the assigned route.

Preserve manager regional access and CEO access.

### 10.4 Inventory locations

The manager policy currently includes machine inventory locations.

**V3 requirement:**

Remove machine-specific access logic when machine inventory locations are retired.

Preserve warehouse, driver and client reserve visibility.

### 10.5 Inventory movements

Existing policies provide:

- CEO read access.
- Driver read access through driver inventory locations.
- Manager regional access through inventory location relationships.

**V3 requirement:**

Preserve access to valid warehouse and client reserve movements.

Review machine-related branches after legacy cleanup.

### 10.6 Machine refills

Existing driver read policies apply to:

```text
machine_refills
machine_refill_items
```

These policies become obsolete when the legacy tables are retired.

### 10.7 Service photos

Current policies allow:

- CEOs to manage photos.
- Drivers to manage photos they uploaded.
- Managers to manage photos associated with users in their region.

**V3 requirement:**

Strengthen validation so an uploader cannot associate a photo with an unauthorized stop or machine merely by setting their own `uploaded_by` value.

### 10.8 Service signatures

Existing policies cover:

- CEO management.
- Field staff insertion on assigned routes.
- Field staff reading/updating their own signatures.
- Manager regional management.

**V3 requirement:**

Preserve this access model and remove the machine dependency from signature validation.

### 10.9 New table policies

Both new tables require explicit RLS:

```text
stop_machines
machine_service_records
```

Required access model:

| Role | Stop machine assignments | Machine service records |
|---|---|---|
| Driver / Tech | Read assigned stops | Read/write authorized visit records |
| Manager | Manage within region | Read/manage within authorized region |
| CEO | Full authorized access | Full authorized access |

Exact write permissions, service corrections and administrative override behavior must be defined in INV-V3-02.

Security-definer functions must explicitly validate authorization rather than relying solely on caller-side UI checks.

---

## 11. Mobile Application Dependency Audit

The existing Expo mobile application uses a single-machine service visit model.

### 11.1 Service visit types

Relevant module:

```text
service-visit.types.ts
```

Current model includes a single `machineId`.

**V3 requirement:**

Introduce assigned machine state and per-machine progress while preserving client-level inventory state.

### 11.2 Client reserve count

Relevant component:

```text
InventoryAuditStep.tsx
```

**V3 requirement:**

Perform one reserve count per client visit.

Preserve product quantities, packaging conversion, offline persistence and validation.

### 11.3 Client delivery

Relevant component:

```text
RestockDropStep.tsx
```

**V3 requirement:**

Perform one client delivery per visit.

Preserve packaging inputs and support zero quantities.

Prevent empty or invalid quantity submissions.

### 11.4 Machine service

Relevant hook:

```text
useMachineRefillStep.ts
```

Current implementation calls:

```text
save_machine_refill
save_client_reserve_after_service
```

**V3 requirement:**

Replace quantity-based refill behavior with machine outcome confirmation.

The after-service reserve reference should remain a client-level calculation.

### 11.5 After-service reserve persistence

Relevant module:

```text
client-reserve-after.service.ts
```

Current implementation requires a machine ID.

**V3 requirement:**

Remove the machine dependency.

### 11.6 Completion validation

Relevant module:

```text
state/service-visit.completion.ts
```

Current implementation requires synchronized machine refill and reserve-after state.

**V3 requirement:**

Validate completion of every assigned machine, required photos, conditional Drink Count, client-level inventory steps and signature.

### 11.7 Signature capture

Relevant component:

```text
SummaryStep.tsx
```

**V3 requirement:**

Preserve one signature capture after the machine service workflow.

The signature must represent the entire client visit.

### 11.8 Offline synchronization

The application already supports locally persisted service visit state and retry synchronization.

**V3 requirements:**

- Persist the client visit and machine progress locally.
- Preserve all completed machine records after application restart.
- Resume partially completed visits.
- Avoid duplicate inventory movements.
- Avoid duplicate photo and signature records.
- Preserve local media until successful upload.
- Handle network loss during each workflow step.
- Reject conflicting retries safely.
- Avoid incorrectly marking an incomplete synchronization as successful.

A previously completed offline visit must remain recoverable after the application restarts.

---

## 12. Web Application Dependency Audit

### 12.1 Route builder

Relevant component:

```text
add-stop-form.tsx
```

Current behavior selects one machine for a stop.

**V3 requirement:**

Allow managers and CEOs to select multiple machines for the same client stop.

### 12.2 Machine assignment validation

The web application must ensure:

- All selected machines belong to the chosen client.
- A machine is not assigned twice to the same stop.
- Machine service order is valid.
- Drink Count requirements can be configured per machine.
- Existing route access and regional authorization are preserved.

### 12.3 Reporting

Existing inventory and service reports may reference:

```text
machine_refills
machine_refill_items
inventory_movements.machine_id
stops.machine_id
```

These dependencies must be reviewed and updated as part of the reporting story.

Machine service outcomes must be reported separately from inventory delivery quantities.

---

## 13. Completion Edge Function Audit

Relevant function:

```text
supabase/functions/complete-service-visit/index.ts
```

### 13.1 Current dependencies

The existing completion function assumes:

- One machine belongs to the stop.
- The submitted machine matches `stops.machine_id`.
- The signature belongs to the same machine.
- Machine refill data exists.
- Machine refill items can be included in the completion summary.

### 13.2 Required V3 changes

The completion function must:

1. Validate the authenticated user and assigned route.
2. Validate the client and stop relationship.
3. Load all machines assigned to the stop.
4. Verify required service records for each machine.
5. Validate machine QR and photo requirements.
6. Validate conditional Drink Count requirements.
7. Validate one client-level signature.
8. Verify required client-level inventory records.
9. Complete the stop only when all mandatory steps are satisfied.
10. Send the client completion email.

### 13.3 Email summary

The existing Resend integration should remain.

The email should describe:

- Client visit details.
- Serviced machines.
- Per-machine service outcomes.
- Before/after photos.
- Client delivery information where applicable.
- Existing survey link behavior.

Machine refill quantities must no longer be presented as part of the new V3 workflow.

### 13.4 Completion idempotency

The Edge Function must tolerate repeated completion requests without creating duplicate completion side effects.

The implementation must explicitly address repeated email delivery and partial failure scenarios.

A retry after successful database completion must not silently produce inconsistent records.

---

## 14. Migration Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Existing mobile build calls removed RPC | High | Preserve compatibility until migration |
| Offline visit retries after schema change | High | Version-aware persistence and retry testing |
| Duplicate inventory movements | High | Database-level idempotency and locking |
| Incorrect machine/client association | High | Server-side validation |
| Photo uniqueness conflicts | High | Update constraint and mobile conflict key together |
| Signature trigger rejects client-level signature | High | Refactor trigger with schema change |
| Edge Function rejects multi-machine stop | High | Deploy compatible completion logic |
| Inventory history lost during cleanup | High | Preserve or explicitly approve dev-only reset |
| Manager accesses another region | High | Region-aware RLS |
| Incomplete machine service marked complete | High | Server-side completion gating |
| Duplicate completion email | Medium | Completion-side effect idempotency |
| Packaging conversion regression | High | Preserve normalization and precision tests |

---

## 15. Migration Strategy

### 15.1 Recommended approach

Use an additive, staged migration.

Do not immediately remove existing tables, columns or RPCs that may be required by current mobile builds or pending offline visits.

### 15.2 Phase A — Add new structures

- Create `stop_machines`.
- Create `machine_service_records`.
- Add required indexes and constraints.
- Add RLS policies.
- Introduce V3 RPCs with explicit authorization and idempotency.
- Prepare compatible photo and signature persistence changes.

### 15.3 Phase B — Update applications

- Refactor mobile service visit state.
- Refactor client reserve count and delivery.
- Introduce multi-machine service flow.
- Update photo synchronization.
- Update signature persistence.
- Update web route builder.
- Update completion Edge Function.

### 15.4 Phase C — Validate

- Test single-machine visits.
- Test multi-machine visits.
- Test zero deliveries.
- Test packaging conversion.
- Test QR mismatch.
- Test conditional Drink Count.
- Test offline completion and application restart.
- Test duplicate and conflicting retries.
- Test manager region boundaries.
- Test client signature and email completion.

### 15.5 Phase D — Retire legacy structures

After all supported application paths are migrated:

- Retire machine refill RPCs.
- Retire legacy machine refill tables.
- Remove obsolete machine-specific client-level fields.
- Stop using machine inventory locations.
- Stop using machine refill movement types.
- Update reports and generated database types.

PostgreSQL enum cleanup and historical data handling must be evaluated separately.

---

## 16. Development Environment Reset

A controlled reset of development test data may be performed after explicit approval.

### 16.1 Data that must be preserved

- Users and authentication records.
- Clients.
- Machines.
- Inventory products.
- Product packaging configuration.
- Warehouses.
- Relevant operational configuration.

### 16.2 Candidate data for controlled cleanup

Subject to a complete foreign-key and dependency review:

- Test client reserve snapshots.
- Test client deliveries.
- Test machine refills.
- Test machine refill items.
- Test service visit records.
- Test service visit photos and signatures.
- Test inventory movements associated with the reset scope.

### 16.3 Reset safeguards

Before executing cleanup:

1. Confirm the connected Supabase project is development.
2. Export or back up relevant data.
3. Identify inbound foreign keys and deletion order.
4. Review triggers and immutable movement protections.
5. Review storage objects and orphaned media.
6. Identify active offline visits and supported app versions.
7. Prepare a transactionally safe cleanup script where applicable.
8. Obtain explicit approval.
9. Verify preserved master data after execution.

**No reset SQL was executed during INV-V3-01.**

---

## 17. Implementation Stories

| Story | Scope | Main deliverable |
|---|---|---|
| INV-V3-01 | Schema and dependency audit | This document |
| INV-V3-02 | Database and RPC implementation | Schema, RPCs, RLS and migrations |
| INV-V3-03 | Client inventory workflow | Shared reserve count and delivery |
| INV-V3-04 | Machine service workflow | Confirmation-only machine servicing |
| INV-V3-05 | Multi-machine routing | Stop machine assignments and route builder |
| INV-V3-06 | Completion workflow | Photos, signature, email and offline sync |
| INV-V3-07 | Reporting and QA | Updated reporting and end-to-end validation |

---

## 18. INV-V3-02 Acceptance Criteria

INV-V3-02 should not be considered complete until:

- [ ] New V3 tables exist with appropriate constraints and indexes.
- [ ] Each machine assignment belongs to the stop's client.
- [ ] Machine service outcomes are persisted without stock movements.
- [ ] Client-level reserve and delivery operations are supported.
- [ ] Zero deliveries are supported.
- [ ] Packaging conversion and precision remain correct.
- [ ] Identical RPC retries are safe.
- [ ] Conflicting retries cannot silently alter committed inventory.
- [ ] Inventory movements remain immutable.
- [ ] Photo and signature migration compatibility is addressed.
- [ ] New RLS policies enforce role, route and regional access.
- [ ] Existing supported application paths remain compatible during transition.
- [ ] Database types are regenerated when the schema is finalized.
- [ ] Migration and rollback procedures are documented.
- [ ] Automated or repeatable SQL tests cover critical security and inventory behavior.
- [ ] Changes are validated in the development Supabase project before any production rollout.

---

## 19. Outstanding Implementation Decisions

The following details must be resolved during INV-V3-02 or the corresponding application stories:

1. Whether the old `stops.machine_id` remains temporarily populated for legacy visits or is migrated through a compatibility layer.
2. Whether `source_visit_id` continues as the canonical offline visit identity for all client-level and machine-level records.
3. How existing machine QR verification and Drink Count records relate to the new `stop_machines` entity.
4. Whether machine service outcomes are immutable after confirmation or support an authorized correction process.
5. How old pending offline visits are distinguished from V3 visits.
6. How completion email idempotency is implemented.
7. How legacy machine inventory locations and enum values are retired safely.
8. Whether any historical records must be preserved before the development test-data reset.
9. The final migration rollback and deployment ordering.
10. The exact automated test coverage for RLS and RPC authorization.

These decisions must not be silently assumed in implementation.

---

## 20. Definition of Done — INV-V3-01

- [x] Reviewed current client, machine, route and stop relationships.
- [x] Reviewed reserve snapshot and client delivery structures.
- [x] Reviewed machine refill tables and movement dependencies.
- [x] Reviewed relevant PostgreSQL inventory RPCs.
- [x] Reviewed database constraints and uniqueness rules.
- [x] Reviewed inventory triggers.
- [x] Reviewed existing RLS policies.
- [x] Reviewed signature validation trigger.
- [x] Identified photo and signature changes.
- [x] Identified mobile application dependencies.
- [x] Identified web route builder dependencies.
- [x] Identified completion Edge Function dependencies.
- [x] Defined the proposed V3 architecture.
- [x] Documented migration risks and implementation sequence.
- [x] Confirmed no runtime or database changes were required for the audit story.

**Final result:** INV-V3-01 establishes the technical baseline for Inventory V3 implementation. The next story, INV-V3-02, will translate these findings into reviewed, versioned database migrations, RPC contracts, security policies and verification tests.

---

## 21. Final Architecture Decision

BrewTracker V3 will use:

**One client → multiple machines → one route stop per client visit → one reserve count → one client delivery → individual machine service confirmations → one client signature → one completion email.**

Inventory quantities will be tracked between warehouses, drivers and client reserves.

Machine servicing will be tracked as operational events, not product-level stock movements.

This separation is the foundation for the V3 database and application refactor.