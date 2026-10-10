# Changelog

## 1.0.0

### Added

- Initial release of the web administration dashboard and driver mobile app.

#### Mobile app

- Driver authentication and role-based access.
- Clock-in and clock-out with location checks and selfie capture.
- Assigned daily routes, stop details, and map navigation.
- Service visit arrival checks with geofence validation.
- QR scanning to identify and validate the selected machine.
- Machine digital passport with machine information.
- Before-service and after-service photo capture.
- Optional drink count recording.
- Client reserve inventory counting with case and loose-unit entry.
- Previous client reserve balances for inventory comparison.
- Stock delivery recording from driver inventory to client reserve.
- Machine refill recording from client reserve inventory.
- Service visit summary and completion.
- Technical issue reporting during service visits.
- Local service visit persistence, recovery, and synchronization.
- Driver location tracking while clocked in.

#### Web administration

- Admin authentication, password recovery, and role-based access.
- User creation, profile updates, role changes, and account activation controls.
- Daily route management and driver assignments.
- Reusable route templates and schedule exceptions.
- Warehouse and customer machine management.
- Live fleet map with realtime driver location updates.
- Time entry listing, attendance review, and time clock settings.
- Technical issue management with technician assignment and status updates.
- Service visit history and visit details.
- Inventory balance views and movement history.
- Warehouse stock transfers.
- Inventory reconciliation and reconciliation history.

#### Inventory and client communication

- Inventory tracking across warehouses, drivers, client reserves, and machines.
- Product packaging configuration and normalization into base units.
- Inventory movement validation and an immutable movement ledger.
- Service completion email integration with before/after photo links and a
  client satisfaction survey.
- Client satisfaction survey with an optional Google review prompt.

### Fixed

- [List the fixes included.]

### Deployment notes

- Apply the database migrations included in this release to the target Supabase project.
- Configure web and mobile environment variables for the target environment.
- Deploy the complete-service-visit Supabase Edge Function and configure its required secrets.
- Configure Supabase authentication URLs for the deployed web app.
- Configure Resend with a verified sending domain for client service emails.
